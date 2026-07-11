import { useState, FormEvent } from 'react';
import axios from 'axios';
import { authApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const { login } = useAuth();
  const [mode, setMode]         = useState<'login' | 'register'>('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = mode === 'login'
        ? await authApi.login(email, password)
        : await authApi.register(email, password);
      login(res.token, res.user);
    } catch (err) {
      if (axios.isAxiosError(err)) setError(err.response?.data?.error || 'Įvyko klaida');
      else setError('Netikėta klaida');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xl font-bold mx-auto mb-3">
            P
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Planningas</h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === 'login' ? 'Prisijunk prie savo paskyros' : 'Sukurk naują paskyrą'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">El. paštas</label>
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition text-sm"
              placeholder="tavo@pastas.lt"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Slaptažodis {mode === 'register' && <span className="text-slate-400">(min. 8 simboliai)</span>}
            </label>
            <input
              type="password" required minLength={mode === 'register' ? 8 : undefined} value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition text-sm"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition"
          >
            {loading ? 'Palauk…' : mode === 'login' ? 'Prisijungti' : 'Registruotis'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-5">
          {mode === 'login' ? 'Neturi paskyros?' : 'Jau turi paskyrą?'}{' '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            className="text-indigo-600 font-medium hover:underline"
          >
            {mode === 'login' ? 'Registruokis' : 'Prisijunk'}
          </button>
        </p>
      </div>
    </div>
  );
}
