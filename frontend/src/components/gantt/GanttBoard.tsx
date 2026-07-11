import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { PlanningOrder, LineConfig, LineId, Blocker } from '../../types';

export type BoardMode = 'pan' | 'select';

interface Props {
  orders: PlanningOrder[];
  lineConfigs: LineConfig[];
  blockers: Blocker[];
  selectedIds: Set<string>;
  mode: BoardMode;
  isEditMode: boolean;
  onUpdateOrder: (order: PlanningOrder) => void;
  onOrderDoubleClick: (order: PlanningOrder) => void;
  onSelectionChange: (ids: Set<string>) => void;
  onDeleteBlocker: (id: string) => void;
}

const LINES: { id: LineId; label: string }[] = [
  { id: 'xray', label: 'X-ray' },
  { id: 'qlab', label: 'QLab' },
  { id: 'smt4', label: 'SMT4' },
];

const LABEL_W = 160;
const ROW_H = 72;
const HEADER_H = 52;
const TIMELINE_HOURS = 30 * 24;
const SNAP_MIN = 15;

function getTimelineStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 7);
  return d;
}

function fmtTickLabel(d: Date, intervalHours: number): string {
  if (intervalHours >= 24)
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  if (d.getHours() === 0 && d.getMinutes() === 0)
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function getTickIntervalHours(pph: number): number {
  for (const h of [0.25, 0.5, 1, 2, 4, 6, 12, 24, 48, 72, 168]) {
    if (h * pph >= 70) return h;
  }
  return 168;
}

function getDurationMs(order: PlanningOrder, lc: LineConfig): number {
  return order.quantity * lc.cycleTimeSeconds * 1000;
}

// Compute pixel segments for an order, splitting around blockers
function getSegments(
  order: PlanningOrder,
  blockers: Blocker[],
  lc: LineConfig,
  timelineStartMs: number,
  pph: number,
): Array<{ left: number; width: number }> {
  if (!order.startTime) return [];
  const startMs = new Date(order.startTime).getTime();
  const durMs = getDurationMs(order, lc);

  const rel = blockers
    .filter(b => b.lineId === null || b.lineId === order.lineId)
    .map(b => ({ s: new Date(b.startTime).getTime(), e: new Date(b.endTime).getTime() }))
    .filter(b => b.s < startMs + durMs * 3 && b.e > startMs)
    .sort((a, b) => a.s - b.s);

  const segs: Array<{ sMs: number; dMs: number }> = [];
  let cur = startMs;
  let rem = durMs;

  for (const b of rel) {
    if (rem <= 0) break;
    if (b.s > cur) {
      const d = Math.min(b.s - cur, rem);
      segs.push({ sMs: cur, dMs: d });
      rem -= d;
    }
    if (b.e > cur) cur = b.e;
  }
  if (rem > 0) segs.push({ sMs: cur, dMs: rem });

  return segs.map(s => ({
    left: ((s.sMs - timelineStartMs) / 3600000) * pph,
    width: Math.max((s.dMs / 3600000) * pph, 4),
  }));
}

interface LassoRect { x1: number; y1: number; x2: number; y2: number }

export default function GanttBoard({
  orders, lineConfigs, blockers, selectedIds, mode, isEditMode,
  onUpdateOrder, onOrderDoubleClick, onSelectionChange, onDeleteBlocker,
}: Props) {
  const [pph, setPph] = useState(6);
  const [now, setNow] = useState(new Date());
  const [lasso, setLasso] = useState<LassoRect | null>(null);
  const [debugInfo, setDebugInfo] = useState<{ pph: number; scrollLeft: number; timeAtMouse: number; effectiveScrollLeft: number; tick: string } | null>(null);
  const [slidingId, setSlidingId] = useState<string | null>(null);
  const [slidingLeft, setSlidingLeft] = useState(0);

  const timelineStart = useRef(getTimelineStart()).current;
  const timelineStartMs = timelineStart.getTime();
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const dragDataRef = useRef<{ orderId: string; offsetX: number } | null>(null);
  const lassoStartRef = useRef<{ clientX: number; clientY: number; scrollLeft: number } | null>(null);
  const panStartRef = useRef({ x: 0, scrollLeft: 0 });
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pphRef = useRef(pph);
  pphRef.current = pph;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  // Target scroll position to apply after DOM updates from a zoom
  const zoomScrollTarget = useRef<{ timeAtMouse: number; mouseOffsetX: number; pph: number } | null>(null);
  const zoomRafId = useRef(0);
  const pendingZoom = useRef<{ factor: number; timeAtMouse: number; mouseOffsetX: number } | null>(null);

  const totalWidth = TIMELINE_HOURS * pph;
  const tickInterval = getTickIntervalHours(pph);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      const offsetHours = (Date.now() - timelineStartMs) / 3600000 - 2;
      scrollRef.current.scrollLeft = Math.max(0, offsetHours * pph);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After pph state change, DOM has been updated — now correct scrollLeft
  useLayoutEffect(() => {
    const target = zoomScrollTarget.current;
    if (target && scrollRef.current) {
      zoomScrollTarget.current = null;
      scrollRef.current.scrollLeft = target.timeAtMouse * target.pph - target.mouseOffsetX;
    }
  }, [pph]);

  // Wheel zoom: batch rapid events into one RAF, set scrollLeft via useLayoutEffect
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mouseOffsetX = e.clientX - rect.left;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;

    if (pendingZoom.current) {
      // Accumulate factors, keep the first anchor point
      pendingZoom.current.factor *= factor;
    } else {
      // If a RAF already fired but useLayoutEffect hasn't updated scrollLeft yet,
      // compute the effective scrollLeft from the pending scroll target instead of
      // reading the stale DOM value — otherwise timeAtMouse is wildly wrong.
      const pending = zoomScrollTarget.current;
      const effectiveScrollLeft = pending
        ? pending.timeAtMouse * pphRef.current - pending.mouseOffsetX
        : el.scrollLeft;
      const timeAtMouse = (effectiveScrollLeft + mouseOffsetX) / pphRef.current;
      pendingZoom.current = { factor, timeAtMouse, mouseOffsetX };
      setDebugInfo({
        pph: pphRef.current,
        scrollLeft: el.scrollLeft,
        timeAtMouse,
        effectiveScrollLeft,
        tick: getTickIntervalHours(pphRef.current) >= 1
          ? `${getTickIntervalHours(pphRef.current)}h`
          : `${Math.round(getTickIntervalHours(pphRef.current) * 60)}min`,
      });
    }

    cancelAnimationFrame(zoomRafId.current);
    zoomRafId.current = requestAnimationFrame(() => {
      const z = pendingZoom.current;
      if (!z) return;
      pendingZoom.current = null;
      const newPph = Math.min(400, Math.max(0.3, pphRef.current * z.factor));
      pphRef.current = newPph;
      zoomScrollTarget.current = { timeAtMouse: z.timeAtMouse, mouseOffsetX: z.mouseOffsetX, pph: newPph };
      setPph(newPph);
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Pan with momentum
  const startPan = useCallback((clientX: number) => {
    panStartRef.current = { x: clientX, scrollLeft: scrollRef.current?.scrollLeft ?? 0 };
    let lastX = clientX;
    let lastT = Date.now();
    let vel = 0;
    let rafId = 0;

    const onMove = (ev: MouseEvent) => {
      const now = Date.now();
      const dt = now - lastT || 1;
      vel = (lastX - ev.clientX) / dt;
      lastX = ev.clientX;
      lastT = now;
      if (scrollRef.current)
        scrollRef.current.scrollLeft = panStartRef.current.scrollLeft - (ev.clientX - panStartRef.current.x);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // Momentum
      let v = vel * 12;
      const decay = () => {
        if (Math.abs(v) < 0.3) return;
        if (scrollRef.current) scrollRef.current.scrollLeft += v;
        v *= 0.92;
        rafId = requestAnimationFrame(decay);
      };
      rafId = requestAnimationFrame(decay);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { cancelAnimationFrame(rafId); };
  }, []);

  // Lasso
  const startLasso = useCallback((clientX: number, clientY: number) => {
    if (!isEditMode) return; // selection only in edit mode
    lassoStartRef.current = { clientX, clientY, scrollLeft: scrollRef.current?.scrollLeft ?? 0 };
    setLasso(null);
    onSelectionChange(new Set());

    const onMove = (ev: MouseEvent) => {
      const start = lassoStartRef.current!;
      if (Math.abs(ev.clientX - start.clientX) < 4 && Math.abs(ev.clientY - start.clientY) < 4) return;
      setLasso({ x1: Math.min(ev.clientX, start.clientX), y1: Math.min(ev.clientY, start.clientY), x2: Math.max(ev.clientX, start.clientX), y2: Math.max(ev.clientY, start.clientY) });
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const start = lassoStartRef.current;
      lassoStartRef.current = null;
      setLasso(null);
      if (!start || !rowsRef.current || !scrollRef.current) return;
      const rr = rowsRef.current.getBoundingClientRect();
      const cLeft = scrollRef.current.getBoundingClientRect().left;
      const sl = scrollRef.current.scrollLeft;
      const lx1 = Math.min(ev.clientX, start.clientX) - cLeft + sl;
      const lx2 = Math.max(ev.clientX, start.clientX) - cLeft + sl;
      const ly1 = Math.min(ev.clientY, start.clientY) - rr.top;
      const ly2 = Math.max(ev.clientY, start.clientY) - rr.top;
      if (lx2 - lx1 < 4 && ly2 - ly1 < 4) return;
      const sel = new Set<string>();
      ordersRef.current.forEach(order => {
        if (!order.startTime || !order.lineId || order.closed) return;
        const li = LINES.findIndex(l => l.id === order.lineId);
        if (li < 0) return;
        const lc = lineConfigs.find(l => l.id === order.lineId) ?? lineConfigs[0];
        const segs = getSegments(order, blockers, lc, timelineStartMs, pphRef.current);
        const oy1 = li * ROW_H, oy2 = (li + 1) * ROW_H;
        if (ly1 >= oy2 || ly2 <= oy1) return;
        for (const s of segs) {
          if (lx1 < s.left + s.width && lx2 > s.left) { sel.add(order.id); break; }
        }
      });
      onSelectionChange(sel);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [lineConfigs, blockers, timelineStartMs, onSelectionChange]);

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startPan(e.clientX);
  }, [startPan]);

  const onRowsMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-order-block]') || target.closest('[data-blocker]')) return;
    e.preventDefault();
    // Deselect all if orders are selected
    if (selectedIdsRef.current.size > 0) {
      onSelectionChange(new Set());
      return;
    }
    if (mode === 'pan') startPan(e.clientX);
    else startLasso(e.clientX, e.clientY);
  }, [mode, startPan, startLasso, onSelectionChange]);

  const xToTime = useCallback((rawX: number): Date => {
    const ms = (rawX / pph) * 3600000;
    const snapped = Math.round(ms / (SNAP_MIN * 60000)) * (SNAP_MIN * 60000);
    return new Date(timelineStartMs + snapped);
  }, [pph, timelineStartMs]);

  const orderLeft = useCallback((order: PlanningOrder): number => {
    if (!order.startTime) return 0;
    return ((new Date(order.startTime).getTime() - timelineStartMs) / 3600000) * pph;
  }, [pph, timelineStartMs]);

  // Slide handler for orders on board
  const makeSlideHandler = (order: PlanningOrder, baseLeft: number) =>
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      const canSlide = isEditMode && !order.closed;
      const startX = e.clientX;
      let moved = false;

      const onMove = (ev: MouseEvent) => {
        if (!canSlide) return;
        const delta = ev.clientX - startX;
        if (!moved && Math.abs(delta) < 5) return;
        moved = true;
        setSlidingId(order.id);
        setSlidingLeft(Math.max(0, baseLeft + delta));
      };

      const onUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (moved && canSlide) {
          const newLeft = Math.max(0, baseLeft + (ev.clientX - startX));
          setSlidingId(null);
          onUpdateOrder({ ...order, startTime: xToTime(newLeft).toISOString() });
        } else {
          setSlidingId(null);
          if (clickTimerRef.current) {
            clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
            onOrderDoubleClick(order);
          } else {
            clickTimerRef.current = setTimeout(() => {
              clickTimerRef.current = null;
              // Selection only available in edit mode
              if (!isEditMode) { onOrderDoubleClick(order); return; }
              const next = new Set(selectedIdsRef.current);
              if (next.has(order.id)) next.delete(order.id);
              else next.add(order.id);
              onSelectionChange(next);
            }, 220);
          }
        }
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

  // Sidebar → board drop
  const handleDrop = (e: React.DragEvent, lineId: LineId) => {
    if (!isEditMode) return;
    e.preventDefault();
    const orderId = e.dataTransfer.getData('orderId') || dragDataRef.current?.orderId;
    const offsetX = Number(e.dataTransfer.getData('dragOffsetX') || dragDataRef.current?.offsetX || 0);
    if (!orderId) return;
    const order = ordersRef.current.find(o => o.id === orderId);
    if (!order) return;
    if (order.lineId && order.lineId !== lineId) return;
    const containerLeft = scrollRef.current?.getBoundingClientRect().left ?? 0;
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0;
    const rawX = (e.clientX - containerLeft) + scrollLeft - offsetX;
    onUpdateOrder({ ...order, lineId, startTime: xToTime(Math.max(0, rawX)).toISOString() });
    dragDataRef.current = null;
  };

  const redLineX = ((now.getTime() - timelineStartMs) / 3600000) * pph;

  const ticks: { x: number; label: string; isMajor: boolean }[] = [];
  for (let i = 0; i <= TIMELINE_HOURS / tickInterval; i++) {
    const h = i * tickInterval;
    const t = new Date(timelineStartMs + h * 3600000);
    const isMidnight = t.getHours() === 0 && t.getMinutes() === 0;
    const isMajor = tickInterval >= 24 ? true : (isMidnight && h > 0);
    ticks.push({ x: h * pph, label: fmtTickLabel(t, tickInterval), isMajor });
  }

  const lineConfig = (id: LineId) => lineConfigs.find(l => l.id === id) ?? lineConfigs[0];

  return (
    <div className="flex h-full">
      {/* Label column */}
      <div className="shrink-0 bg-gray-900 border-r border-gray-700 z-10" style={{ width: LABEL_W }}>
        <div className="border-b border-gray-700" style={{ height: HEADER_H }} />
        {LINES.map(line => {
          const lc = lineConfig(line.id);
          return (
            <div key={line.id} className="flex items-center px-3 border-b border-gray-700 text-sm font-semibold text-gray-200" style={{ height: ROW_H }}>
              <span className="w-2 h-2 rounded-full mr-2 shrink-0" style={{
                backgroundColor: lc.cycleTimeSeconds < 35 ? '#22c55e' : lc.cycleTimeSeconds < 50 ? '#eab308' : '#ef4444',
              }} />
              <span className="truncate">{line.label}</span>
              <span className="ml-auto text-xs text-gray-500 font-normal shrink-0">{Math.round(3600 / lc.cycleTimeSeconds)} pcs/h</span>
            </div>
          );
        })}
      </div>

      {/* Scrollable timeline */}
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden">
        <div style={{ width: totalWidth, minWidth: totalWidth }}>
          {/* Header */}
          <div ref={headerRef} className="bg-gray-950 border-b border-gray-700 relative overflow-hidden select-none" style={{ height: HEADER_H, cursor: 'grab' }} onMouseDown={onHeaderMouseDown}>
            {ticks.map((tick, i) => (
              <div key={i} className="absolute top-0 bottom-0 flex flex-col justify-end pb-1 pl-1" style={{ left: tick.x }}>
                <div className={`absolute top-0 bottom-0 border-l ${tick.isMajor ? 'border-gray-400' : 'border-gray-700'}`} />
                <span className={`text-xs whitespace-nowrap relative z-10 ${tick.isMajor ? 'text-gray-300 font-semibold' : 'text-gray-500'}`}>{tick.label}</span>
              </div>
            ))}
            {redLineX >= 0 && redLineX <= totalWidth && (
              <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none" style={{ left: redLineX }} />
            )}
          </div>

          {/* Rows */}
          <div ref={rowsRef} className="relative select-none" style={{ cursor: mode === 'pan' ? 'grab' : 'crosshair' }} onMouseDown={onRowsMouseDown}>
            {LINES.map((line, lineIndex) => {
              const lc = lineConfig(line.id);
              const lineOrders = orders.filter(o => o.lineId === line.id && o.startTime);
              const lineBlockers = blockers.filter(b => b.lineId === null || b.lineId === line.id);
              return (
                <div key={line.id} className="border-b border-gray-800 relative" style={{ height: ROW_H }}
                  onDragOver={e => {
                    if (!isEditMode) return;
                    const id = dragDataRef.current?.orderId ?? e.dataTransfer.getData('orderId');
                    const o = ordersRef.current.find(x => x.id === id);
                    if (o?.lineId && o.lineId !== line.id) return;
                    e.preventDefault();
                  }}
                  onDrop={e => handleDrop(e, line.id)}>

                  {/* Grid lines */}
                  {ticks.map((t, i) => (
                    <div key={i} className={`absolute top-0 bottom-0 border-l pointer-events-none ${t.isMajor ? 'border-gray-600' : 'border-gray-800'}`} style={{ left: t.x }} />
                  ))}

                  {/* Blocker overlays */}
                  {lineBlockers.map(b => {
                    const bLeft = ((new Date(b.startTime).getTime() - timelineStartMs) / 3600000) * pph;
                    const bWidth = ((new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / 3600000) * pph;
                    if (bLeft + bWidth < 0 || bLeft > totalWidth) return null;
                    return (
                      <div key={b.id} data-blocker="true"
                        className="absolute top-0 bottom-0 flex items-center justify-center overflow-hidden z-10"
                        style={{ left: bLeft, width: Math.max(bWidth, 4), backgroundColor: b.color + '33', borderLeft: `2px solid ${b.color}`, borderRight: `2px solid ${b.color}` }}>
                        <span className="text-xs font-semibold whitespace-nowrap px-1 truncate" style={{ color: b.color }}>{b.label}</span>
                        {isEditMode && (
                          <button onClick={() => onDeleteBlocker(b.id)}
                            className="absolute top-1 right-1 text-xs opacity-0 hover:opacity-100 transition-opacity"
                            style={{ color: b.color }}>✕</button>
                        )}
                      </div>
                    );
                  })}

                  {/* Orders */}
                  {lineOrders.map(order => {
                    const baseLeft = orderLeft(order);
                    const isSliding = slidingId === order.id;
                    const segs = isSliding
                      ? [{ left: slidingLeft, width: Math.max((getDurationMs(order, lc) / 3600000) * pph, 40) }]
                      : getSegments(order, blockers, lc, timelineStartMs, pph);

                    if (!isSliding && segs.every(s => s.left + s.width < 0 || s.left > totalWidth)) return null;
                    const isSelected = selectedIds.has(order.id);
                    const canSlide = isEditMode && !order.closed;

                    return segs.map((seg, si) => (
                      <div key={`${order.id}-${si}`}
                        data-order-block="true"
                        onMouseDown={makeSlideHandler(order, baseLeft)}
                        className="absolute top-2 rounded-md select-none flex items-center px-2 gap-1 overflow-hidden"
                        style={{
                          left: seg.left,
                          width: seg.width,
                          height: ROW_H - 16,
                          cursor: canSlide ? (isSliding ? 'ew-resize' : 'grab') : 'pointer',
                          backgroundColor: order.color,
                          opacity: order.closed ? 0.5 : 1,
                          outline: isSelected ? `2px solid white` : undefined,
                          outlineOffset: isSelected ? '-2px' : undefined,
                          boxShadow: isSliding ? `0 8px 24px ${order.color}66` : undefined,
                          zIndex: isSliding ? 30 : (order.closed ? 1 : 10),
                          transition: isSliding ? 'none' : undefined,
                        }}>
                        {si > 0 && (
                          <span className="absolute left-0 top-0 bottom-0 w-1 opacity-60" style={{ background: 'repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(0,0,0,0.3) 3px,rgba(0,0,0,0.3) 6px)' }} />
                        )}
                        {order.closed && <span className="text-xs text-white/70 shrink-0">✓</span>}
                        {isSelected && <span className="text-xs text-white shrink-0">●</span>}
                        <span className="text-xs font-semibold truncate text-white">{order.partNumber}</span>
                        {seg.width > 80 && <span className="text-xs text-white/70 shrink-0 ml-auto">{order.quantity}</span>}
                      </div>
                    ));
                  })}

                  {lineOrders.filter(o => !o.closed).length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-xs text-gray-700">{isEditMode ? 'Drop orders here' : ''}</span>
                    </div>
                  )}
                  <div className="hidden">{lineIndex}</div>
                </div>
              );
            })}

            {redLineX >= 0 && redLineX <= totalWidth && (
              <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none" style={{ left: redLineX }} />
            )}
          </div>
        </div>
      </div>

      {/* Lasso overlay */}
      {lasso && (
        <div className="fixed pointer-events-none z-50 border border-blue-400 bg-blue-400/10"
          style={{ left: lasso.x1, top: lasso.y1, width: lasso.x2 - lasso.x1, height: lasso.y2 - lasso.y1 }} />
      )}

      {/* Debug zoom overlay */}
      {debugInfo && (
        <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50 bg-black/80 border border-yellow-500/60 rounded-lg px-3 py-2 text-xs font-mono text-yellow-300 flex gap-4 pointer-events-none select-none">
          <span>pph: <b>{debugInfo.pph.toFixed(2)}</b></span>
          <span>tick: <b>{debugInfo.tick}</b></span>
          <span>scrollLeft: <b>{debugInfo.scrollLeft.toFixed(0)}</b></span>
          <span>effectiveSL: <b>{debugInfo.effectiveScrollLeft.toFixed(0)}</b></span>
          <span>timeAtMouse: <b>{debugInfo.timeAtMouse.toFixed(2)}h</b></span>
        </div>
      )}
    </div>
  );
}
