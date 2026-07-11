import { useRef, useState, useEffect, useCallback } from 'react';
import { PlanningOrder, LineConfig, LineId, UserRole } from '../../types';

export type BoardMode = 'pan' | 'select';

interface Props {
  orders: PlanningOrder[];
  lineConfigs: LineConfig[];
  userRole: UserRole;
  selectedIds: Set<string>;
  mode: BoardMode;
  onUpdateOrder: (order: PlanningOrder) => void;
  onOrderDoubleClick: (order: PlanningOrder) => void;
  onSelectionChange: (ids: Set<string>) => void;
}

const LINES: { id: LineId; label: string }[] = [
  { id: 'xray', label: 'X-ray' },
  { id: 'qlab', label: 'QLab' },
  { id: 'smt4', label: 'SMT4' },
];

const LABEL_W = 160;
const ROW_H = 72;
const HEADER_H = 52;
const TIMELINE_HOURS = 90 * 24;
const SNAP_MIN = 15;

function getTimelineStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 7);
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

interface LassoRect { x1: number; y1: number; x2: number; y2: number }

export default function GanttBoard({
  orders, lineConfigs, userRole, selectedIds, mode,
  onUpdateOrder, onOrderDoubleClick, onSelectionChange,
}: Props) {
  const [pph, setPph] = useState(6);
  const [now, setNow] = useState(new Date());
  const [lasso, setLasso] = useState<LassoRect | null>(null);
  const timelineStart = useRef(getTimelineStart()).current;
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const dragDataRef = useRef<{ orderId: string; offsetX: number } | null>(null);
  const lassoStartRef = useRef<{ clientX: number; clientY: number; scrollLeft: number } | null>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, scrollLeft: 0 });
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pphRef = useRef(pph);
  pphRef.current = pph;

  const canDrag = userRole === 'LOG';
  const totalWidth = TIMELINE_HOURS * pph;
  const tickInterval = getTickIntervalHours(pph);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      const offsetHours = (new Date().getTime() - timelineStart.getTime()) / 3600000 - 2;
      scrollRef.current.scrollLeft = Math.max(0, offsetHours * pph);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wheel zoom — keeps cursor point fixed
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

  // Pan gesture — attaches window listeners so mouseup is always caught
  const startPan = useCallback((clientX: number) => {
    isPanningRef.current = true;
    panStartRef.current = { x: clientX, scrollLeft: scrollRef.current?.scrollLeft ?? 0 };

    const onMove = (ev: MouseEvent) => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollLeft = panStartRef.current.scrollLeft - (ev.clientX - panStartRef.current.x);
    };
    const onUp = () => {
      isPanningRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  // Lasso gesture — attaches window listeners so mouseup is always caught
  const startLasso = useCallback((clientX: number, clientY: number) => {
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
    lassoStartRef.current = { clientX, clientY, scrollLeft };
    setLasso(null);
    onSelectionChange(new Set());

    const onMove = (ev: MouseEvent) => {
      const start = lassoStartRef.current;
      if (!start) return;
      if (Math.abs(ev.clientX - start.clientX) < 4 && Math.abs(ev.clientY - start.clientY) < 4) return;
      setLasso({
        x1: Math.min(ev.clientX, start.clientX),
        y1: Math.min(ev.clientY, start.clientY),
        x2: Math.max(ev.clientX, start.clientX),
        y2: Math.max(ev.clientY, start.clientY),
      });
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const start = lassoStartRef.current;
      lassoStartRef.current = null;
      setLasso(null);
      if (!start || !rowsRef.current || !scrollRef.current) return;
      const containerLeft = scrollRef.current.getBoundingClientRect().left;
      const rowsTop = rowsRef.current.getBoundingClientRect().top;
      const sl = scrollRef.current.scrollLeft;
      const lx1 = Math.min(ev.clientX, start.clientX) - containerLeft + sl;
      const lx2 = Math.max(ev.clientX, start.clientX) - containerLeft + sl;
      const ly1 = Math.min(ev.clientY, start.clientY) - rowsTop;
      const ly2 = Math.max(ev.clientY, start.clientY) - rowsTop;
      if (lx2 - lx1 < 4 && ly2 - ly1 < 4) return;
      const newSelected = new Set<string>();
      orders.forEach(order => {
        if (!order.startTime || !order.lineId || order.closed) return;
        const lineIndex = LINES.findIndex(l => l.id === order.lineId);
        if (lineIndex < 0) return;
        const lc = lineConfigs.find(l => l.id === order.lineId) ?? lineConfigs[0];
        const ox1 = ((new Date(order.startTime).getTime() - timelineStart.getTime()) / 3600000) * pphRef.current;
        const ox2 = ox1 + getDurationHours(order, lc) * pphRef.current;
        const oy1 = lineIndex * ROW_H;
        const oy2 = (lineIndex + 1) * ROW_H;
        if (lx1 < ox2 && lx2 > ox1 && ly1 < oy2 && ly2 > oy1) newSelected.add(order.id);
      });
      onSelectionChange(newSelected);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [orders, lineConfigs, timelineStart, onSelectionChange]);

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startPan(e.clientX);
  }, [startPan]);

  const onRowsMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-order-block]')) return;
    e.preventDefault();
    if (mode === 'pan') startPan(e.clientX);
    else startLasso(e.clientX, e.clientY);
  }, [mode, startPan, startLasso]);

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

  const ticks: { h: number; x: number; label: string; isMajor: boolean }[] = [];
  const totalTicks = TIMELINE_HOURS / tickInterval;
  for (let i = 0; i <= totalTicks; i++) {
    const h = i * tickInterval;
    const t = new Date(timelineStart.getTime() + h * 3600000);
    const isMidnight = t.getHours() === 0 && t.getMinutes() === 0;
    const isMajor = tickInterval >= 24 ? true : (isMidnight && h > 0);
    ticks.push({ h, x: h * pph, label: fmtTickLabel(t, tickInterval), isMajor });
  }

  // DnD handlers
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
    if (order.lineId && order.lineId !== lineId) return;
    // Use scrollRef container left — not the row element left — to avoid double-counting scrollLeft
    const containerLeft = scrollRef.current?.getBoundingClientRect().left ?? 0;
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const rawX = (e.clientX - containerLeft) + scrollLeft - offsetX;
    const startTime = xToTime(Math.max(0, rawX)).toISOString();
    onUpdateOrder({ ...order, lineId, startTime });
    dragDataRef.current = null;
  };

  // Single click = select/deselect; double click = modal
  const handleOrderClick = (e: React.MouseEvent, order: PlanningOrder) => {
    e.stopPropagation();
    if (clickTimerRef.current) {
      // Double click
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      onOrderDoubleClick(order);
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        // Single click — toggle selection
        const next = new Set(selectedIds);
        if (next.has(order.id)) next.delete(order.id);
        else next.add(order.id);
        onSelectionChange(next);
      }, 220);
    }
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
            <span className="ml-auto text-xs text-gray-500 font-normal">{Math.round(3600 / lineConfig(line.id).cycleTimeSeconds)} pcs/h</span>
          </div>
        ))}
      </div>

      {/* Scrollable timeline */}
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden relative">
        <div style={{ width: totalWidth, minWidth: totalWidth }}>

          {/* Time header — pan zone */}
          <div
            ref={headerRef}
            className="bg-gray-950 border-b border-gray-700 relative overflow-hidden select-none"
            style={{ height: HEADER_H, cursor: 'grab' }}
            onMouseDown={onHeaderMouseDown}
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

          {/* Rows — lasso zone */}
          <div
            ref={rowsRef}
            className="relative select-none"
            style={{ cursor: mode === 'pan' ? 'grab' : 'crosshair' }}
            onMouseDown={onRowsMouseDown}
          >
            {LINES.map((line, lineIndex) => {
              const lineOrders = orders.filter(o => o.lineId === line.id && o.startTime);
              return (
                <div
                  key={line.id}
                  className="border-b border-gray-800 relative"
                  style={{ height: ROW_H }}
                  onDragOver={e => {
                    if (!canDrag) return;
                    const draggingId = dragDataRef.current?.orderId ?? e.dataTransfer.getData('orderId');
                    const draggingOrder = orders.find(o => o.id === draggingId);
                    if (draggingOrder?.lineId && draggingOrder.lineId !== line.id) return;
                    e.preventDefault();
                  }}
                  onDrop={e => handleDrop(e, line.id)}
                >
                  {ticks.map((t, i) => (
                    <div
                      key={i}
                      className={`absolute top-0 bottom-0 border-l pointer-events-none ${t.isMajor ? 'border-gray-600' : 'border-gray-800'}`}
                      style={{ left: t.x }}
                    />
                  ))}

                  {lineOrders.map(order => {
                    const left = orderLeft(order);
                    const width = orderWidth(order, line.id);
                    if (left + width < 0 || left > totalWidth) return null;
                    const isSelected = selectedIds.has(order.id);
                    return (
                      <div
                        key={order.id}
                        data-order-block="true"
                        draggable={canDrag && !order.closed}
                        onDragStart={e => handleDragStart(e, order)}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => handleOrderClick(e, order)}
                        className="absolute top-2 rounded-md border select-none cursor-pointer transition-[filter,box-shadow] flex items-center px-2 gap-1 overflow-hidden"
                        style={{
                          left,
                          width: Math.max(width, 40),
                          height: ROW_H - 16,
                          backgroundColor: order.color + (isSelected ? '55' : '22'),
                          borderColor: order.color,
                          borderWidth: isSelected ? 2 : 1,
                          opacity: order.closed ? 0.45 : 1,
                          boxShadow: isSelected ? `0 0 0 2px ${order.color}88` : undefined,
                        }}
                        title={`${order.partNumber} · ${order.quantity} vnt. | 2× klik = nustatymai`}
                      >
                        {order.closed && <span className="text-xs text-gray-400 shrink-0">✓</span>}
                        {isSelected && <span className="text-xs shrink-0" style={{ color: order.color }}>●</span>}
                        <span className="text-xs font-semibold truncate" style={{ color: order.color }}>
                          {order.partNumber}
                        </span>
                        {width > 80 && (
                          <span className="text-xs text-gray-400 shrink-0 ml-auto">{order.quantity}</span>
                        )}
                      </div>
                    );
                  })}

                  {/* Line label on empty rows */}
                  {lineOrders.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-xs text-gray-700">Vilk orderius čia</span>
                    </div>
                  )}
                  <div className="hidden">{lineIndex}</div>
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

      {/* Lasso rect — fixed overlay */}
      {lasso && (
        <div
          className="fixed pointer-events-none z-50 border border-blue-400 bg-blue-400/10"
          style={{
            left: lasso.x1,
            top: lasso.y1,
            width: lasso.x2 - lasso.x1,
            height: lasso.y2 - lasso.y1,
          }}
        />
      )}
    </div>
  );
}
