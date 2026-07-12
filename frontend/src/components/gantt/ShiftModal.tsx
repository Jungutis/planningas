import { useState } from 'react';
import { LineId } from '../../types';

const LINE_LABELS: Record<string, string> = { smt4: 'SMT4', qlab: 'QLab', xray: 'X-Ray' };

export function getCurrentWeekStart(): Date {
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() - d.getDay()); // this Sunday
  d.setHours(22, 0, 0, 0);
  if (now < d) d.setDate(d.getDate() - 7); // before Sun 22:00 → prev Sunday
  return d;
}

function fmtDt(d: Date): string {
  return d.toLocaleString('lt-LT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  lineId: LineId;
  initialShifts: number;
  onApply: (lineId: LineId, shifts: number) => void;
  onClose: () => void;
}

export default function ShiftModal({ lineId, initialShifts, onApply, onClose }: Props) {
  const [shifts, setShifts] = useState(initialShifts);

  const weekStart = getCurrentWeekStart();
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 3600000);
  const lineStop = new Date(weekStart.getTime() + shifts * 8 * 3600000);
  const hasBlocker = shifts < 21;
  const lineName = LINE_LABELS[lineId] ?? lineId;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-white font-semibold">{lineName} — shift model</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="text-xs text-gray-500">
            Current week: {fmtDt(weekStart)} — {fmtDt(weekEnd)}
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm text-gray-400">Shifts this week</label>
              <span className="text-white font-semibold">{shifts} / 21</span>
            </div>
            <input
              type="range" min={0} max={21} step={1} value={shifts}
              onChange={e => setShifts(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>0</span><span>7</span><span>14</span><span>21</span>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Working hours</span>
              <span className="text-green-400">{shifts * 8}h ({shifts} shifts)</span>
            </div>
            {hasBlocker ? (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-400">Downtime from</span>
                  <span className="text-amber-400">{fmtDt(lineStop)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Downtime until</span>
                  <span className="text-gray-300">{fmtDt(weekEnd)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Downtime duration</span>
                  <span className="text-red-400">{(21 - shifts) * 8}h ({21 - shifts} shifts)</span>
                </div>
              </>
            ) : (
              <div className="text-center text-green-400 text-xs">Working full week — no blocker</div>
            )}
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-gray-700">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 text-sm">
            Cancel
          </button>
          <button onClick={() => { onApply(lineId, shifts); onClose(); }} className="flex-1 px-4 py-2 bg-blue-600 rounded-lg text-white text-sm font-medium hover:bg-blue-500">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
