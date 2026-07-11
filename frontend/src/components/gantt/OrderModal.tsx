import { useState } from 'react';
import { PlanningOrder, UserRole, ORDER_COLORS, LineConfig } from '../../types';

interface Props {
  order: PlanningOrder;
  userRole: UserRole;
  lineConfig?: LineConfig;
  isEditMode: boolean;
  onClose: () => void;
  onUpdate: (updated: PlanningOrder) => void;
  onDelete: (id: string) => void;
}

const ROLE_LABEL: Record<UserRole, string> = { Q: 'Quality', LOG: 'Logistics', PROD: 'Production' };

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function OrderModal({ order, userRole, lineConfig, isEditMode, onClose, onUpdate, onDelete }: Props) {
  const [scrapPercent, setScrapPercent] = useState(order.scrapPercent);
  const [color, setColor] = useState(order.color);
  const [commentText, setCommentText] = useState('');

  const canEditColor = isEditMode && userRole === 'LOG';
  const canEditScrap = (userRole === 'LOG' && isEditMode) || (userRole === 'PROD');
  const canComment = true;
  const canClose = userRole === 'LOG' || userRole === 'PROD';
  const canDelete = isEditMode && userRole === 'LOG';

  const endTime = order.startTime && lineConfig
    ? new Date(new Date(order.startTime).getTime() + order.quantity * lineConfig.cycleTimeSeconds * 1000).toISOString()
    : null;

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
              <p className="text-xs text-gray-400 mb-1">End</p>
              <p className="text-white text-xs font-medium">{fmtDate(endTime)}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Scrap %</label>
            <input type="number" min="0" max="100" step="0.1"
              value={scrapPercent} onChange={e => setScrapPercent(Number(e.target.value))}
              disabled={!canEditScrap}
              className="w-28 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 disabled:opacity-50" />
            {order.scrapPercent > 0 && (
              <span className="ml-3 text-sm text-amber-400">{order.scrapPercent}% scrap · {Math.round(order.quantity * (1 - order.scrapPercent / 100))} good pcs</span>
            )}
          </div>

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
