import { apiBaseUrl } from './supabase';

async function adminGet(path, accessToken, signal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  // O serviço gratuito pode precisar iniciar após um período inativo.
  const timeout = setTimeout(() => controller.abort(), 65000);
  try {
    const response = await fetch(`${apiBaseUrl}/admin${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Não foi possível carregar os dados. Confira se o backend foi atualizado.');
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) {
      throw new Error('Não foi possível conectar ao servidor. Aguarde alguns instantes e tente novamente.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function fetchAdminIdentity(accessToken) {
  const data = await adminGet('/me', accessToken);
  if (!data.admin?.id) throw new Error('O servidor não retornou uma autorização válida.');
  return data.admin;
}

export async function fetchAdminSummary(accessToken, signal) {
  const data = await adminGet('/summary', accessToken, signal);
  if (![data.users, data.animals].every((count) => Number.isSafeInteger(count) && count >= 0)
      || typeof data.updatedAt !== 'string' || !Number.isFinite(Date.parse(data.updatedAt))) {
    throw new Error('O servidor retornou contagens inválidas. Tente novamente.');
  }
  return data;
}
