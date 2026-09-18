import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';

export default function LoginPage() {
  const auth = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (auth.admin && !auth.loading) return <Navigate to="/dashboard" replace />;

  async function submit(event) {
    event.preventDefault();
    if (busy || auth.loading) return;
    setError(''); setBusy(true);
    try { await auth.signIn(email, password); setPassword(''); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function changeAccount() {
    setError(''); setBusy(true);
    try { await auth.signOut(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-2xl font-bold text-brand-700">PetGo.</p>
        <h1 className="mt-6 text-2xl font-semibold">Acesso administrativo</h1>
        <p className="mt-2 text-sm text-slate-500">Entre com sua conta autorizada da equipe PetGo.</p>
        {(error || auth.error) && <p role="alert" className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error || auth.error}</p>}
        {auth.loading ? (
          <p role="status" className="mt-6 text-sm text-slate-600">Verificando acesso. A primeira conexão pode levar cerca de um minuto.</p>
        ) : auth.hasSession ? (
          <div className="mt-6 flex flex-wrap gap-4">
            <button className="rounded-lg bg-brand-700 px-4 py-3 text-white disabled:opacity-50" disabled={busy} onClick={auth.retry}>Tentar novamente</button>
            <button className="rounded-lg border px-4 py-3 disabled:opacity-50" disabled={busy} onClick={changeAccount}>Usar outra conta</button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium">E-mail</label>
              <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-3" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium">Senha</label>
              <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-3" />
            </div>
            <button disabled={busy || Boolean(auth.configurationError)} className="w-full rounded-lg bg-brand-700 p-3 font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Entrando…' : 'Entrar'}</button>
          </form>
        )}
      </section>
    </main>
  );
}
