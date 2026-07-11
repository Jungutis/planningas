import { useState, useCallback, useEffect, useRef } from 'react';
import { PlanningOrder, LineConfig, LineId, UserRole, WsMessage, Blocker } from '../types';
import { useWs } from '../hooks/useWs';
import GanttBoard, { BoardMode } from '../components/gantt/GanttBoard';
import OrderModal from '../components/gantt/OrderModal';
import CreateOrderModal from '../components/gantt/CreateOrderModal';
import CreateBlockerModal from '../components/gantt/CreateBlockerModal';

const API = (import.meta.env.VITE_API_URL as string | undefined) || '/api';

async function apiPatch(path: string, body: object) {
  await fetch(`${API}/planning${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
async function apiDelete(path: string) {
  await fetch(`${API}/planning${path}`, { method: 'DELETE' });
}
async function apiPost(path: string, body: object): Promise<unknown> {
  const res = await fetch(`${API}/planning${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

function getDurationMs(order: PlanningOrder, lcs: LineConfig[]) {
  const lc = lcs.find(l => l.id === order.lineId) ?? lcs[0];
  return order.quantity * (lc?.cycleTimeSeconds ?? 30) * 1000;
}

// Push overlapping active orders on the same line to the right of the moved order
function cascade(allOrders: PlanningOrder[], moved: PlanningOrder, lineConfigs: LineConfig[]): PlanningOrder[] {
  if (!moved.lineId || !moved.startTime) return [moved];
  const movedDur = getDurationMs(moved, lineConfigs);
  const movedEnd = new Date(moved.startTime).getTime() + movedDur;

  const others = allOrders
    .filter(o => o.lineId === moved.lineId && o.startTime && o.id !== moved.id && !o.closed)
    .sort((a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime());

  const result: PlanningOrder[] = [moved];
  let frontier = movedEnd;

  for (const o of others) {
    const dur = getDurationMs(o, lineConfigs);
    const start = new Date(o.startTime!).getTime();
    if (start < frontier && start + dur > new Date(moved.startTime).getTime()) {
      result.push({ ...o, startTime: new Date(frontier).toISOString() });
      frontier += dur;
    } else {
      frontier = Math.max(frontier, start + dur);
    }
  }
  return result;
}

const ROLE_COLORS: Record<UserRole, string> = { Q: 'bg-purple-600', LOG: 'bg-blue-600', PROD: 'bg-green-600' };
const ROLE_LABELS: Record<UserRole, string> = { Q: 'Quality', LOG: 'Logistics', PROD: 'Production' };

export default function Planning() {
  const [orders, setOrders] = useState<PlanningOrder[]>([]);
  const [lineConfigs, setLineConfigs] = useState<LineConfig[]>([
    { id: 'xray', name: 'X-ray', cycleTimeSeconds: 20 },
    { id: 'qlab', name: 'QLab', cycleTimeSeconds: 45 },
    { id: 'smt4', name: 'SMT4', cycleTimeSeconds: 30 },
  ]);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [userRole, setUserRole] = useState<UserRole>('LOG');
  const [editMode, setEditMode] = useState(false);
  const [boardMode, setBoardMode] = useState<BoardMode>('pan');
  const [modalOrder, setModalOrder] = useState<PlanningOrder | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateBlocker, setShowCreateBlocker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const lineConfigsRef = useRef(lineConfigs);
  lineConfigsRef.current = lineConfigs;

  // When role changes away from LOG, exit edit mode
  useEffect(() => {
    if (userRole !== 'LOG') setEditMode(false);
  }, [userRole]);

  useWs(useCallback((msg: WsMessage) => {
    if (msg.type === 'full_state') {
      setOrders(msg.orders);
      setLineConfigs(msg.lineConfigs);
      setBlockers(msg.blockers);
    } else if (msg.type === 'order_upserted') {
      setOrders(prev => {
        const idx = prev.findIndex(o => o.id === msg.order.id);
        if (idx >= 0) { const n = [...prev]; n[idx] = msg.order; return n; }
        return [...prev, msg.order];
      });
      setModalOrder(prev => prev?.id === msg.order.id ? msg.order : prev);
    } else if (msg.type === 'order_deleted') {
      setOrders(prev => prev.filter(o => o.id !== msg.id));
      setModalOrder(prev => prev?.id === msg.id ? null : prev);
    } else if (msg.type === 'line_config_updated') {
      setLineConfigs(prev => prev.map(l => l.id === msg.lineConfig.id ? msg.lineConfig : l));
    } else if (msg.type === 'blocker_upserted') {
      setBlockers(prev => { const idx = prev.findIndex(b => b.id === msg.blocker.id); if (idx >= 0) { const n = [...prev]; n[idx] = msg.blocker; return n; } return [...prev, msg.blocker]; });
    } else if (msg.type === 'blocker_deleted') {
      setBlockers(prev => prev.filter(b => b.id !== msg.id));
    }
  }, []));

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'h' || e.key === 'H') setBoardMode('pan');
      if (e.key === 's' || e.key === 'S') setBoardMode('select');
      if ((e.key === 'Delete' || e.key === 'Backspace') && editMode) {
        const ids = selectedIds;
        if (ids.size === 0) return;
        setSelectedIds(new Set());
        ids.forEach(id => {
          const o = ordersRef.current.find(x => x.id === id);
          if (o?.startTime) {
            const unplaced = { ...o, startTime: null };
            setOrders(all => all.map(x => x.id === id ? unplaced : x));
            void apiPatch(`/orders/${id}`, { startTime: null });
          }
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode, selectedIds]);

  const handleUpdateOrder = useCallback(async (updated: PlanningOrder) => {
    const current = ordersRef.current.find(o => o.id === updated.id);
    const positionChanged = current?.startTime !== updated.startTime && !updated.closed;

    if (positionChanged && updated.lineId && updated.startTime) {
      const cascaded = cascade(ordersRef.current, updated, lineConfigsRef.current);
      setOrders(prev => {
        const map = new Map(prev.map(o => [o.id, o]));
        cascaded.forEach(o => map.set(o.id, o));
        return Array.from(map.values());
      });
      await Promise.all(cascaded.map(o => apiPatch(`/orders/${o.id}`, { startTime: o.startTime, lineId: o.lineId })));
    } else {
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      void apiPatch(`/orders/${updated.id}`, updated);
    }
  }, []);

  const handleDeleteOrder = useCallback((id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
    void apiDelete(`/orders/${id}`);
  }, []);

  const handleDeleteAllClosed = useCallback(async () => {
    const closed = ordersRef.current.filter(o => o.closed);
    setOrders(prev => prev.filter(o => !o.closed));
    await Promise.all(closed.map(o => apiDelete(`/orders/${o.id}`)));
  }, []);

  const handleCreateOrder = useCallback(async (partNumber: string, quantity: number, color: string, lineId: LineId) => {
    await apiPost('/orders', { partNumber, quantity, color, lineId });
  }, []);

  const handleCreateBlocker = useCallback(async (lineId: LineId | null, startTime: string, endTime: string, label: string, color: string) => {
    await apiPost('/blockers', { lineId, startTime, endTime, label, color });
  }, []);

  const handleDeleteBlocker = useCallback((id: string) => {
    setBlockers(prev => prev.filter(b => b.id !== id));
    void apiDelete(`/blockers/${id}`);
  }, []);

  const handleCycleTimeChange = (id: string, pcsPerHour: number) => {
    if (pcsPerHour <= 0) return;
    const secs = 3600 / pcsPerHour;
    setLineConfigs(prev => prev.map(l => l.id === id ? { ...l, cycleTimeSeconds: secs } : l));
    void apiPatch(`/lines/${id}`, { cycleTimeSeconds: secs });
  };

  const sidebarOrders = (lineId: LineId) => orders.filter(o => o.lineId === lineId && !o.startTime && !o.closed);
  const allSidebarOrders = orders.filter(o => !o.startTime && !o.closed);
  const closedOrders = orders.filter(o => o.closed);

  const handleSidebarDrop = (e: React.DragEvent) => {
    if (!editMode) return;
    e.preventDefault();
    const orderId = e.dataTransfer.getData('orderId');
    if (!orderId) return;
    const order = orders.find(o => o.id === orderId);
    if (!order || !order.startTime) return;
    handleUpdateOrder({ ...order, startTime: null });
  };

  const isEditMode = editMode && userRole === 'LOG';

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white select-none overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-2 px-3 md:px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0 flex-wrap">
        {/* Sidebar toggle (mobile) */}
        <button onClick={() => setSidebarOpen(s => !s)}
          className="md:hidden text-gray-400 hover:text-white px-1 text-lg">☰</button>

        <span className="font-bold text-base md:text-lg tracking-tight text-white mr-2">Production Planning</span>

        {/* Role selector */}
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
          {(['Q', 'LOG', 'PROD'] as UserRole[]).map(role => (
            <button key={role} onClick={() => setUserRole(role)}
              className={`px-2 md:px-3 py-1 rounded-md text-xs md:text-sm font-semibold transition-colors ${userRole === role ? `${ROLE_COLORS[role]} text-white` : 'text-gray-400 hover:text-white'}`}>
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>

        {/* Edit mode toggle — LOG only */}
        {userRole === 'LOG' && (
          <button onClick={() => setEditMode(e => !e)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${isEditMode ? 'bg-amber-600 border-amber-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-white'}`}>
            ✏ {isEditMode ? 'Editing' : 'Edit'}
          </button>
        )}

        <div className="flex-1" />

        {/* Settings */}
        <button onClick={() => setShowSettings(s => !s)} className="text-gray-400 hover:text-white text-xl px-1" title="Settings">⚙</button>
      </header>

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex flex-wrap items-center gap-4 md:gap-8 shrink-0">
          <span className="text-sm font-semibold text-gray-400">Cycle times (pcs/h):</span>
          {lineConfigs.map(lc => (
            <label key={lc.id} className="flex items-center gap-2 text-sm text-gray-300">
              <span className="font-medium">{lc.name}</span>
              <input type="number" min="1" value={Math.round(3600 / lc.cycleTimeSeconds)}
                onChange={e => handleCycleTimeChange(lc.id, Number(e.target.value))}
                disabled={!isEditMode}
                className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50" />
              <span className="text-gray-500">pcs/h</span>
            </label>
          ))}
        </div>
      )}

      {/* Selection hint */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-950 border-b border-blue-800 px-4 py-1.5 flex items-center gap-3 shrink-0">
          <span className="text-sm text-blue-300">{selectedIds.size} order(s) selected</span>
          {isEditMode && <span className="text-xs text-blue-500 hidden sm:inline">Press DELETE to unassign from board</span>}
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-blue-500 hover:text-blue-300">Clear</button>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`${sidebarOpen ? 'flex' : 'hidden'} md:flex w-44 lg:w-52 shrink-0 bg-gray-900 border-r border-gray-700 flex-col overflow-hidden`}
          onDragOver={e => { if (isEditMode) e.preventDefault(); }}
          onDrop={handleSidebarDrop}>
          <div className="p-2 border-b border-gray-700 space-y-1">
            {isEditMode && (
              <>
                <button onClick={() => setShowCreate(true)}
                  className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors">
                  + New Order
                </button>
                <button onClick={() => setShowCreateBlocker(true)}
                  className="w-full py-1.5 bg-gray-700 hover:bg-gray-600 text-red-400 text-xs font-semibold rounded-lg transition-colors">
                  + Add Blocker
                </button>
              </>
            )}
            {!isEditMode && userRole !== 'LOG' && (
              <div className="text-xs text-gray-600 text-center py-1">Log in as Logistics to edit</div>
            )}
            {!isEditMode && userRole === 'LOG' && (
              <div className="text-xs text-gray-600 text-center py-1">Enable Edit mode to modify</div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {allSidebarOrders.length === 0 && (
              <p className="text-xs text-gray-600 text-center mt-4">No pending orders</p>
            )}

            {(['xray', 'qlab', 'smt4'] as LineId[]).map(lineId => {
              const lineOrders = sidebarOrders(lineId);
              if (lineOrders.length === 0) return null;
              const lineName = lineConfigs.find(l => l.id === lineId)?.name ?? lineId;
              return (
                <div key={lineId}>
                  <p className="text-xs text-gray-600 uppercase tracking-wider px-1 pt-2 pb-1">{lineName}</p>
                  {lineOrders.map(order => (
                    <div key={order.id}
                      draggable={isEditMode}
                      onDragStart={e => { e.dataTransfer.setData('orderId', order.id); e.dataTransfer.setData('dragOffsetX', '20'); }}
                      onDoubleClick={() => setModalOrder(order)}
                      className="group border rounded-lg p-2 mb-1 cursor-pointer hover:bg-gray-750 transition-colors"
                      style={{ backgroundColor: order.color + '22', borderColor: order.color + '80' }}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: order.color }} />
                        <span className="text-xs font-semibold text-white truncate flex-1">{order.partNumber}</span>
                        {isEditMode && (
                          <button onClick={e => { e.stopPropagation(); handleDeleteOrder(order.id); }}
                            className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all text-xs px-0.5" title="Delete">✕</button>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 pl-4">{order.quantity} pcs</span>
                    </div>
                  ))}
                </div>
              );
            })}

            {closedOrders.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between px-1 mb-1">
                  <p className="text-xs text-gray-600 uppercase tracking-wider">Closed ({closedOrders.length})</p>
                  {isEditMode && (
                    <button onClick={handleDeleteAllClosed} className="text-xs text-red-600 hover:text-red-400">Delete all</button>
                  )}
                </div>
                {closedOrders.map(order => (
                  <div key={order.id} onDoubleClick={() => setModalOrder(order)}
                    className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 mb-1 cursor-pointer hover:bg-gray-800 opacity-60">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">✓</span>
                      <span className="text-xs text-gray-400 truncate flex-1">{order.partNumber}</span>
                      {isEditMode && (
                        <button onClick={e => { e.stopPropagation(); handleDeleteOrder(order.id); }}
                          className="text-gray-600 hover:text-red-400 text-xs px-0.5">✕</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Board + toolbar */}
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          {/* Mode toolbar */}
          <div className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 border-b border-gray-700 shrink-0">
            <button onClick={() => setBoardMode('pan')} title="Pan (H)"
              className={`flex items-center gap-1.5 px-2 md:px-3 py-1 rounded-md text-xs md:text-sm font-medium transition-colors ${boardMode === 'pan' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}>
              <span>✋</span><span className="hidden sm:inline">Pan</span><span className="text-xs text-gray-600 ml-0.5">H</span>
            </button>
            <button onClick={() => setBoardMode('select')} title="Select (S)"
              className={`flex items-center gap-1.5 px-2 md:px-3 py-1 rounded-md text-xs md:text-sm font-medium transition-colors ${boardMode === 'select' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}>
              <span>⬚</span><span className="hidden sm:inline">Select</span><span className="text-xs text-gray-600 ml-0.5">S</span>
            </button>
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="ml-auto text-xs text-gray-500 hover:text-gray-300 md:hidden">Show sidebar</button>
            )}
          </div>

          <div className="flex-1 overflow-hidden">
            <GanttBoard
              orders={orders}
              lineConfigs={lineConfigs}
              blockers={blockers}
              selectedIds={selectedIds}
              mode={boardMode}
              isEditMode={isEditMode}
              onUpdateOrder={handleUpdateOrder}
              onOrderDoubleClick={setModalOrder}
              onSelectionChange={setSelectedIds}
              onDeleteBlocker={handleDeleteBlocker}
            />
          </div>
        </div>
      </div>

      {showCreate && <CreateOrderModal onClose={() => setShowCreate(false)} onCreate={handleCreateOrder} />}
      {showCreateBlocker && <CreateBlockerModal onClose={() => setShowCreateBlocker(false)} onCreate={handleCreateBlocker} />}
      {modalOrder && (
        <OrderModal
          key={modalOrder.id}
          order={modalOrder}
          userRole={userRole}
          lineConfig={lineConfigs.find(l => l.id === modalOrder.lineId)}
          isEditMode={isEditMode}
          onClose={() => setModalOrder(null)}
          onUpdate={o => { handleUpdateOrder(o); setModalOrder(o); }}
          onDelete={handleDeleteOrder}
        />
      )}
    </div>
  );
}
