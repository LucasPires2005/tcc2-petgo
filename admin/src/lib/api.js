import { apiBaseUrl } from './supabase';

export async function fetchAdminIdentity(accessToken) {
  const controller = new AbortController();
  // O serviço gratuito pode precisar iniciar após um período inativo.
  const timeout = setTimeout(() => controller.abort(), 65000);
  try {
    const response = await fetch(`${apiBaseUrl}/admin/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Não foi possível verificar sua permissão. Confira se o backend foi atualizado.');
    }
    if (!data.admin?.id) throw new Error('O servidor não retornou uma autorização válida.');
    return data.admin;
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError) {
      throw new Error('Não foi possível conectar ao servidor. Aguarde alguns instantes e tente novamente.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
