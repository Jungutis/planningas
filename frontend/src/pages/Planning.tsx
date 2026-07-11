import { useState, useCallback, useEffect, useRef } from 'react';
import { PlanningOrder, LineConfig, LineId, UserRole, WsMessage } from '../types';
import { useWs } from '../hooks/useWs';
import GanttBoard from '../components/gantt/GanttBoard';
import OrderModal from '../components/gantt/OrderModal';
import CreateOrderModal from '../components/gantt/CreateOrderModal';

const API = (import.meta.env.VITE_API_URL as string | undefined) || '/api';

const ROLE_COLORS: Record<UserRole, string> = {
  Q: 'bg-purple-600',
  LOG: 'bg-blue-600',
  PROD: 'bg-green-600',
};

const ROLE_LABELS: Record<UserRole, string> = {
  Q: 'Kokybė',
  LOG: 'LOG',
  PROD: 'Gamyba',
};

async function apiPatch(path: string, body: object) {
  await fetch(`${API}/planning${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function apiDelete(path: string) {
  await fetch(`${API}/planning${path}`, { method: 'DELETE' });
}

async function apiPost(path: string, body: object): Promise<PlanningOrder> {
  const res = await fetch(`${API}/planning${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<PlanningOrder>;
}

export default function Planning() {
  const [orders, setOrders] = useState<PlanningOrder[]>([]);
  const [lineConfigs, setLineConfigs] = useState<LineConfig[]>([
    { id: 'smt4', name: 'SMT4', cycleTimeSeconds: 30 },
    { id: 'qlab', name: 'QLab', cycleTimeSeconds: 45 },
    { id: 'xray', name: 'X-ray', cycleTimeSeconds: 20 },
  ]);
  const [userRole, setUserRole] = useState<UserRole>('LOG');
  const [modalOrder, setModalOrder] = useState<PlanningOrder | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  useWs(useCallback((msg: WsMessage) => {
    if (msg.type === 'full_state') {
      setOrders(msg.orders);
      setLineConfigs(msg.lineConfigs);
    } else if (msg.type === 'order_upserted') {
      setOrders(prev => {
        const idx = prev.findIndex(o => o.id === msg.order.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = msg.order;
          return next;
        }
        return [...prev, msg.order];
      });
      setModalOrder(prev => prev?.id === msg.order.id ? msg.order : prev);
    } else if (msg.type === 'order_deleted') {
      setOrders(prev => prev.filter(o => o.id !== msg.id));
      setModalOrder(prev => prev?.id === msg.id ? null : prev);
    } else if (msg.type === 'line_config_updated') {
      setLineConfigs(prev => prev.map(l => l.id === msg.lineConfig.id ? msg.lineConfig : l));
    }
  }, []));

  // DELETE key — unassign selected orders from board (return to sidebar)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      setSelectedIds(prev => {
        if (prev.size === 0) return prev;
        prev.forEach(id => {
          const order = ordersRef.current.find(o => o.id === id);
          if (order && order.startTime) {
            const unplaced = { ...order, startTime: null };
            setOrders(all => all.map(o => o.id === id ? unplaced : o));
            void apiPatch(`/orders/${id}`, { startTime: null });
          }
        });
        return new Set();
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleUpdateOrder = useCallback((updated: PlanningOrder) => {
    setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
    void apiPatch(`/orders/${updated.id}`, updated);
  }, []);

  const handleDeleteOrder = useCallback((id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
    void apiDelete(`/orders/${id}`);
  }, []);

  // Don't add locally — WS broadcast will add it (prevents duplication)
  const handleCreateOrder = useCallback(async (
    partNumber: string, quantity: number, color: string, lineId: LineId,
  ) => {
    await apiPost('/orders', { partNumber, quantity, color, lineId });
  }, []);

  const handleCycleTimeChange = (id: string, val: number) => {
    setLineConfigs(prev => prev.map(l => l.id === id ? { ...l, cycleTimeSeconds: val } : l));
    void apiPatch(`/lines/${id}`, { cycleTimeSeconds: val });
  };

  // Sidebar: orders with this line assigned but not yet placed on timeline
  const sidebarByLine = (lineId: LineId) =>
    orders.filter(o => o.lineId === lineId && !o.startTime && !o.closed);
  const allSidebar = orders.filter(o => !o.startTime && !o.closed);
  const closed = orders.filter(o => o.closed);

  const handleSidebarDrop = (e: React.DragEvent) => {
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
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <span className="font-bold text-lg tracking-tight text-white">Planningas</span>
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
          {(['Q', 'LOG', 'PROD'] as UserRole[]).map(role => (
            <button
              key={role}
              onClick={() => setUserRole(role)}
              className={`px-3 py-1 rounded-md text-sm font-semibold transition-colors ${
                userRole === role ? `${ROLE_COLORS[role]} text-white` : 'text-gray-400 hover:text-white'
              }`}
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowSettings(s => !s)}
          className="text-gray-400 hover:text-white text-xl px-2"
          title="Nustatymai"
        >
          ⚙
        </button>
      </header>

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center gap-8 shrink-0">
          <span className="text-sm font-semibold text-gray-400 mr-2">Ciklo laikai:</span>
          {lineConfigs.map(lc => (
            <label key={lc.id} className="flex items-center gap-2 text-sm text-gray-300">
              <span className="font-medium">{lc.name}</span>
              <input
                type="number"
                min="1"
                value={lc.cycleTimeSeconds}
                onChange={e => handleCycleTimeChange(lc.id, Number(e.target.value))}
                disabled={userRole !== 'LOG'}
                className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
              />
              <span className="text-gray-500">sek/vnt.</span>
            </label>
          ))}
        </div>
      )}

      {/* Selection hint */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-950 border-b border-blue-800 px-4 py-1.5 flex items-center gap-3 shrink-0">
          <span className="text-sm text-blue-300">
            {selectedIds.size} orderis(-iai) pažymėti
          </span>
          <span className="text-xs text-blue-500">Spausk DELETE kad grąžintum į sąrašą</span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-blue-500 hover:text-blue-300"
          >
            Atžymėti
          </button>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className="w-52 shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col overflow-hidden"
          onDragOver={e => { if (userRole === 'LOG') e.preventDefault(); }}
          onDrop={handleSidebarDrop}
        >
          <div className="p-3 border-b border-gray-700">
            {userRole === 'LOG' ? (
              <button
                onClick={() => setShowCreate(true)}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                + Sukurti orderį
              </button>
            ) : (
              <div className="text-xs text-gray-600 text-center py-1">Tik LOG gali kurti</div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {allSidebar.length === 0 && (
              <p className="text-xs text-gray-600 text-center mt-4">Nėra laukiančių orderių</p>
            )}

            {/* Group by line */}
            {(['smt4', 'qlab', 'xray'] as LineId[]).map(lineId => {
              const lineOrders = sidebarByLine(lineId);
              if (lineOrders.length === 0) return null;
              const lineName = lineConfigs.find(l => l.id === lineId)?.name ?? lineId;
              return (
                <div key={lineId}>
                  <p className="text-xs text-gray-600 uppercase tracking-wider px-1 pt-2 pb-1">{lineName}</p>
                  {lineOrders.map(order => (
                    <div
                      key={order.id}
                      draggable={userRole === 'LOG'}
                      onDragStart={e => {
                        e.dataTransfer.setData('orderId', order.id);
                        e.dataTransfer.setData('dragOffsetX', '20');
                      }}
                      onDoubleClick={() => setModalOrder(order)}
                      className="bg-gray-800 border rounded-lg p-2 mb-1 cursor-pointer hover:bg-gray-750 transition-colors"
                      style={{ borderColor: order.color + '80' }}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: order.color }} />
                        <span className="text-xs font-semibold text-white truncate">{order.partNumber}</span>
                      </div>
                      <span className="text-xs text-gray-400 pl-4">{order.quantity} vnt.</span>
                    </div>
                  ))}
                </div>
              );
            })}

            {closed.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-gray-600 uppercase tracking-wider px-1 mb-1">Uždaryti ({closed.length})</p>
                {closed.map(order => (
                  <div
                    key={order.id}
                    onDoubleClick={() => setModalOrder(order)}
                    className="bg-gray-800/50 border border-gray-700 rounded-lg p-2 mb-1 cursor-pointer hover:bg-gray-800 opacity-60"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">✓</span>
                      <span className="text-xs text-gray-400 truncate">{order.partNumber}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Gantt */}
        <div className="flex-1 overflow-hidden relative">
          <GanttBoard
            orders={orders}
            lineConfigs={lineConfigs}
            userRole={userRole}
            selectedIds={selectedIds}
            onUpdateOrder={handleUpdateOrder}
            onOrderDoubleClick={setModalOrder}
            onSelectionChange={setSelectedIds}
          />
        </div>
      </div>

      {showCreate && (
        <CreateOrderModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreateOrder}
        />
      )}
      {modalOrder && (
        <OrderModal
          key={modalOrder.id}
          order={modalOrder}
          userRole={userRole}
          onClose={() => setModalOrder(null)}
          onUpdate={order => { handleUpdateOrder(order); setModalOrder(order); }}
          onDelete={handleDeleteOrder}
        />
      )}
    </div>
  );
}
