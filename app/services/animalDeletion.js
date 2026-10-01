import { mobileFetch, API_BASE_URL } from './mobileApi';

export function isAnimalAuthor(animal, userId) {
  return userId != null && animal?.creator_id != null && String(animal.creator_id) === String(userId);
}

export async function deleteOwnAnimal(id, reason) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1 || typeof reason !== 'string'
      || reason.trim().length < 3 || reason.trim().length > 500) throw new Error('Informe um motivo com 3 a 500 caracteres.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await mobileFetch(`${API_BASE_URL}/animals/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }), signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível excluir. Atualize a lista antes de tentar novamente.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('A confirmação demorou. Atualize a lista antes de tentar excluir novamente.');
    throw error;
  } finally { clearTimeout(timeout); }
}
