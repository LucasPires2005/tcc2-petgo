import { apiBaseUrl } from './supabase';

async function adminGet(path, accessToken, signal, method = 'GET', body) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  // O serviço gratuito pode precisar iniciar após um período inativo.
  const timeout = setTimeout(() => controller.abort(), 65000);
  try {
    const response = await fetch(`${apiBaseUrl}/admin${path}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
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

export async function fetchAdminAnimals(accessToken, filters, signal) {
  const data = await adminGet(`/animals?${new URLSearchParams(filters)}`, accessToken, signal);
  if (!Array.isArray(data.animals) || !Number.isSafeInteger(data.total) || data.total < 0
      || !Number.isSafeInteger(data.totalPages) || data.totalPages < 0) {
    throw new Error('O servidor retornou uma listagem inválida.');
  }
  return data;
}

export function deleteAdminAnimal(accessToken, id, reason) {
  return adminGet(`/animals/${encodeURIComponent(id)}`, accessToken, undefined, 'DELETE', { reason });
}

export function setAdminUserBan(accessToken, id, banned, reason) {
  return adminGet(`/users/${encodeURIComponent(id)}/ban`, accessToken, undefined, 'PUT', { banned, reason });
}

export async function fetchAdminRecords(kind, accessToken, filters, signal) {
  if (!['audit', 'files'].includes(kind)) throw new Error('Consulta inválida.');
  const data = await adminGet(`/${kind}?${new URLSearchParams(filters)}`, accessToken, signal);
  const rows = data[kind === 'audit' ? 'entries' : 'files'];
  if (!Array.isArray(rows) || !Number.isSafeInteger(data.total) || data.total < 0
      || !Number.isSafeInteger(data.totalPages) || data.totalPages < 0) throw new Error('Listagem inválida.');
  return { ...data, rows };
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

export async function fetchAdminUsers(accessToken, filters, signal) {
  const query = new URLSearchParams(filters);
  const data = await adminGet(`/users?${query}`, accessToken, signal);
  if (!Array.isArray(data.users) || !Number.isSafeInteger(data.total) || data.total < 0
      || !Number.isSafeInteger(data.totalPages) || data.totalPages < 0) {
    throw new Error('O servidor retornou uma listagem inválida. Tente novamente.');
  }
  return data;
}
