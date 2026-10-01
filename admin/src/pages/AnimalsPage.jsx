import { useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { deleteAdminAnimal, fetchAdminAnimals } from '../lib/api';
import { animalStatusLabel } from '../lib/animalStatus.mjs';
import ActionReasonModal from '../components/ActionReasonModal';

const buttonClass = 'rounded-lg border border-primary bg-white px-4 py-2 text-sm text-primary hover:bg-surface disabled:opacity-50';

function AnimalPhoto({ url, label }) {
  const [failed, setFailed] = useState(false);
  const safe = typeof url === 'string' && /^https?:\/\//i.test(url);
  return <figure className="min-w-0">
    <figcaption className="mb-2 text-xs font-medium text-slate-500">{label}</figcaption>
    {safe && !failed ? <a href={url} target="_blank" rel="noopener noreferrer" className="block" aria-label={`Ampliar ${label.toLowerCase()}`}>
      <img src={url} alt={label} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-44 w-full rounded-lg bg-slate-100 object-contain" />
    </a> : <p className="flex h-44 items-center justify-center rounded-lg bg-slate-100 p-3 text-sm text-slate-500">{safe ? 'Imagem indisponível' : 'Sem foto'}</p>}
  </figure>;
}

export default function AnimalsPage() {
  const { accessToken, invalidateAccess } = useAdminAuth();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ q: '', page: 1 });
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const deleteLock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [warning, setWarning] = useState('');
  const [selectedAnimal, setSelectedAnimal] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setData(null); setError('');
    fetchAdminAnimals(accessToken, filters, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      const lastPage = Math.max(1, result.totalPages);
      if (filters.page > lastPage) {
        setFilters((old) => ({ ...old, page: lastPage })); return;
      }
      setData(result);
    }).catch((err) => {
      if (controller.signal.aborted) return;
      if (err.status === 401 || err.status === 403) invalidateAccess(err.message);
      else setError(err.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accessToken, filters, attempt, invalidateAccess]);

  async function remove(animal, reason) {
    if (deleteLock.current) return;
    if (reason.trim().length < 3 || reason.trim().length > 500) {
      setError('Informe um motivo com 3 a 500 caracteres.'); return;
    }
    setSelectedAnimal(null);
    deleteLock.current = true;
    setDeleting(animal.id); setError(''); setNotice(''); setWarning('');
    try {
      const result = await deleteAdminAnimal(accessToken, animal.id, reason.trim());
      if (result.storageCleanup?.status === 'partial') {
        setWarning(`Registro ID ${animal.id} excluído do aplicativo, mas a limpeza de algumas fotos não foi concluída. Confira o inventário de Arquivos e os logs do servidor.`);
      } else if (result.storageCleanup?.status === 'complete') {
        setNotice(`Registro ID ${animal.id} excluído. Limpeza das fotos concluída.${result.storageCleanup.shared ? ' Fotos usadas por outros animais foram preservadas.' : ''}`);
      } else {
        setWarning(`Registro ID ${animal.id} excluído. O servidor não confirmou a limpeza das fotos; confira o inventário de Arquivos.`);
      }
      setAttempt((value) => value + 1);
    } catch (err) {
      if (err.status === 401 || err.status === 403) invalidateAccess(err.message);
      else setError(`${err.message} Atualize a lista para conferir o resultado antes de repetir a exclusão.`);
    } finally { deleteLock.current = false; setDeleting(null); }
  }

  const busy = loading || deleting !== null;
  return <section aria-labelledby="animals-title" aria-busy={busy}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 id="animals-title" className="text-3xl font-semibold">Animais</h1>
        <p className="mt-3 text-slate-600">Revise fotos de cadastro e resgate. Clique na foto para ampliá-la.</p></div>
      <button className={buttonClass} disabled={busy} onClick={() => setAttempt((value) => value + 1)}>Atualizar lista</button>
    </div>
    <form className="mt-6 flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault(); setFilters({ q: search.trim(), page: 1 });
    }}>
      <label className="min-w-0 flex-1 text-sm font-medium">Nome do animal
        <input className="mt-2 block w-full rounded-lg border p-3" type="search" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} disabled={busy} />
      </label>
      <button className={buttonClass} disabled={busy}>Buscar</button>
      <button type="button" className={buttonClass} disabled={busy} onClick={() => { setSearch(''); setFilters({ q: '', page: 1 }); }}>Limpar</button>
    </form>
    {notice && <p role="status" className="mt-5 rounded-lg bg-green-50 p-4 text-green-800">{notice}</p>}
    {warning && <p role="alert" className="mt-5 rounded-lg bg-amber-50 p-4 text-amber-900">{warning}</p>}
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    {loading && <p role="status" className="mt-6">Carregando animais…</p>}
    {data && <>
      <p className="mt-6 text-sm text-slate-500">{data.total} animal(is) encontrado(s).</p>
      {!data.animals.length && <p className="mt-5 rounded-xl border bg-white p-8">Nenhum animal encontrado.</p>}
      <div className="mt-4 grid gap-5 lg:grid-cols-2">{data.animals.map((animal) => <article key={animal.id} className="min-w-0 rounded-xl border bg-white p-5">
        <h2 className="break-words text-xl font-semibold">{animal.name || 'Sem nome'} <span className="text-sm font-normal text-slate-500">#{animal.id}</span></h2>
        <p className="mt-2 break-words text-sm text-slate-600">{animal.species || 'Espécie não informada'} · {animal.breed || 'Raça não informada'}</p>
        <p className="mt-2 break-words text-sm">Status: {animalStatusLabel(animal.status)} · Urgência: {animal.urgency ?? 'Não informada'}</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm">Saúde: {animal.health || 'Não informada'}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <AnimalPhoto key={`original-${animal.image_url}`} url={animal.image_url} label="Foto do cadastro" />
          <AnimalPhoto key={`rescue-${animal.rescue_image_url}`} url={animal.rescue_image_url} label="Foto do resgate" />
        </div>
        <button disabled={busy} className="mt-5 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50" onClick={() => setSelectedAnimal(animal)}>
          {deleting === animal.id ? 'Excluindo…' : 'Excluir registro'}
        </button>
      </article>)}</div>
      <nav aria-label="Paginação de animais" className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm">Página {data.totalPages ? data.page : 0} de {data.totalPages}</p>
        <div className="flex gap-3">
          <button className={buttonClass} disabled={busy || data.page <= 1} onClick={() => setFilters((old) => ({ ...old, page: old.page - 1 }))}>Anterior</button>
          <button className={buttonClass} disabled={busy || data.page >= data.totalPages} onClick={() => setFilters((old) => ({ ...old, page: old.page + 1 }))}>Próxima</button>
        </div>
      </nav>
    </>}
    <p className="mt-8 text-sm text-slate-500">Excluir remove o registro e suas fotos do Storage. Fotos usadas por outros animais são preservadas. Não desfaz moedas concedidas. O app refletirá a exclusão ao consultar novamente os animais.</p>
    {selectedAnimal && <ActionReasonModal title="Motivo da Exclusão" destructive
      description={`Excluir definitivamente o registro "${selectedAnimal.name || 'Sem nome'}" (ID ${selectedAnimal.id})?\nEle deixará de aparecer nas próximas consultas do aplicativo. Suas fotos serão apagadas do Storage, exceto as compartilhadas com outros animais. Não há desfazer; contas e moedas não serão alteradas.`}
      confirmLabel="Excluir registro" onCancel={() => setSelectedAnimal(null)}
      onConfirm={(reason) => remove(selectedAnimal, reason)} />}
  </section>;
}
