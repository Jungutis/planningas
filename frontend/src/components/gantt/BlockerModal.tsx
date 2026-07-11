import { useState } from 'react';
import { LineId, BLOCKER_COLORS } from '../../types';

const LINES: { id: LineId | null; label: string }[] = [
  { id: null, label: 'All lines' },
  { id: 'xray', label: 'X-ray' },
  { id: 'qlab', label: 'QLab' },
  { id: 'smt4', label: 'SMT4' },
];

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

interface Values {
  lineId: LineId | null;
  startTime: string;
  endTime: string;
  label: string;
  color: string;
}

interface Props {
  mode: 'create' | 'edit';
  initial: Values;
  onSave: (v: Values) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function BlockerModal({ mode, initial, onSave, onDelete, onClose }: Props) {
  const [lineId, setLineId] = useState<LineId | null>(initial.lineId);
  const [label, setLabel] = useState(initial.label);
  const [startTime, setStartTime] = useState(toLocalInput(initial.startTime));
  const [endTime, setEndTime] = useState(toLocalInput(initial.endTime));
  const [color, setColor] = useState(initial.color);

  const valid = label.trim().length > 0 && startTime && endTime && new Date(startTime) < new Date(endTime);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      lineId,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      label: label.trim(),
      color,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-5">
          {mode === 'create' ? 'New Blocker' : 'Edit Blocker'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Applies to</label>
            <div className="grid grid-cols-2 gap-2">
              {LINES.map(l => (
                <button key={String(l.id)} type="button" onClick={() => setLineId(l.id)}
                  className={`py-2 rounded-lg border text-sm font-semibold transition-colors ${lineId === l.id ? 'bg-red-700 border-red-600 text-white' : 'bg-gray-800 border-gray-600 text-gray-400 hover:text-white'}`}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Label</label>
            <input autoFocus type="text" value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Maintenance"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-red-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Start</label>
              <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-red-500" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">End</label>
              <input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-2 text-white text-sm focus:outline-none focus:border-red-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Color</label>
            <div className="flex gap-2">
              {BLOCKER_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ backgroundColor: c, borderColor: color === c ? '#fff' : 'transparent' }} />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            {mode === 'edit' && onDelete && (
              <button type="button" onClick={() => { onDelete(); onClose(); }}
                className="px-3 py-2 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/40 text-sm transition-colors">
                Delete
              </button>
            )}
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!valid}
              className="flex-1 px-4 py-2 rounded-lg bg-red-700 text-white font-medium hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
