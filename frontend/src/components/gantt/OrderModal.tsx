import { useState } from 'react';
import { PlanningOrder, UserRole, ORDER_COLORS, LineConfig, Blocker } from '../../types';

interface Props {
  order: PlanningOrder;
  userRole: UserRole;
  lineConfig?: LineConfig;
  isEditMode: boolean;
  orders?: PlanningOrder[];
  blockers?: Blocker[];
  onClose: () => void;
  onUpdate: (updated: PlanningOrder) => void;
  onDelete: (id: string) => void;
  onStartConnect?: (qlabOrderId: string) => void;
  onRemoveConnect?: (qlabOrderId: string) => void;
}

const ROLE_LABEL: Record<UserRole, string> = { Q: 'Quality', LOG: 'Logistics', PROD: 'Production' };


function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getActualEndMs(order: PlanningOrder, blockers: Blocker[], lc: LineConfig): number {
  if (!order.startTime) return 0;
  const startMs = new Date(order.startTime).getTime();
  const durMs = order.quantity * lc.cycleTimeSeconds * 1000;

  const rel = blockers
    .filter(b => b.lineId === null || b.lineId === order.lineId)
    .map(b => ({ s: new Date(b.startTime).getTime(), e: new Date(b.endTime).getTime() }))
    .filter(b => b.s < startMs + durMs * 3 && b.e > startMs)
    .sort((a, b) => a.s - b.s);

  let cur = startMs;
  let rem = durMs;
  for (const b of rel) {
    if (rem <= 0) break;
    if (b.s > cur) { const d = Math.min(b.s - cur, rem); rem -= d; cur = b.s; }
    if (b.e > cur) cur = b.e;
  }
  return cur + rem;
}

export default function OrderModal({ order, userRole, lineConfig, isEditMode, orders = [], blockers = [], onClose, onUpdate, onDelete, onStartConnect, onRemoveConnect }: Props) {
  const [scrapPercent, setScrapPercent] = useState(order.scrapPercent);
  const [color, setColor] = useState(order.color);
  const [commentText, setCommentText] = useState('');

  const canEditColor = isEditMode && userRole === 'LOG';
  const canEditScrap = order.lineId === 'qlab' && ((userRole === 'LOG' && isEditMode) || userRole === 'Q');
  const canComment = true;
  const canClose = userRole === 'LOG' || (userRole === 'PROD' && order.lineId === 'qlab');
  const canDelete = isEditMode && userRole === 'LOG';

  const actualEndMs = order.startTime && lineConfig ? getActualEndMs(order, blockers, lineConfig) : null;
  const simpleEndMs = order.startTime && lineConfig
    ? new Date(order.startTime).getTime() + order.quantity * lineConfig.cycleTimeSeconds * 1000
    : null;
  const blockerDelayMs = actualEndMs && simpleEndMs ? actualEndMs - simpleEndMs : 0;
  const hasBlockerDelay = blockerDelayMs > 60000; // >1 min

  // QLab → X-ray flow
  const isQlab = order.lineId === 'qlab';
  const isXray = order.lineId === 'xray';
  const goodPcs = Math.round(order.quantity * (1 - scrapPercent / 100));
  // For X-ray: find QLab orders linked to this order via relatedOrderId
  const linkedQlabOrders = isXray
    ? orders.filter(o => o.lineId === 'qlab' && o.relatedOrderId === order.id && !o.closed)
    : [];

  // Relation
  const relatedXrayOrder = isQlab && order.relatedOrderId
    ? orders.find(o => o.id === order.relatedOrderId)
    : null;
  const canManageRelation = isQlab && (userRole === 'LOG' || userRole === 'Q');

  const save = () => {
    onUpdate({ ...order, scrapPercent, color });
    onClose();
  };

  const submitComment = () => {
    if (!commentText.trim()) return;
    const comment = {
      id: crypto.randomUUID(),
      text: commentText.trim(),
      author: ROLE_LABEL[userRole],
      role: userRole,
      createdAt: new Date().toISOString(),
    };
    onUpdate({ ...order, comments: [...order.comments, comment] });
    setCommentText('');
  };

  const closeOrder = () => {
    onUpdate({ ...order, closed: true });
    onClose();
  };

  const hasChanges = scrapPercent !== order.scrapPercent || color !== order.color;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: order.color }} />
            <div>
              <p className="text-xs text-gray-400">Part Number</p>
              <p className="text-white font-semibold">{order.partNumber}</p>
            </div>
            {order.closed && <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">Closed</span>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Quantity</p>
              <p className="text-white font-medium">{order.quantity} pcs</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Status</p>
              <p className={`font-medium text-sm ${order.closed ? 'text-gray-500' : 'text-green-400'}`}>
                {order.closed ? 'Closed' : 'Active'}
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Start</p>
              <p className="text-white text-xs font-medium">{fmtDate(order.startTime)}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">End {hasBlockerDelay ? <span className="text-amber-400">(+blocker)</span> : ''}</p>
              <p className="text-white text-xs font-medium">{fmtDate(actualEndMs ? new Date(actualEndMs).toISOString() : null)}</p>
              {hasBlockerDelay && (
                <p className="text-xs text-amber-400 mt-0.5">+{Math.round(blockerDelayMs / 3600000 * 10) / 10}h blocker delay</p>
              )}
            </div>
          </div>

          {/* QLab scrap → X-ray flow */}
          {isQlab && (
            <div className="bg-gray-800 rounded-lg p-3 space-y-2">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">QLab → X-ray flow</p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-300">{order.quantity} pcs</span>
                <span className="text-gray-600">→</span>
                <span className="text-amber-400">{scrapPercent}% scrap</span>
                <span className="text-gray-600">→</span>
                <span className="text-green-400 font-semibold">{goodPcs} good pcs</span>
              </div>
              {/* X-ray relation */}
              {relatedXrayOrder ? (
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center gap-1.5 flex-1 bg-gray-700 rounded px-2 py-1.5">
                    <span className="text-xs text-gray-400">→ X-ray:</span>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: relatedXrayOrder.color }} />
                    <span className="text-xs text-white font-mono">{relatedXrayOrder.partNumber}</span>
                    <span className="text-xs text-gray-400">· {goodPcs} good pcs</span>
                  </div>
                  {canManageRelation && (
                    <button onClick={() => { onRemoveConnect?.(order.id); onClose(); }}
                      className="text-xs text-gray-500 hover:text-red-400 px-2 py-1.5 rounded border border-gray-600 hover:border-red-800 transition-colors shrink-0">
                      Unlink
                    </button>
                  )}
                </div>
              ) : (
                canManageRelation && (
                  <button onClick={() => { onStartConnect?.(order.id); onClose(); }}
                    className="flex items-center gap-1.5 w-full px-3 py-1.5 rounded border border-dashed border-gray-600 text-xs text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors">
                    <span>⟶</span> Link to X-ray order
                  </button>
                )
              )}
            </div>
          )}

          {/* X-ray: show linked QLab info */}
          {isXray && linkedQlabOrders.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-3 space-y-1">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Input from QLab</p>
              {linkedQlabOrders.map(qo => {
                const qGoodPcs = Math.round(qo.quantity * (1 - qo.scrapPercent / 100));
                const goodRatio = Math.min(1, qGoodPcs / order.quantity);
                return (
                  <div key={qo.id} className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: qo.color }} />
                      <span className="text-gray-300">{qo.quantity} pcs</span>
                      <span className="text-gray-600">·</span>
                      <span className="text-amber-400">{qo.scrapPercent}% scrap</span>
                      <span className="text-gray-600">→</span>
                      <span className="text-green-400 font-semibold">{qGoodPcs} good pcs</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden bg-gray-600">
                      <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${goodRatio * 100}%` }} />
                    </div>
                    <p className="text-xs text-gray-500">{Math.round(goodRatio * 100)}% of X-ray order covered by good pcs</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Scrap % — only for QLab */}
          {isQlab && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Scrap %</label>
              <input type="number" min="0" max="100" step="0.1"
                value={scrapPercent} onChange={e => setScrapPercent(Number(e.target.value))}
                disabled={!canEditScrap}
                className="w-28 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 disabled:opacity-50" />
              {scrapPercent > 0 && (
                <span className="ml-3 text-sm text-amber-400">{scrapPercent}% scrap · {goodPcs} good pcs</span>
              )}
            </div>
          )}

          {canEditColor && (
            <div>
              <label className="block text-sm text-gray-400 mb-2">Color</label>
              <div className="flex gap-2 flex-wrap">
                {ORDER_COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setColor(c)}
                    className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: c, borderColor: color === c ? '#fff' : 'transparent' }} />
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-sm text-gray-400 mb-2">Comments ({order.comments.length})</p>
            {order.comments.length > 0 && (
              <div className="space-y-2 mb-3 max-h-36 overflow-y-auto">
                {order.comments.map(c => (
                  <div key={c.id} className="bg-gray-800 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-blue-400">{c.author}</span>
                      <span className="text-xs text-gray-500">{new Date(c.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                    <p className="text-sm text-gray-200">{c.text}</p>
                  </div>
                ))}
              </div>
            )}
            {canComment && (
              <div className="flex gap-2">
                <input type="text" value={commentText} onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitComment()}
                  placeholder="Add a comment..."
                  className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                <button onClick={submitComment} disabled={!commentText.trim()}
                  className="px-3 py-2 bg-blue-600 rounded-lg text-white text-sm hover:bg-blue-500 disabled:opacity-40">↵</button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-700 gap-3">
          <div className="flex gap-2">
            {canDelete && (
              <button onClick={() => { onDelete(order.id); onClose(); }}
                className="px-3 py-2 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/40 text-sm transition-colors">
                Delete
              </button>
            )}
            {canClose && !order.closed && (
              <button onClick={closeOrder}
                className="px-3 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 text-sm transition-colors">
                Close order
              </button>
            )}
          </div>
          {hasChanges && (
            <button onClick={save}
              className="px-4 py-2 bg-blue-600 rounded-lg text-white text-sm font-medium hover:bg-blue-500 transition-colors">
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
