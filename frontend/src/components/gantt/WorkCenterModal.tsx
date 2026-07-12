import { useState } from 'react';
import { LineConfig } from '../../types';

interface Props {
  lineConfigs: LineConfig[];
  onClose: () => void;
  onCreate: (name: string, cycleTimeSeconds: number) => Promise<void>;
  onDelete: (id: string) => Promise<string | null>;
}

const BUILT_IN = ['smt4', 'qlab', 'xray'];

export default function WorkCenterModal({ lineConfigs, onClose, onCreate, onDelete }: Props) {
  const [name, setName] = useState('');
  const [cycleTime, setCycleTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const ct = Number(cycleTime);
  const ctValid = cycleTime !== '' && ct >= 1 && ct <= 999 && Number.isInteger(ct);
  const nameValid = name.trim().length >= 2;
  const canCreate = nameValid && ctValid && !saving;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate(name.trim(), ct);
      setName('');
      setCycleTime('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    const err = await onDelete(id);
    setDeletingId(null);
    if (err) setError(err);
  };

  const pph = (id: string) => {
    const lc = lineConfigs.find(l => l.id === id);
    if (!lc) return '';
    return `${Math.round(3600 / lc.cycleTimeSeconds)} pcs/h · ${lc.cycleTimeSeconds}s/pc`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-white font-semibold">Work Centers</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-64 overflow-y-auto">
          {lineConfigs.map(lc => (
            <div key={lc.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2.5">
              <div>
                <p className="text-white text-sm font-semibold">{lc.name}</p>
                <p className="text-gray-400 text-xs">{pph(lc.id)}</p>
              </div>
              {!BUILT_IN.includes(lc.id) && (
                <button
                  onClick={() => handleDelete(lc.id)}
                  disabled={deletingId === lc.id}
                  className="text-xs text-gray-500 hover:text-red-400 px-2 py-1 rounded border border-gray-600 hover:border-red-800 transition-colors disabled:opacity-40"
                >
                  {deletingId === lc.id ? '…' : 'Delete'}
                </button>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleCreate} className="px-5 py-4 border-t border-gray-700 space-y-3">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Add work center</p>
          <div className="flex gap-2">
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Name (e.g. SMT5)"
              maxLength={20}
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <input
              type="text" inputMode="numeric" value={cycleTime}
              onChange={e => setCycleTime(e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="s/pc"
              className="w-20 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button type="submit" disabled={!canCreate}
              className="px-4 py-2 bg-blue-600 rounded-lg text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-40 transition-colors">
              {saving ? '…' : 'Add'}
            </button>
          </div>
          <p className="text-xs text-gray-600">Cycle time = seconds per piece (e.g. 30 = 120 pcs/h)</p>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>
      </div>
    </div>
  );
}
