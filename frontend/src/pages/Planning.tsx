import { useState, useCallback, useEffect, useRef } from 'react';
import { PlanningOrder, LineConfig, LineId, UserRole, WsMessage, Blocker } from '../types';
import { useWs } from '../hooks/useWs';
import GanttBoard, { BoardMode } from '../components/gantt/GanttBoard';
import OrderModal from '../components/gantt/OrderModal';
import CreateOrderModal from '../components/gantt/CreateOrderModal';
import BlockerModal from '../components/gantt/BlockerModal';
import ShiftModal, { getCurrentWeekStart } from '../components/gantt/ShiftModal';

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



const ROLE_COLORS: Record<UserRole, string> = { Q: 'bg-purple-600', LOG: 'bg-blue-600', PROD: 'bg-green-600' };
const ROLE_LABELS: Record<UserRole, string> = { Q: 'Quality', LOG: 'Logistics', PROD: 'Production' };
const DEFAULT_BLOCKER_COLOR = '#ef4444';

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
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Blocker create from draw
  const [pendingBlockerDraw, setPendingBlockerDraw] = useState<{ lineId: LineId; startTime: string; endTime: string } | null>(null);
  // Blocker edit
  const [editingBlocker, setEditingBlocker] = useState<Blocker | null>(null);
  // QLab→X-ray relation connecting mode
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  // Shift model modal
  const [shiftModalLine, setShiftModalLine] = useState<LineId | null>(null);

  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const lineConfigsRef = useRef(lineConfigs);
  lineConfigsRef.current = lineConfigs;
  const editSnapshot = useRef<{ orders: PlanningOrder[]; lineConfigs: LineConfig[] } | null>(null);
  const deletedInEditRef = useRef<Set<string>>(new Set());
  const isEditModeRef = useRef(false);

  const handleToggleEdit = useCallback(() => {
    if (!editMode) {
      editSnapshot.current = {
        orders: JSON.parse(JSON.stringify(ordersRef.current)),
        lineConfigs: JSON.parse(JSON.stringify(lineConfigsRef.current)),
      };
      deletedInEditRef.current = new Set();
      setEditMode(true);
    } else {
      // Done — send all buffered changes to server so all clients see them
      const snap = editSnapshot.current;
      editSnapshot.current = null;
      setEditMode(false);
      setBoardMode('pan');
      setSelectedIds(new Set());

      if (snap) {
        const currentOrders = ordersRef.current;
        currentOrders.forEach(order => {
          const orig = snap.orders.find(s => s.id === order.id);
          if (!orig) return; // new order already POSTed
          const changed =
            order.startTime !== orig.startTime ||
            order.lineId !== orig.lineId ||
            order.relatedOrderId !== orig.relatedOrderId ||
            order.scrapPercent !== orig.scrapPercent ||
            order.color !== orig.color ||
            order.closed !== orig.closed;
          if (changed) void apiPatch(`/orders/${order.id}`, order);
        });
        lineConfigsRef.current.forEach(lc => {
          const orig = snap.lineConfigs.find(l => l.id === lc.id);
          if (orig && lc.cycleTimeSeconds !== orig.cycleTimeSeconds)
            void apiPatch(`/lines/${lc.id}`, { cycleTimeSeconds: lc.cycleTimeSeconds });
        });
        deletedInEditRef.current.forEach(id => void apiDelete(`/orders/${id}`));
      }
      deletedInEditRef.current = new Set();
    }
  }, [editMode]);

  const handleCancelEdit = useCallback(() => {
    const snap = editSnapshot.current;
    editSnapshot.current = null;
    deletedInEditRef.current = new Set();
    setEditMode(false);
    setBoardMode('pan');
    setSelectedIds(new Set());
    // Restore local state from snapshot — no API calls
    if (snap) {
      setOrders(snap.orders);
      setLineConfigs(snap.lineConfigs);
    }
  }, []);

  const isEditMode = editMode && userRole === 'LOG';
  isEditModeRef.current = isEditMode;

  useEffect(() => {
    if (userRole !== 'LOG') { editSnapshot.current = null; setEditMode(false); }
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'h' || e.key === 'H') setBoardMode('pan');
      if ((e.key === 's' || e.key === 'S') && editMode) setBoardMode('select');
      if ((e.key === 'b' || e.key === 'B') && editMode) setBoardMode('blocker');
      if ((e.key === 'Delete' || e.key === 'Backspace') && editMode) {
        const ids = selectedIds;
        if (ids.size === 0) return;
        setSelectedIds(new Set());
        // In edit mode: only update local state, no API call (sent on Done)
        ids.forEach(id => {
          const o = ordersRef.current.find(x => x.id === id);
          if (o?.startTime) setOrders(all => all.map(x => x.id === id ? { ...o, startTime: null } : x));
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode, selectedIds]);

  const handleUpdateOrder = useCallback(async (updated: PlanningOrder) => {
    setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
    // In edit mode: local-only until Done is clicked
    if (!isEditModeRef.current) void apiPatch(`/orders/${updated.id}`, updated);
  }, []);

  const handleDeleteOrder = useCallback((id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
    if (isEditModeRef.current) {
      deletedInEditRef.current.add(id);
    } else {
      void apiDelete(`/orders/${id}`);
    }
  }, []);

  const handleDeleteAllClosed = useCallback(async () => {
    const closed = ordersRef.current.filter(o => o.closed);
    setOrders(prev => prev.filter(o => !o.closed));
    if (isEditModeRef.current) {
      closed.forEach(o => deletedInEditRef.current.add(o.id));
    } else {
      await Promise.all(closed.map(o => apiDelete(`/orders/${o.id}`)));
    }
  }, []);

  const handleCreateOrder = useCallback(async (partNumber: string, quantity: number, color: string, lineId: LineId) => {
    await apiPost('/orders', { partNumber, quantity, color, lineId });
  }, []);

  // Called from board after drawing — opens modal with pre-filled times
  const handleBlockerDraw = useCallback((lineId: LineId, startTime: string, endTime: string) => {
    setPendingBlockerDraw({ lineId, startTime, endTime });
    setBoardMode('pan'); // switch back to pan after drawing
  }, []);

  // Save new blocker (from draw modal)
  const handleBlockerCreate = useCallback(async (v: { lineId: LineId | null; startTime: string; endTime: string; label: string; color: string }) => {
    await apiPost('/blockers', v);
    setPendingBlockerDraw(null);
  }, []);

  // Open edit modal for existing blocker
  const handleBlockerEdit = useCallback((blocker: Blocker) => {
    setEditingBlocker(blocker);
  }, []);

  // Save edited blocker (delete old + create new with same data)
  const handleBlockerUpdate = useCallback(async (v: { lineId: LineId | null; startTime: string; endTime: string; label: string; color: string }) => {
    if (!editingBlocker) return;
    await apiDelete(`/blockers/${editingBlocker.id}`);
    await apiPost('/blockers', v);
    setEditingBlocker(null);
  }, [editingBlocker]);

  const handleDeleteBlocker = useCallback((id: string) => {
    setBlockers(prev => prev.filter(b => b.id !== id));
    void apiDelete(`/blockers/${id}`);
  }, []);

  const handleShiftApply = useCallback(async (lineId: LineId, shifts: number) => {
    const weekStart = getCurrentWeekStart();
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 3600000);
    // Delete existing [SHIFT] blockers for this line overlapping current week
    const toDelete = blockers.filter(b =>
      b.lineId === lineId &&
      b.label.startsWith('[SHIFT]') &&
      new Date(b.endTime) > weekStart &&
      new Date(b.startTime) < weekEnd
    );
    await Promise.all(toDelete.map(b => apiDelete(`/blockers/${b.id}`)));
    // Create blocker from line-stop to week-end (if not full week)
    if (shifts < 21) {
      const lineStop = new Date(weekStart.getTime() + shifts * 8 * 3600000);
      await apiPost('/blockers', {
        lineId,
        startTime: lineStop.toISOString(),
        endTime: weekEnd.toISOString(),
        label: `[SHIFT] ${shifts} shifts`,
        color: '#4b5563',
      });
    }
  }, [blockers]);

  const handleStartConnect = useCallback((qlabOrderId: string) => {
    setModalOrder(null);
    setConnectingFromId(qlabOrderId);
  }, []);

  const handleConnectToXray = useCallback(async (xrayId: string) => {
    const qlabId = connectingFromId;
    setConnectingFromId(null);
    if (!qlabId) return;
    const updated = ordersRef.current.find(o => o.id === qlabId);
    if (updated) await handleUpdateOrder({ ...updated, relatedOrderId: xrayId });
  }, [connectingFromId, handleUpdateOrder]);

  const handleCancelConnect = useCallback(() => {
    setConnectingFromId(null);
  }, []);

  const handleRemoveConnect = useCallback(async (qlabOrderId: string) => {
    const updated = ordersRef.current.find(o => o.id === qlabOrderId);
    if (updated) await handleUpdateOrder({ ...updated, relatedOrderId: null });
  }, [handleUpdateOrder]);

  const handleCycleTimeChange = (id: string, pcsPerHour: number) => {
    if (pcsPerHour <= 0) return;
    const secs = 3600 / pcsPerHour;
    setLineConfigs(prev => prev.map(l => l.id === id ? { ...l, cycleTimeSeconds: secs } : l));
    // In edit mode: local-only until Done is clicked
    if (!isEditMode) void apiPatch(`/lines/${id}`, { cycleTimeSeconds: secs });
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

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white select-none overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-2 px-3 md:px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0 flex-wrap">
        <button onClick={() => setSidebarOpen(s => !s)}
          className="md:hidden text-gray-400 hover:text-white px-1 text-lg">☰</button>

        <span className="font-bold text-base md:text-lg tracking-tight text-white mr-2">Production Planning</span>

        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
          {(['Q', 'LOG', 'PROD'] as UserRole[]).map(role => (
            <button key={role} onClick={() => setUserRole(role)}
              className={`px-2 md:px-3 py-1 rounded-md text-xs md:text-sm font-semibold transition-colors ${userRole === role ? `${ROLE_COLORS[role]} text-white` : 'text-gray-400 hover:text-white'}`}>
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>

        {userRole === 'LOG' && !isEditMode && (
          <button onClick={handleToggleEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border bg-gray-800 border-gray-600 text-gray-400 hover:text-white">
            ✏ Edit
          </button>
        )}
        {isEditMode && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-amber-400 font-semibold px-2 hidden sm:inline">Editing</span>
            <button onClick={handleToggleEdit}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold border bg-amber-600 border-amber-500 text-white hover:bg-amber-500 transition-colors">
              ✓ Done
            </button>
            <button onClick={handleCancelEdit}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold border bg-gray-800 border-gray-600 text-gray-400 hover:text-white transition-colors">
              ✕ Cancel
            </button>
          </div>
        )}

        <div className="flex-1" />
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
              <button onClick={() => setShowCreate(true)}
                className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors">
                + New Order
              </button>
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
            {isEditMode && (
              <>
                <button onClick={() => setBoardMode('select')} title="Select (S)"
                  className={`flex items-center gap-1.5 px-2 md:px-3 py-1 rounded-md text-xs md:text-sm font-medium transition-colors ${boardMode === 'select' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}>
                  <span>⬚</span><span className="hidden sm:inline">Select</span><span className="text-xs text-gray-600 ml-0.5">S</span>
                </button>
                <button onClick={() => setBoardMode(boardMode === 'blocker' ? 'pan' : 'blocker')} title="Draw Blocker (B)"
                  className={`flex items-center gap-1.5 px-2 md:px-3 py-1 rounded-md text-xs md:text-sm font-medium transition-colors ${boardMode === 'blocker' ? 'bg-red-900 text-red-300 border border-red-700' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}>
                  <span>⛔</span><span className="hidden sm:inline">Blocker</span><span className="text-xs text-gray-600 ml-0.5">B</span>
                </button>
              </>
            )}
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="ml-auto text-xs text-gray-500 hover:text-gray-300 md:hidden">Show sidebar</button>
            )}
          </div>

          {/* Blocker mode hint */}
          {boardMode === 'blocker' && isEditMode && (
            <div className="bg-red-950/60 border-b border-red-900 px-4 py-1 flex items-center gap-2 shrink-0">
              <span className="text-xs text-red-400">Drag on a row to draw a blocker. Click an existing blocker to edit it.</span>
              <button onClick={() => setBoardMode('pan')} className="ml-auto text-xs text-red-600 hover:text-red-400">✕ Exit</button>
            </div>
          )}

          <div className="flex-1 overflow-hidden">
            <GanttBoard
              orders={orders}
              lineConfigs={lineConfigs}
              blockers={blockers}
              selectedIds={selectedIds}
              mode={boardMode}
              isEditMode={isEditMode}
              connectingFromId={connectingFromId}
              onUpdateOrder={handleUpdateOrder}
              onOrderDoubleClick={setModalOrder}
              onSelectionChange={setSelectedIds}
              onBlockerDraw={handleBlockerDraw}
              onBlockerEdit={handleBlockerEdit}
              onConnectToXray={handleConnectToXray}
              onCancelConnect={handleCancelConnect}
              onDblClickLine={userRole === 'LOG' ? setShiftModalLine : undefined}
            />
          </div>
        </div>
      </div>

      {showCreate && <CreateOrderModal onClose={() => setShowCreate(false)} onCreate={handleCreateOrder} />}

      {shiftModalLine && (() => {
        const weekStart = getCurrentWeekStart();
        const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 3600000);
        const existing = blockers.find(b =>
          b.lineId === shiftModalLine &&
          b.label.startsWith('[SHIFT]') &&
          new Date(b.endTime) > weekStart &&
          new Date(b.startTime) < weekEnd
        );
        const initialShifts = existing
          ? Math.round((new Date(existing.startTime).getTime() - weekStart.getTime()) / (8 * 3600000))
          : 21;
        return (
          <ShiftModal
            lineId={shiftModalLine}
            initialShifts={initialShifts}
            onApply={handleShiftApply}
            onClose={() => setShiftModalLine(null)}
          />
        );
      })()}

      {/* Blocker create modal (after drawing) */}
      {pendingBlockerDraw && (
        <BlockerModal
          mode="create"
          initial={{
            lineId: pendingBlockerDraw.lineId,
            startTime: pendingBlockerDraw.startTime,
            endTime: pendingBlockerDraw.endTime,
            label: '',
            color: DEFAULT_BLOCKER_COLOR,
          }}
          onSave={handleBlockerCreate}
          onClose={() => setPendingBlockerDraw(null)}
        />
      )}

      {/* Blocker edit modal */}
      {editingBlocker && (
        <BlockerModal
          mode="edit"
          initial={{
            lineId: editingBlocker.lineId ?? null,
            startTime: editingBlocker.startTime,
            endTime: editingBlocker.endTime,
            label: editingBlocker.label,
            color: editingBlocker.color,
          }}
          onSave={handleBlockerUpdate}
          onDelete={() => { handleDeleteBlocker(editingBlocker.id); setEditingBlocker(null); }}
          onClose={() => setEditingBlocker(null)}
        />
      )}

      {modalOrder && (
        <OrderModal
          key={modalOrder.id}
          order={modalOrder}
          userRole={userRole}
          lineConfig={lineConfigs.find(l => l.id === modalOrder.lineId)}
          isEditMode={isEditMode}
          orders={orders}
          blockers={blockers}
          onClose={() => setModalOrder(null)}
          onUpdate={o => { handleUpdateOrder(o); setModalOrder(o); }}
          onDelete={handleDeleteOrder}
          onStartConnect={handleStartConnect}
          onRemoveConnect={handleRemoveConnect}
        />
      )}
    </div>
  );
}
