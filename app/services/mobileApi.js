// Token apenas em memória, como o perfil atual. Não intercepta fetch global,
// links de e-mail, imagens locais nem requisições para serviços externos.
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://tcc-2026-1-e-2-petgo.onrender.com').replace(/\/$/, '');
let token = null;
let onInvalidSession = null;
export function setMobileSession(accessToken) { token = accessToken || null; }
// Protege operações que aguardam armazenamento local antes de enviar a requisição.
export function captureSessionGuard() {
  const expected = token;
  return () => {
    if (!expected || token !== expected) throw new Error('A sessão mudou durante a operação. Entre novamente.');
  };
}
export function onMobileSessionInvalid(callback) {
  onInvalidSession = callback;
  return () => { if (onInvalidSession === callback) onInvalidSession = null; };
}
export async function mobileFetch(url, options = {}) {
  if (!url.startsWith(`${API_BASE_URL}/`)) throw new Error('Destino de API não permitido.');
  const sentToken = token;
  const response = await fetch(url, {
    ...options,
    headers: { ...options.headers, ...(sentToken ? { Authorization: `Bearer ${sentToken}` } : {}) }
  });
  // Uma resposta antiga não deve restaurar o perfil depois de logout/banimento.
  if (sentToken !== token) throw new Error('A sessão mudou durante a requisição.');
  if (response.status === 401 || response.status === 403) {
    const data = await response.clone().json().catch(() => ({}));
    if (token === sentToken && sentToken && ['SESSION_INVALID', 'ACCOUNT_BANNED'].includes(data.code)) {
      token = null;
      onInvalidSession?.(data.error);
    }
  }
  return response;
}
