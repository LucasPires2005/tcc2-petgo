import { useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { fetchAdminUsers, setAdminUserBan } from '../lib/api';

const plans = { 0: 'Sem plano', 1: 'Amigo', 2: 'Protetor', 3: 'Guardião' };
const buttonClass = 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50';

export default function UsersPage() {
  const { accessToken, invalidateAccess } = useAdminAuth();
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('');
  const [filters, setFilters] = useState({ q: '', plan: '', page: 1 });
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [changing, setChanging] = useState(false);
  const actionLock = useRef(false);
  const [notice, setNotice] = useState('');

  async function changeBan(user) {
    if (actionLock.current || user.is_admin) return;
    const banned = !user.banned;
    const reason = window.prompt('Informe o motivo desta ação (3 a 500 caracteres):');
    if (reason === null) return;
    if (reason.trim().length < 3 || reason.trim().length > 500) {
      setError('Informe um motivo com 3 a 500 caracteres.'); return;
    }
    if (!window.confirm(`${banned ? 'Banir' : 'Desbanir'} ${user.name || user.email} (ID ${user.id})?\nAs sessões anteriores serão revogadas. Não exclui contas, animais ou moedas.`)) return;
    actionLock.current = true; setChanging(true); setError(''); setNotice('');
    try {
      await setAdminUserBan(accessToken, user.id, banned, reason.trim());
      setNotice(banned ? 'Conta banida. Novas chamadas protegidas serão bloqueadas.' : 'Conta liberada. O usuário deve entrar novamente.');
      setAttempt((value) => value + 1);
    } catch (err) {
      if (err.status === 401 || err.status === 403) invalidateAccess(err.message);
      else setError(`${err.message} Atualize a lista antes de repetir a ação.`);
    } finally { actionLock.current = false; setChanging(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    fetchAdminUsers(accessToken, filters, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.totalPages > 0 && filters.page > result.totalPages) {
        setFilters((previous) => ({ ...previous, page: result.totalPages }));
        return;
      }
      setData(result);
    }).catch((err) => {
      if (controller.signal.aborted) return;
      if (err.status === 401 || err.status === 403) invalidateAccess(err.message);
      else setError(err.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accessToken, filters, attempt, invalidateAccess]);

  return (
    <section aria-labelledby="users-title" aria-busy={loading}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 id="users-title" className="text-3xl font-semibold tracking-tight">Usuários</h1>
          <p className="mt-3 text-slate-600">Consulte os perfis e o plano registrado no PetGo.</p>
        </div>
        <button disabled={loading} onClick={() => setAttempt((value) => value + 1)} className={buttonClass}>Atualizar lista</button>
      </div>
      <form className="mt-8 flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-5" onSubmit={(event) => {
        event.preventDefault(); setFilters({ q: search.trim(), plan, page: 1 });
      }}>
        <label className="min-w-0 flex-1 text-sm font-medium">Nome ou e-mail
          <input type="search" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar usuário" className="mt-2 block w-full rounded-lg border border-slate-300 p-3" />
        </label>
        <label className="text-sm font-medium">Plano
          <select value={plan} onChange={(event) => setPlan(event.target.value)} className="mt-2 block rounded-lg border border-slate-300 bg-white p-3">
            <option value="">Todos os planos</option>
            {Object.entries(plans).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button disabled={loading} className="rounded-lg bg-brand-700 px-5 py-3 text-sm font-medium text-white disabled:opacity-50">Buscar</button>
        <button type="button" disabled={loading} className={buttonClass} onClick={() => {
          setSearch(''); setPlan(''); setFilters({ q: '', plan: '', page: 1 });
        }}>Limpar</button>
      </form>
      {loading && <p role="status" className="mt-6 text-slate-500">Carregando usuários…</p>}
      {notice && <p role="status" className="mt-6 rounded-lg bg-green-50 p-4 text-green-800">{notice}</p>}
      {error && <p role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-red-800">{error} Use Atualizar lista para tentar novamente.</p>}
      {data && <>
        <p aria-live="polite" className="mt-6 text-sm text-slate-500">{data.total.toLocaleString('pt-BR')} usuário(s) encontrado(s).</p>
        {data.users.length === 0 ? <p className="mt-4 rounded-xl border bg-white p-8">Nenhum usuário encontrado para esta consulta.</p> : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Usuários e planos registrados</caption>
              <thead className="bg-slate-100 text-slate-600"><tr>{['ID', 'Nome', 'E-mail', 'Plano', 'PetCoins', 'Acesso'].map((label) => <th key={label} scope="col" className="px-5 py-4">{label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{data.users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4 text-slate-500">{user.id}</td>
                  <td className="px-5 py-4 font-medium">{user.name || 'Nome não informado'}</td>
                  <td className="break-all px-5 py-4">{user.email || 'Não informado'}</td>
                  <td className="whitespace-nowrap px-5 py-4"><span className="rounded-full bg-brand-50 px-3 py-1 text-brand-700">{plans[user.plan_tier ?? 0] || 'Não reconhecido'}</span></td>
                  <td className="px-5 py-4 tabular-nums">{user.coins == null ? '—' : Number(user.coins).toLocaleString('pt-BR')}</td>
                  <td className="px-5 py-4">
                    <p className="mb-2">{user.is_admin ? 'ADM protegido' : user.banned ? 'Banido' : 'Liberado'}</p>
                    {!user.is_admin && <button className={buttonClass} disabled={loading || changing} onClick={() => changeBan(user)}>{user.banned ? 'Desbanir' : 'Banir'}</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <nav aria-label="Paginação de usuários" className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-slate-500">Página {data.totalPages === 0 ? 0 : data.page} de {data.totalPages} · até {data.pageSize} por página</p>
          <div className="flex gap-3">
            <button disabled={loading || data.page <= 1} className={buttonClass} onClick={() => setFilters((old) => ({ ...old, page: old.page - 1 }))}>Anterior</button>
            <button disabled={loading || data.page >= data.totalPages} className={buttonClass} onClick={() => setFilters((old) => ({ ...old, page: old.page + 1 }))}>Próxima</button>
          </div>
        </nav>
      </>}
      <p className="mt-8 text-sm text-slate-500">O plano exibido não confirma pagamento. Banimento bloqueia o acesso à API mobile, sem excluir dados. Contas ADM são protegidas. Exclusão de usuários não está incluída nesta etapa.</p>
    </section>
  );
}
