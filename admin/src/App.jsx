import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';

const sections = [
  { path: '/dashboard', title: 'Visão geral', description: 'Contagem de animais e usuários será conectada na próxima etapa.' },
  { path: '/usuarios', title: 'Usuários', description: 'Consulta de contas e planos, com ações administrativas protegidas.' },
  { path: '/animais', title: 'Animais', description: 'Revisão de fotos e registros para moderação.' }
];

function Layout() {
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-slate-200 bg-white p-6 md:min-h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r">
        <p className="text-2xl font-bold tracking-tight text-brand-700">PetGo<span className="text-slate-400">.</span></p>
        <p className="mt-1 text-sm text-slate-500">Painel administrativo</p>
        <nav aria-label="Navegação principal" className="mt-8 flex flex-wrap gap-2 md:flex-col">
          {[{ path: '/login', title: 'Acesso' }, ...sections].map(({ path, title }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => `rounded-xl px-4 py-3 text-sm font-medium transition-colors ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {title}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main id="conteudo" className="w-full min-w-0 p-6 md:p-10">
        <div className="mx-auto max-w-5xl">
          <p className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Prévia da estrutura — autenticação e acesso a dados ainda não habilitados.
          </p>
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
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/login" replace />} />
        <Route path="login" element={<Placeholder title="Acesso administrativo" description="Área reservada à equipe PetGo. O login e a verificação de permissão serão implementados na próxima etapa." />} />
        {sections.map(({ path, title, description }) => (
          <Route key={path} path={path} element={<Placeholder title={title} description={description} />} />
        ))}
        <Route path="*" element={<Placeholder title="Página não encontrada" description="Use o menu para acessar uma das páginas do painel." />} />
      </Route>
    </Routes>
  );
}
