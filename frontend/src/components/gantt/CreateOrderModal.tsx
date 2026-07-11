import { useState } from 'react';
import { LineId, ORDER_COLORS } from '../../types';

const LINES: { id: LineId; label: string }[] = [
  { id: 'smt4', label: 'SMT4' },
  { id: 'qlab', label: 'QLab' },
  { id: 'xray', label: 'X-ray' },
];

interface Props {
  onClose: () => void;
  onCreate: (partNumber: string, quantity: number, color: string, lineId: LineId) => void;
}

export default function CreateOrderModal({ onClose, onCreate }: Props) {
  const [partNumber, setPartNumber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [color, setColor] = useState(ORDER_COLORS[0]);
  const [lineId, setLineId] = useState<LineId>('smt4');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partNumber.trim() || !quantity) return;
    onCreate(partNumber.trim(), Number(quantity), color, lineId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-96 shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-5">Sukurti orderį</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Linija</label>
            <div className="flex gap-2">
              {LINES.map(l => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLineId(l.id)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                    lineId === l.id
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-white'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Part Number</label>
            <input
              autoFocus
              type="text"
              value={partNumber}
              onChange={e => setPartNumber(e.target.value)}
              placeholder="pvz. 123-456-789"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Kiekis (vnt.)</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="pvz. 500"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Spalva</label>
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
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors"
            >
              Atšaukti
            </button>
            <button
              type="submit"
              disabled={!partNumber.trim() || !quantity}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Sukurti
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
