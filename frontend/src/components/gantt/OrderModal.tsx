import { useState } from 'react';
import { PlanningOrder, UserRole, ORDER_COLORS } from '../../types';

interface Props {
  order: PlanningOrder;
  userRole: UserRole;
  onClose: () => void;
  onUpdate: (updated: PlanningOrder) => void;
  onDelete: (id: string) => void;
}

const ROLE_LABEL: Record<UserRole, string> = { Q: 'Kokybė', LOG: 'LOG', PROD: 'Gamyba' };

export default function OrderModal({ order, userRole, onClose, onUpdate, onDelete }: Props) {
  const [scrapPercent, setScrapPercent] = useState(order.scrapPercent);
  const [color, setColor] = useState(order.color);
  const [commentText, setCommentText] = useState('');

  const canEdit = userRole === 'LOG';
  const canComment = userRole === 'Q' || userRole === 'LOG';
  const canClose = userRole === 'LOG' || userRole === 'PROD';

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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-[520px] max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: order.color }} />
            <div>
              <p className="text-xs text-gray-400">Part Number</p>
              <p className="text-white font-semibold">{order.partNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
          {/* Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Kiekis</p>
              <p className="text-white font-medium">{order.quantity} vnt.</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Statusas</p>
              <p className={`font-medium ${order.closed ? 'text-gray-500' : 'text-green-400'}`}>
                {order.closed ? 'Uždarytas' : 'Aktyvus'}
              </p>
            </div>
          </div>

          {/* Scrap % */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Scrap %</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={scrapPercent}
              onChange={e => setScrapPercent(Number(e.target.value))}
              disabled={!canEdit}
              className="w-32 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
          </div>

          {/* Color */}
          {canEdit && (
            <div>
              <label className="block text-sm text-gray-400 mb-2">Batch spalva</label>
              <div className="flex gap-2 flex-wrap">
                {ORDER_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: c, borderColor: color === c ? '#fff' : 'transparent' }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div>
            <p className="text-sm text-gray-400 mb-2">Komentarai ({order.comments.length})</p>
            {order.comments.length > 0 && (
              <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
                {order.comments.map(c => (
                  <div key={c.id} className="bg-gray-800 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-blue-400">{c.author}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(c.createdAt).toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-200">{c.text}</p>
                  </div>
                ))}
              </div>
            )}
            {canComment && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitComment()}
                  placeholder="Rašyti komentarą..."
                  className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={submitComment}
                  disabled={!commentText.trim()}
                  className="px-3 py-2 bg-blue-600 rounded-lg text-white text-sm hover:bg-blue-500 disabled:opacity-40"
                >
                  ↵
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700 gap-3">
          <div className="flex gap-2">
            {canEdit && !order.closed && (
              <button
                onClick={() => { onDelete(order.id); onClose(); }}
                className="px-3 py-2 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/40 text-sm transition-colors"
              >
                Ištrinti
              </button>
            )}
            {canClose && !order.closed && (
              <button
                onClick={closeOrder}
                className="px-3 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 text-sm transition-colors"
              >
                Uždaryti orderį
              </button>
            )}
          </div>
          {canEdit && (
            <button
              onClick={save}
              className="px-4 py-2 bg-blue-600 rounded-lg text-white text-sm font-medium hover:bg-blue-500 transition-colors"
            >
              Išsaugoti
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
