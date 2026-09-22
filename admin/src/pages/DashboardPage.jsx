import { useEffect, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { fetchAdminSummary } from '../lib/api';
import UpdatedAt from '../components/UpdatedAt';
import SightengineStatus from '../components/SightengineStatus';

const numberFormat = new Intl.NumberFormat('pt-BR');

export default function DashboardPage() {
  const { accessToken, invalidateAccess } = useAdminAuth();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchAdminSummary(accessToken, controller.signal).then((data) => {
      if (!controller.signal.aborted) setSummary(data);
    }).catch((err) => {
      if (controller.signal.aborted) return;
      if (err.status === 401 || err.status === 403) {
        setSummary(null);
        invalidateAccess(err.message);
      } else {
        setError(err.message);
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [accessToken, attempt, invalidateAccess]);

  return (
    <section aria-labelledby="dashboard-title" aria-busy={loading}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand-700">Acompanhamento do PetGo</p>
          <h1 id="dashboard-title" className="mt-2 text-3xl font-semibold tracking-tight">Visão geral</h1>
          <p className="mt-3 text-slate-600">Usuários e animais cadastrados no aplicativo.</p>
        </div>
        <button
          onClick={() => setAttempt((value) => value + 1)}
          disabled={loading}
          className="rounded-xl bg-brand-700 px-5 py-3 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-wait disabled:opacity-50"
        >
          {loading ? 'Carregando…' : 'Atualizar contagens'}
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{error}</p>
          {summary && <p className="mt-1">Os números abaixo são da última consulta bem-sucedida.</p>}
        </div>
      )}
      {loading && <p role="status" className="mt-6 text-sm text-slate-500">Consultando os dados. A primeira conexão pode levar alguns instantes.</p>}

      <dl className="mt-8 grid gap-6 sm:grid-cols-2">
        {[
          { field: 'users', title: 'Usuários', detail: 'Perfis cadastrados no PetGo', color: 'text-brand-700' },
          { field: 'animals', title: 'Animais', detail: 'Todos os registros, incluindo resgatados', color: 'text-blue-700' }
        ].map(({ field, title, detail, color }) => (
          <div key={field} className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <dt className="font-medium text-slate-600">{title}</dt>
            <dd className={`mt-4 text-5xl font-semibold tabular-nums ${color}`}>
              {summary ? numberFormat.format(summary[field]) : <span aria-label="Contagem ainda indisponível">—</span>}
            </dd>
            <dd className="mt-4 text-sm text-slate-500">{detail}</dd>
          </div>
        ))}
      </dl>
      {summary && <UpdatedAt value={summary.updatedAt} />}
      {summary?.users === 0 && summary?.animals === 0 && (
        <p className="mt-4 rounded-xl bg-white p-4 text-slate-600">Ainda não há usuários ou animais cadastrados no aplicativo.</p>
      )}
      <SightengineStatus />
    </section>
  );
}
