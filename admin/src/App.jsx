import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useState } from 'react';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import AnimalsPage from './pages/AnimalsPage';

const sections = [
  { path: '/dashboard', title: 'Visão geral', description: 'Contagem de animais e usuários será conectada na próxima etapa.' },
  { path: '/usuarios', title: 'Usuários', description: 'Consulta de contas e planos, com ações administrativas protegidas.' },
  { path: '/animais', title: 'Animais', description: 'Revisão de fotos e registros para moderação.' }
];

function Layout() {
  const { admin, signOut } = useAdminAuth();
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  async function logout() {
    setLeaving(true); setError('');
    try { await signOut(); }
    catch (err) { setError(err.message); }
    finally { setLeaving(false); }
  }
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-white p-6 md:min-h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r">
        <p className="text-2xl font-bold tracking-tight text-brand-700">PetGo<span className="text-slate-400">.</span></p>
        <p className="mt-1 text-sm text-slate-500">Painel administrativo</p>
        <nav aria-label="Navegação principal" className="mt-8 flex flex-wrap gap-2 md:flex-col">
          {sections.map(({ path, title }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => `rounded-xl px-4 py-3 text-sm font-medium transition-colors ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {title}
            </NavLink>
          ))}
        </nav>
        <p className="mt-8 break-all text-sm text-slate-500">{admin.email}</p>
        <button disabled={leaving} onClick={logout} className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">{leaving ? 'Saindo…' : 'Sair'}</button>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </aside>
      <main id="conteudo" className="w-full min-w-0 p-6 md:p-10">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Placeholder({ title, description }) {
  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title" className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-slate-600">{description}</p>
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8">
        <p className="font-medium text-slate-700">Em preparação</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">Esta etapa configura o painel. Os recursos serão implementados e revisados nos próximos blocos.</p>
      </div>
    </section>
  );
}

export default function App() {
  return (
    <AdminAuthProvider>
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<RequireAdmin />}>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="usuarios" element={<UsersPage />} />
        <Route path="animais" element={<AnimalsPage />} />
        <Route path="*" element={<Placeholder title="Página não encontrada" description="Use o menu para acessar uma das páginas do painel." />} />
      </Route>
      </Route>
    </Routes>
    </AdminAuthProvider>
  );
}

function RequireAdmin() {
  const { admin, loading } = useAdminAuth();
  if (loading) return <main className="p-10" role="status">Verificando acesso administrativo…</main>;
  return admin ? <Outlet /> : <Navigate to="/login" replace />;
}
