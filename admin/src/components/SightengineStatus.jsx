import { useEffect, useState } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { fetchSightengineStatus } from '../lib/api';

export default function SightengineStatus() {
  const { accessToken, invalidateAccess } = useAdminAuth();
  const [configured, setConfigured] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setConfigured(null); setError('');
    fetchSightengineStatus(accessToken, controller.signal).then((data) => {
      if (!controller.signal.aborted) setConfigured(data.configured);
    }).catch((err) => {
      if (controller.signal.aborted) return;
      if (err.status === 401 || err.status === 403) invalidateAccess(err.message);
      else setError(err.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accessToken, attempt, invalidateAccess]);

  return <section aria-labelledby="sightengine-title" aria-busy={loading} className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
    <h2 id="sightengine-title" className="font-semibold">Moderação automática</h2>
    <p role="status" className={`mt-3 font-medium ${configured === true ? 'text-green-700' : 'text-slate-600'}`}>
      Sightengine: {loading ? 'Verificando…' : configured === true ? 'Ativo' : 'Indisponível'}
    </p>
    {!loading && configured === false && <p className="mt-2 text-sm text-slate-600">Falta configurar as credenciais de moderação no backend.</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">Não foi possível verificar a configuração. {error}</p>}
    {configured === true && <p className="mt-3 text-sm text-slate-500">Serviço de moderação automática de imagens configurado.</p>}
    <button disabled={loading} onClick={() => setAttempt((value) => value + 1)} className="mt-4 rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Verificar novamente</button>
  </section>;
}
