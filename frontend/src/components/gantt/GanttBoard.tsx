import { useRef, useState, useEffect, useCallback } from 'react';
import { PlanningOrder, LineConfig, LineId, UserRole } from '../../types';

interface Props {
  orders: PlanningOrder[];
  lineConfigs: LineConfig[];
  userRole: UserRole;
  onUpdateOrder: (order: PlanningOrder) => void;
  onOrderClick: (order: PlanningOrder) => void;
}

const LINES: { id: LineId; label: string }[] = [
  { id: 'smt4', label: 'SMT4' },
  { id: 'qlab', label: 'QLab' },
  { id: 'xray', label: 'X-ray' },
];

const LABEL_W = 110;
const ROW_H = 72;
const HEADER_H = 52;
const TIMELINE_HOURS = 72;
const SNAP_MIN = 15;

function getMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d;
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
}

function fmtDayLabel(d: Date): string {
  return d.toLocaleDateString('lt-LT', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

function getDurationHours(order: PlanningOrder, lineConfig: LineConfig): number {
  return (order.quantity * lineConfig.cycleTimeSeconds) / 3600;
}

export default function GanttBoard({ orders, lineConfigs, userRole, onUpdateOrder, onOrderClick }: Props) {
  const [pph, setPph] = useState(80); // pixels per hour
  const [now, setNow] = useState(new Date());
  const timelineStart = useRef(getMidnight()).current;
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragDataRef = useRef<{ orderId: string; offsetX: number } | null>(null);

  const canDrag = userRole === 'LOG';
  const totalWidth = TIMELINE_HOURS * pph;

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(tick);
  }, []);

  // Scroll to current time - 2h on mount
  useEffect(() => {
    if (scrollRef.current) {
      const offsetHours = (now.getTime() - timelineStart.getTime()) / 3600000 - 2;
      scrollRef.current.scrollLeft = Math.max(0, offsetHours * pph);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const xToTime = useCallback((rawX: number): Date => {
    const ms = (rawX / pph) * 3600000;
    const snapped = Math.round(ms / (SNAP_MIN * 60000)) * (SNAP_MIN * 60000);
    return new Date(timelineStart.getTime() + snapped);
  }, [pph, timelineStart]);

  const orderLeft = useCallback((order: PlanningOrder): number => {
    if (!order.startTime) return 0;
    return ((new Date(order.startTime).getTime() - timelineStart.getTime()) / 3600000) * pph;
  }, [pph, timelineStart]);

  const orderWidth = useCallback((order: PlanningOrder, lineId: LineId): number => {
    const lc = lineConfigs.find(l => l.id === lineId) ?? lineConfigs[0];
    return getDurationHours(order, lc) * pph;
  }, [pph, lineConfigs]);

  const redLineX = ((now.getTime() - timelineStart.getTime()) / 3600000) * pph;

  // Build hour tick data
  const ticks: { h: number; x: number; label: string; isDay: boolean }[] = [];
  for (let h = 0; h <= TIMELINE_HOURS; h++) {
    const t = new Date(timelineStart.getTime() + h * 3600000);
    const isDay = t.getHours() === 0;
    const showLabel = h % 2 === 0;
    ticks.push({
      h,
      x: h * pph,
      label: showLabel ? (isDay && h > 0 ? fmtDayLabel(t) : fmtTime(t)) : '',
      isDay,
    });
  }

  const handleDragStart = (e: React.DragEvent, order: PlanningOrder) => {
    if (!canDrag) { e.preventDefault(); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    dragDataRef.current = { orderId: order.id, offsetX };
    e.dataTransfer.setData('orderId', order.id);
    e.dataTransfer.setData('dragOffsetX', String(offsetX));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent, lineId: LineId) => {
    e.preventDefault();
    const orderId = e.dataTransfer.getData('orderId') || dragDataRef.current?.orderId;
    const offsetX = Number(e.dataTransfer.getData('dragOffsetX') ?? dragDataRef.current?.offsetX ?? 0);
    if (!orderId) return;
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const rowRect = e.currentTarget.getBoundingClientRect();
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const rawX = (e.clientX - rowRect.left) + scrollLeft - offsetX;
    const startTime = xToTime(Math.max(0, rawX)).toISOString();

    onUpdateOrder({ ...order, lineId, startTime });
    dragDataRef.current = null;
  };

  const zoom = (delta: number) => setPph(p => Math.min(400, Math.max(20, p + delta)));

  const lineConfig = (id: LineId) => lineConfigs.find(l => l.id === id) ?? lineConfigs[0];

  return (
    <div className="flex h-full">
      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex gap-2 z-30">
        <button onClick={() => zoom(-20)} className="w-8 h-8 bg-gray-800 border border-gray-600 rounded-lg text-white hover:bg-gray-700 flex items-center justify-center text-lg font-bold">−</button>
        <button onClick={() => zoom(20)} className="w-8 h-8 bg-gray-800 border border-gray-600 rounded-lg text-white hover:bg-gray-700 flex items-center justify-center text-lg font-bold">+</button>
      </div>

      {/* Label column */}
      <div className="shrink-0 bg-gray-900 border-r border-gray-700 z-10" style={{ width: LABEL_W }}>
        <div className="border-b border-gray-700" style={{ height: HEADER_H }} />
        {LINES.map(line => (
          <div
            key={line.id}
            className="flex items-center px-3 border-b border-gray-700 text-sm font-semibold text-gray-200"
            style={{ height: ROW_H }}
          >
            <span
              className="w-2 h-2 rounded-full mr-2 shrink-0"
              style={{ backgroundColor: lineConfig(line.id).cycleTimeSeconds < 35 ? '#22c55e' : lineConfig(line.id).cycleTimeSeconds < 50 ? '#eab308' : '#ef4444' }}
            />
            {line.label}
          </div>
        ))}
      </div>

      {/* Scrollable timeline */}
      <div ref={scrollRef} className="flex-1 overflow-x-auto relative">
        <div style={{ width: totalWidth, minWidth: totalWidth, position: 'relative' }}>
          {/* Time header */}
          <div
            className="sticky top-0 bg-gray-950 border-b border-gray-700 z-20 relative overflow-hidden"
            style={{ height: HEADER_H }}
          >
            {ticks.map(tick => tick.label && (
              <div
                key={tick.h}
                className="absolute top-0 flex flex-col items-start"
                style={{ left: tick.x }}
              >
                <div
                  className={`h-full border-l ${tick.isDay ? 'border-gray-400' : 'border-gray-700'} pt-1 pl-1`}
                >
                  <span className={`text-xs whitespace-nowrap ${tick.isDay ? 'text-gray-300 font-semibold' : 'text-gray-500'}`}>
                    {tick.label}
                  </span>
                </div>
              </div>
            ))}
            {/* Red line in header */}
            {redLineX >= 0 && redLineX <= totalWidth && (
              <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none" style={{ left: redLineX }} />
            )}
          </div>

          {/* Rows */}
          <div className="relative">
            {LINES.map(line => {
              const lineOrders = orders.filter(o => o.lineId === line.id);
              return (
                <div
                  key={line.id}
                  className="border-b border-gray-800 relative"
                  style={{ height: ROW_H }}
                  onDragOver={e => { if (canDrag) e.preventDefault(); }}
                  onDrop={e => handleDrop(e, line.id)}
                >
                  {/* Hour grid */}
                  {ticks.filter(t => t.h % 2 === 0).map(t => (
                    <div
                      key={t.h}
                      className="absolute top-0 bottom-0 border-l border-gray-800"
                      style={{ left: t.x }}
                    />
                  ))}

                  {/* Order blocks */}
                  {lineOrders.map(order => {
                    const left = orderLeft(order);
                    const width = orderWidth(order, line.id);
                    if (left + width < 0 || left > totalWidth) return null;
                    return (
                      <div
                        key={order.id}
                        draggable={canDrag && !order.closed}
                        onDragStart={e => handleDragStart(e, order)}
                        onClick={() => onOrderClick(order)}
                        className="absolute top-2 rounded-md border select-none cursor-pointer hover:brightness-110 active:scale-[0.99] transition-[filter] flex items-center px-2 gap-1 overflow-hidden"
                        style={{
                          left,
                          width: Math.max(width, 40),
                          height: ROW_H - 16,
                          backgroundColor: order.color + '33',
                          borderColor: order.color,
                          opacity: order.closed ? 0.45 : 1,
                        }}
                        title={`${order.partNumber} · ${order.quantity} vnt.`}
                      >
                        {order.closed && <span className="text-xs text-gray-400 shrink-0">✓</span>}
                        <span className="text-xs font-semibold truncate" style={{ color: order.color }}>
                          {order.partNumber}
                        </span>
                        {width > 80 && (
                          <span className="text-xs text-gray-400 shrink-0 ml-auto">
                            {order.quantity}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Red current time line */}
            {redLineX >= 0 && redLineX <= totalWidth && (
              <div
                className="absolute top-0 bottom-0 z-20 pointer-events-none flex flex-col items-center"
                style={{ left: redLineX }}
              >
                <div className="w-0.5 bg-red-500 h-full" />
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
