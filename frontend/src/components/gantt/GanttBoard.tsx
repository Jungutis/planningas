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
const TIMELINE_HOURS = 90 * 24; // 3 mėnesiai
const SNAP_MIN = 15;

function getTimelineStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 7); // 1 savaitė praeityje
  return d;
}

function fmtTickLabel(d: Date, intervalHours: number): string {
  if (intervalHours >= 24) {
    return d.toLocaleDateString('lt-LT', { weekday: 'short', day: 'numeric', month: 'numeric' });
  }
  if (d.getHours() === 0 && d.getMinutes() === 0) {
    return d.toLocaleDateString('lt-LT', { weekday: 'short', day: 'numeric', month: 'numeric' });
  }
  return d.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
}

function getTickIntervalHours(pph: number): number {
  const minPx = 70;
  for (const h of [0.25, 0.5, 1, 2, 4, 6, 12, 24, 48, 72, 168]) {
    if (h * pph >= minPx) return h;
  }
  return 168;
}

function getDurationHours(order: PlanningOrder, lineConfig: LineConfig): number {
  return (order.quantity * lineConfig.cycleTimeSeconds) / 3600;
}

export default function GanttBoard({ orders, lineConfigs, userRole, onUpdateOrder, onOrderClick }: Props) {
  const [pph, setPph] = useState(6);
  const [now, setNow] = useState(new Date());
  const timelineStart = useRef(getTimelineStart()).current;
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragDataRef = useRef<{ orderId: string; offsetX: number } | null>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, scrollLeft: 0 });
  const pphRef = useRef(pph);
  pphRef.current = pph;

  const canDrag = userRole === 'LOG';
  const totalWidth = TIMELINE_HOURS * pph;
  const tickInterval = getTickIntervalHours(pph);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(tick);
  }, []);

  // Scroll to current time - 2h on mount
  useEffect(() => {
    if (scrollRef.current) {
      const offsetHours = (new Date().getTime() - timelineStart.getTime()) / 3600000 - 2;
      scrollRef.current.scrollLeft = Math.max(0, offsetHours * pph);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wheel zoom — keeps point under cursor fixed
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const el = scrollRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const mouseOffsetX = e.clientX - rect.left;
    const timeAtMouse = (el.scrollLeft + mouseOffsetX) / pphRef.current;

    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newPph = Math.min(400, Math.max(0.3, pphRef.current * factor));
    pphRef.current = newPph;
    setPph(newPph);

    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollLeft = timeAtMouse * newPph - mouseOffsetX;
      }
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Mouse pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-order-block]')) return;
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX, scrollLeft: scrollRef.current?.scrollLeft ?? 0 };
    e.preventDefault();
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanningRef.current || !scrollRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    scrollRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
  }, []);

  const onMouseUp = useCallback(() => { isPanningRef.current = false; }, []);

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

  // Generate ticks
  const ticks: { h: number; x: number; label: string; isMajor: boolean }[] = [];
  const totalTicks = TIMELINE_HOURS / tickInterval;
  for (let i = 0; i <= totalTicks; i++) {
    const h = i * tickInterval;
    const t = new Date(timelineStart.getTime() + h * 3600000);
    const isMidnight = t.getHours() === 0 && t.getMinutes() === 0;
    const isMajor = tickInterval >= 24 ? true : (isMidnight && h > 0);
    ticks.push({
      h,
      x: h * pph,
      label: fmtTickLabel(t, tickInterval),
      isMajor,
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
    const offsetX = Number(e.dataTransfer.getData('dragOffsetX') || dragDataRef.current?.offsetX || 0);
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

  const lineConfig = (id: LineId) => lineConfigs.find(l => l.id === id) ?? lineConfigs[0];

  return (
    <div className="flex h-full">
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
              style={{
                backgroundColor:
                  lineConfig(line.id).cycleTimeSeconds < 35 ? '#22c55e'
                  : lineConfig(line.id).cycleTimeSeconds < 50 ? '#eab308'
                  : '#ef4444',
              }}
            />
            {line.label}
            <span className="ml-auto text-xs text-gray-500 font-normal">
              {lineConfig(line.id).cycleTimeSeconds}s
            </span>
          </div>
        ))}
      </div>

      {/* Scrollable timeline */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden relative"
        style={{ cursor: isPanningRef.current ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <div style={{ width: totalWidth, minWidth: totalWidth, position: 'relative' }}>
          {/* Time header */}
          <div
            className="bg-gray-950 border-b border-gray-700 relative overflow-hidden select-none"
            style={{ height: HEADER_H }}
          >
            {ticks.map((tick, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 flex flex-col justify-end pb-1 pl-1"
                style={{ left: tick.x }}
              >
                <div className={`absolute top-0 bottom-0 border-l ${tick.isMajor ? 'border-gray-400' : 'border-gray-700'}`} />
                <span className={`text-xs whitespace-nowrap relative z-10 ${tick.isMajor ? 'text-gray-300 font-semibold' : 'text-gray-500'}`}>
                  {tick.label}
                </span>
              </div>
            ))}
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
                  {/* Hour grid — pointer-events-none so drop works */}
                  {ticks.map((t, i) => (
                    <div
                      key={i}
                      className={`absolute top-0 bottom-0 border-l pointer-events-none ${t.isMajor ? 'border-gray-600' : 'border-gray-800'}`}
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
                        data-order-block="true"
                        draggable={canDrag && !order.closed}
                        onDragStart={e => handleDragStart(e, order)}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={() => onOrderClick(order)}
                        className="absolute top-2 rounded-md border select-none cursor-pointer hover:brightness-110 transition-[filter] flex items-center px-2 gap-1 overflow-hidden"
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

            {/* Red current-time line */}
            {redLineX >= 0 && redLineX <= totalWidth && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                style={{ left: redLineX }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
