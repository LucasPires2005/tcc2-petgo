import { useEffect, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { fetchAdminRecords } from '../lib/api';
import { formatDateTime, localTimeZone } from '../lib/dateTime.mjs';

const actions = { user_ban: 'Banimento', user_unban: 'Desbanimento', animal_delete: 'Exclusão de animal' };
const button = 'rounded-lg border bg-white px-4 py-2 disabled:opacity-50';

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
  return <section aria-busy={loading}>
    <h1 className="text-3xl font-semibold">{audit ? 'Histórico administrativo' : 'Arquivos de animais'}</h1>
    <p className="mt-3 text-slate-600">{audit ? 'Histórico de ações administrativas do PetGo.' : 'Inventário somente leitura do bucket animals. Nenhum arquivo será apagado por esta página.'}</p>
    <p className="mt-2 text-sm text-slate-500">Horário local · {timeZone}</p>
    <form className="mt-6 flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault(); setFilters({ page: 1, ...(audit ? { action: selection } : { q: search.trim(), link: selection }) });
    }}>
      {!audit && <label>Nome do arquivo<input className="mt-2 block rounded-lg border p-2" type="search" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} /></label>}
      <label>{audit ? 'Ação' : 'Vínculo'}<select className="mt-2 block rounded-lg border bg-white p-2" value={selection} onChange={(event) => setSelection(event.target.value)}>
        <option value="">Todos</option>
        {Object.entries(audit ? actions : { linked: 'Com vínculo direto', unlinked: 'Sem vínculo direto identificado' }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button className={button} disabled={loading}>Filtrar</button>
      <button className={button} type="button" disabled={loading} onClick={() => setAttempt((old) => old + 1)}>Atualizar</button>
    </form>
    {loading && <p role="status" className="mt-6">Carregando…</p>}
    {error && <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    {data && <>
      <p className="mt-6">{data.total} registro(s).</p>
      {!data.rows.length && <p className="mt-4">Nenhum registro encontrado.</p>}
      <div className="mt-4 space-y-4">{data.rows.map((row) => <article key={row.id} className="min-w-0 rounded-xl border bg-white p-5">
        {audit ? <>
          <h2 className="font-semibold">{actions[row.action] || row.action} · alvo #{row.target_id}</h2>
          <p className="mt-2 text-sm">{formatDateTime(row.created_at, timeZone)}</p>
          <p className="mt-2 break-all text-sm">Administrador (UUID): {row.actor_id}</p>
          <p className="mt-3 whitespace-pre-wrap break-words">Motivo: {row.reason}</p>
          {row.details?.name && <p className="mt-2 break-words">Animal: {row.details.name}</p>}
        </> : <>
          <h2 className="break-all font-semibold">{row.name}</h2>
          <p className="mt-2 text-sm">{formatDateTime(row.created_at, timeZone)} · {row.size_bytes == null ? 'Tamanho não informado' : `${Number(row.size_bytes).toLocaleString('pt-BR')} bytes`}</p>
          <p className="mt-2 text-sm">{row.animal_ids?.length ? `Animais vinculados: ${row.animal_ids.join(', ')}` : 'Sem vínculo direto identificado'}</p>
          {typeof row.url === 'string' && row.url.startsWith('https://') && <a className="mt-3 inline-block text-brand-700 underline" href={row.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Abrir arquivo</a>}
        </>}
      </article>)}</div>
      <nav aria-label="Paginação" className="mt-6 flex flex-wrap items-center gap-4">
        <button className={button} disabled={loading || data.page <= 1} onClick={() => setFilters((old) => ({ ...old, page: old.page - 1 }))}>Anterior</button>
        <span>Página {data.totalPages ? data.page : 0} de {data.totalPages}</span>
        <button className={button} disabled={loading || data.page >= data.totalPages} onClick={() => setFilters((old) => ({ ...old, page: old.page + 1 }))}>Próxima</button>
      </nav>
    </>}
    {!audit && <p className="mt-8 text-sm text-slate-600">A comparação usa as URLs públicas atuais de cadastro e resgate. URLs antigas, assinadas ou com outra codificação podem não ser reconhecidas. Ausência de vínculo não autoriza excluir: o arquivo pode estar em uso ou em um upload em andamento.</p>}
  </section>;
}
