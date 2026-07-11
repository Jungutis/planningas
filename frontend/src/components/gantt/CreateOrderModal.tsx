import { useState } from 'react';
import { LineId, ORDER_COLORS } from '../../types';

const LINES: { id: LineId; label: string }[] = [
  { id: 'xray', label: 'X-ray' },
  { id: 'qlab', label: 'QLab' },
  { id: 'smt4', label: 'SMT4' },
];

interface Props {
  onClose: () => void;
  onCreate: (partNumber: string, quantity: number, color: string, lineId: LineId) => void;
}

export default function CreateOrderModal({ onClose, onCreate }: Props) {
  const [partNumber, setPartNumber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [color, setColor] = useState(ORDER_COLORS[0]);
  const [lineId, setLineId] = useState<LineId>('xray');

  const PN_REGEX = /^\d{3}\.\d{3}-\d{2}$/;
  const pnValid = PN_REGEX.test(partNumber);
  const pnTouched = partNumber.length > 0;

  const handlePartNumberChange = (raw: string) => {
    // Strip everything except digits, keep max 8 digits
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 3) formatted = digits.slice(0, 3) + '.' + digits.slice(3);
    if (digits.length > 6) formatted = digits.slice(0, 3) + '.' + digits.slice(3, 6) + '-' + digits.slice(6);
    setPartNumber(formatted);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pnValid || !quantity) return;
    onCreate(partNumber, Number(quantity), color, lineId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-5">Create Order</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Line</label>
            <div className="flex gap-2">
              {LINES.map(l => (
                <button key={l.id} type="button" onClick={() => setLineId(l.id)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors ${lineId === l.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-white'}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Part Number</label>
            <input autoFocus type="text" value={partNumber}
              onChange={e => handlePartNumberChange(e.target.value)}
              placeholder="000.000-00"
              maxLength={10}
              className={`w-full bg-gray-800 border rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none font-mono tracking-widest ${pnTouched && !pnValid ? 'border-red-500 focus:border-red-400' : 'border-gray-600 focus:border-blue-500'}`} />
            {pnTouched && !pnValid && (
              <p className="text-xs text-red-400 mt-1">Format: 000.000-00 (digits only)</p>
            )}
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Quantity (pcs)</label>
            <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)}
              placeholder="e.g. 500"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          </div>
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
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!pnValid || !quantity}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
