import { mobileFetch, API_BASE_URL } from './mobileApi';
import { normalizeCoordinates, nearbyItems } from './proximity';

export const SUPPORT_CATEGORIES = Object.freeze([
  { value: 'all', label: 'Todos' }, { value: 'store', label: 'Lojas' },
  { value: 'clinic', label: 'Clínicas' }, { value: 'ngo', label: 'ONGs' }
]);

export function categoryLabel(category) {
  return { store: 'Loja', clinic: 'Clínica veterinária', ngo: 'ONG' }[category] || 'Rede de apoio';
}

export function nearbyPartners(items, origin, radius, category = 'all') {
  return nearbyItems(items.filter(item => category === 'all' || item.category === category), origin, radius);
}

export async function loadSupportNetwork() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await mobileFetch(`${API_BASE_URL}/support-network`, { signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Não foi possível carregar a rede de apoio.');
    if (!Array.isArray(data?.items) || data.items.some(item => !item || typeof item.id !== 'string'
      || typeof item.name !== 'string' || typeof item.address !== 'string' || typeof item.description !== 'string'
      || !['store', 'clinic', 'ngo'].includes(item.category) || !normalizeCoordinates(item))) {
      throw new Error('Não foi possível carregar a rede de apoio.');
    }
    return data.items;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('A consulta demorou mais que o esperado. Tente novamente.');
    throw error;
  } finally { clearTimeout(timeout); }
}

export function directionsUrls(partner, platform) {
  const point = normalizeCoordinates(partner);
  if (!point) throw new Error('Localização do estabelecimento indisponível.');
  const coordinate = `${point.latitude},${point.longitude}`;
  const fallback = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordinate)}`;
  const native = platform === 'ios' ? `maps://?daddr=${coordinate}`
    : platform === 'android' ? `geo:0,0?q=${coordinate}(${encodeURIComponent(partner.name)})` : fallback;
  return { native, fallback };
}
