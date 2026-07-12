import { useAuth } from '../hooks/useAuth';

export default function Home() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">
              P
            </div>
            <span className="font-semibold tracking-tight">Planningas</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500">{user?.email}</span>
            <button
              onClick={logout}
              className="text-sm text-slate-500 hover:text-red-600 font-medium transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-sm">
          <div className="text-4xl mb-4">🗓️</div>
          <h1 className="text-xl font-semibold mb-2">Welcome to Planningas!</h1>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            Project is ready — backend with authentication is running, frontend is set up.
            Time to decide what to plan. 🚀
          </p>
        </div>
      </main>
    </div>
  );
}
