import { useState } from 'react';
import { LineId, BLOCKER_COLORS } from '../../types';

const LINES: { id: LineId | null; label: string }[] = [
  { id: null, label: 'All lines' },
  { id: 'xray', label: 'X-ray' },
  { id: 'qlab', label: 'QLab' },
  { id: 'smt4', label: 'SMT4' },
];

interface Props {
  onClose: () => void;
  onCreate: (lineId: LineId | null, startTime: string, endTime: string, label: string, color: string) => void;
}

function toLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function CreateBlockerModal({ onClose, onCreate }: Props) {
  const [lineId, setLineId] = useState<LineId | null>(null);
  const [label, setLabel] = useState('');
  const [startTime, setStartTime] = useState(toLocalInput());
  const [endTime, setEndTime] = useState(toLocalInput());
  const [color, setColor] = useState(BLOCKER_COLORS[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !startTime || !endTime) return;
    if (new Date(startTime) >= new Date(endTime)) return;
    onCreate(lineId, new Date(startTime).toISOString(), new Date(endTime).toISOString(), label.trim(), color);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-5">Create Blocker</h2>
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
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!label.trim() || !startTime || !endTime || new Date(startTime) >= new Date(endTime)}
              className="flex-1 px-4 py-2 rounded-lg bg-red-700 text-white font-medium hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
