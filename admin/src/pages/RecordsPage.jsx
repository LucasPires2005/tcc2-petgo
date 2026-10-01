import { useEffect, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { fetchAdminRecords } from '../lib/api';
import { formatDateTime, localTimeZone } from '../lib/dateTime.mjs';
import { auditTarget } from '../lib/auditTarget.mjs';
import EmptyState from '../components/EmptyState';

const actions = { user_ban: 'Banimento', user_unban: 'Desbanimento', animal_delete: 'Exclusão de animal', user_delete: 'Exclusão de conta' };
const button = 'admin-button';

function TargetDetails({ row }) {
  const fields = auditTarget(row);
  return <div className="mt-5 rounded-xl bg-slate-50 p-4">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{row.action === 'animal_delete' ? 'Animal afetado' : 'Usuário afetado'} · #{row.target_id}</h3>
    <dl className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {fields.map(field => <div key={field.key} className="min-w-0">
        <dt className="text-xs text-slate-500">{field.label}{field.source === 'current' && <span className="ml-2 text-brand-700">· dado atual</span>}</dt>
        <dd className="mt-1 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{field.value}</dd>
      </div>)}
    </dl>
    <p className="mt-4 border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-500">
      {fields.some(field => field.source === 'current')
        ? 'Campos marcados como atuais vêm do cadastro disponível hoje e podem diferir do momento da ação.'
        : fields.some(field => field.source === 'recorded') ? 'Dados preservados no registro da ação.' : 'Os dados do alvo não estão mais disponíveis.'}
      {fields.some(field => field.source === 'missing') && ' Este histórico não guardou todos os detalhes; informações ausentes não podem ser reconstruídas.'}
    </p>
  </div>;
}

export default function RecordsPage({ kind }) {
  const { accessToken, invalidateAccess } = useAdminAuth();
  const audit = kind === 'audit';
  const timeZone = localTimeZone();
  const [filters, setFilters] = useState({ page: 1 });
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    fetchAdminRecords(kind, accessToken, filters, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (filters.page > Math.max(1, result.totalPages)) {
        setFilters((old) => ({ ...old, page: Math.max(1, result.totalPages) })); return;
      }
      setData(result);
    }).catch((err) => {
      if (controller.signal.aborted) return;
      if ([401, 403].includes(err.status)) invalidateAccess(err.message);
      else setError(err.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, accessToken, filters, attempt, invalidateAccess]);
  return <section aria-busy={loading} aria-labelledby="records-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-medium text-brand-700">{audit ? 'Transparência e acompanhamento' : 'Biblioteca de imagens'}</p>
        <h1 id="records-title" className="mt-2 text-3xl font-semibold tracking-tight">{audit ? 'Histórico administrativo' : 'Arquivos de animais'}</h1>
        <p className="mt-3 max-w-2xl text-slate-600">{audit ? 'Ações, motivos e informações dos registros afetados, em um só lugar.' : 'Consulte as imagens e seus vínculos com os animais. Este inventário é somente leitura.'}</p>
        <p className="mt-2 text-xs text-slate-500">Horário local · {timeZone}</p></div>
      <button className={button} type="button" disabled={loading} onClick={() => setAttempt((old) => old + 1)}>Atualizar lista</button>
    </div>
    <form className="admin-toolbar" onSubmit={(event) => {
      event.preventDefault(); setFilters({ page: 1, ...(audit ? { action: selection } : { q: search.trim(), link: selection }) });
    }}>
      {!audit && <label className="min-w-0 flex-1 basis-48 text-sm font-medium">Nome do arquivo<input className="admin-input" placeholder="Buscar pelo nome da imagem" type="search" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} /></label>}
      <label className="min-w-0 flex-1 basis-48 text-sm font-medium">{audit ? 'Ação' : 'Vínculo'}<select className="admin-input" value={selection} onChange={(event) => setSelection(event.target.value)}>
        <option value="">Todos</option>
        {Object.entries(audit ? actions : { linked: 'Com vínculo direto', unlinked: 'Sem vínculo direto identificado' }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button className="admin-button-primary" disabled={loading}>Aplicar filtros</button>
    </form>
    {loading && <p role="status" className="mt-6">Carregando…</p>}
    {error && <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    {data && <>
      <p aria-live="polite" className="mt-6 text-sm text-slate-500">{data.total.toLocaleString('pt-BR')} registro(s) encontrado(s).</p>
      {!data.rows.length && <EmptyState title={audit ? 'Nenhuma ação encontrada' : 'Nenhum arquivo encontrado'}>
        {audit ? 'As ações administrativas aparecerão aqui. Se você aplicou um filtro, selecione “Todos” para ampliar a consulta.' : 'As fotos cadastradas aparecerão neste inventário. Revise o nome pesquisado ou selecione todos os vínculos.'}
      </EmptyState>}
      <div className="mt-4 space-y-4">{data.rows.map((row) => <article key={row.id} className="admin-card min-w-0 p-5 sm:p-6">
        {audit ? <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="rounded-full bg-surface px-3 py-1 text-sm font-semibold text-brand-700">{actions[row.action] || row.action}</h2>
            <p className="text-xs tabular-nums text-slate-500">{formatDateTime(row.created_at, timeZone)}</p>
          </div>
          <TargetDetails row={row} />
          <div className="mt-5 border-l-2 border-brand-700 pl-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Motivo da ação</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{row.reason}</p></div>
          <p className="mt-5 break-all border-t border-slate-100 pt-4 text-xs text-slate-500">Registro #{row.id} · Administrador (UUID): {row.actor_id}</p>
        </> : <>
          <h2 className="break-all font-semibold">{row.name}</h2>
          <p className="mt-2 text-sm text-slate-500">{formatDateTime(row.created_at, timeZone)} · {row.size_bytes == null ? 'Tamanho não informado' : `${Number(row.size_bytes).toLocaleString('pt-BR')} bytes`}</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 [overflow-wrap:anywhere]">{row.animal_ids?.length ? `Animais vinculados: ${row.animal_ids.join(', ')}` : 'Sem vínculo direto identificado'}</p>
            {typeof row.url === 'string' && row.url.startsWith('https://') && <a className={button} href={row.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Abrir arquivo <span className="sr-only">(nova aba)</span></a>}
          </div>
        </>}
      </article>)}</div>
      <nav aria-label="Paginação" className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-500">
        <button className={button} disabled={loading || data.page <= 1} onClick={() => setFilters((old) => ({ ...old, page: old.page - 1 }))}>Anterior</button>
        <span>Página {data.totalPages ? data.page : 0} de {data.totalPages}</span>
        <button className={button} disabled={loading || data.page >= data.totalPages} onClick={() => setFilters((old) => ({ ...old, page: old.page + 1 }))}>Próxima</button>
      </nav>
    </>}
    {!audit && <p className="admin-note">A comparação usa as URLs públicas atuais de cadastro e resgate. URLs antigas, assinadas ou com outra codificação podem não ser reconhecidas. Ausência de vínculo não autoriza excluir: o arquivo pode estar em uso ou em um upload em andamento.</p>}
  </section>;
}
