import { useState } from 'react';
import { LineId, LineConfig, ORDER_COLORS } from '../../types';

const VALID_PNS: Record<string, string[]> = {
  smt4: ['260.260-01', '260.260-02'],
  qlab: ['260.260-01', '260.260-02'],
  xray: ['260.260-71', '260.260-72'],
};

interface Props {
  lineConfigs: LineConfig[];
  onClose: () => void;
  onCreate: (partNumber: string, quantity: number, color: string, lineId: LineId) => void;
}

export default function CreateOrderModal({ lineConfigs, onClose, onCreate }: Props) {
  const [partNumber, setPartNumber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [color, setColor] = useState(ORDER_COLORS[0]);
  const [lineId, setLineId] = useState<LineId>(lineConfigs[0]?.id ?? 'smt4');

  const validPns = VALID_PNS[lineId] ?? null;
  const isBuiltIn = validPns !== null;
  const pnTouched = partNumber.length > 0;
  const pnFormatOk = /^\d{3}\.\d{3}-\d{2}$/.test(partNumber);
  const pnValid = isBuiltIn
    ? pnFormatOk && validPns!.includes(partNumber)
    : partNumber.trim().length > 0;
  const pnError = pnTouched && isBuiltIn && pnFormatOk && !validPns!.includes(partNumber)
    ? `Invalid PN for ${lineConfigs.find(l => l.id === lineId)?.name}. Allowed: ${validPns!.join(', ')}`
    : pnTouched && isBuiltIn && !pnFormatOk
    ? 'Format: 000.000-00'
    : null;

  const qty = Number(quantity);
  const qtyValid = quantity !== '' && qty >= 1 && qty <= 9999 && Number.isInteger(qty);
  const qtyError = quantity !== '' && !qtyValid ? 'Enter a whole number between 1 and 9999' : null;

  const canSubmit = pnValid && qtyValid;

  const handlePartNumberChange = (raw: string) => {
    if (isBuiltIn) {
      const digits = raw.replace(/\D/g, '').slice(0, 8);
      let formatted = digits;
      if (digits.length > 3) formatted = digits.slice(0, 3) + '.' + digits.slice(3);
      if (digits.length > 6) formatted = digits.slice(0, 3) + '.' + digits.slice(3, 6) + '-' + digits.slice(6);
      setPartNumber(formatted);
    } else {
      setPartNumber(raw.slice(0, 30));
    }
  };

  const handleQuantityChange = (raw: string) => {
    setQuantity(raw.replace(/\D/g, '').slice(0, 4));
  };

  const handleLineChange = (id: LineId) => {
    setLineId(id);
    setPartNumber('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onCreate(partNumber.trim(), qty, color, lineId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-5">Create Order</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Work Center</label>
            <div className="flex gap-2 flex-wrap">
              {lineConfigs.map(l => (
                <button key={l.id} type="button" onClick={() => handleLineChange(l.id)}
                  className={`px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${lineId === l.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-white'}`}>
                  {l.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Part Number</label>
            <input autoFocus type="text" value={partNumber}
              onChange={e => handlePartNumberChange(e.target.value)}
              placeholder={isBuiltIn ? '000.000-00' : 'e.g. PART-001'}
              maxLength={isBuiltIn ? 10 : 30}
              className={`w-full bg-gray-800 border rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none ${isBuiltIn ? 'font-mono tracking-widest' : ''} ${pnError ? 'border-red-500 focus:border-red-400' : pnValid ? 'border-green-600 focus:border-green-500' : 'border-gray-600 focus:border-blue-500'}`} />
            {isBuiltIn && (
              <div className="flex gap-2 mt-1.5">
                {validPns!.map(pn => (
                  <button key={pn} type="button" onClick={() => setPartNumber(pn)}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${partNumber === pn ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-white hover:border-gray-400'}`}>
                    {pn}
                  </button>
                ))}
              </div>
            )}
            {pnError && <p className="text-xs text-red-400 mt-1">{pnError}</p>}
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Quantity (pcs)</label>
            <input type="text" inputMode="numeric" value={quantity}
              onChange={e => handleQuantityChange(e.target.value)}
              placeholder="e.g. 500"
              className={`w-full bg-gray-800 border rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 ${qtyError ? 'border-red-500' : 'border-gray-600'}`} />
            {qtyError && <p className="text-xs text-red-400 mt-1">{qtyError}</p>}
            <p className="text-xs text-gray-600 mt-0.5">Max 9999 pcs</p>
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
            <button type="submit" disabled={!canSubmit}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
