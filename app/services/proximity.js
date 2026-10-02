export function normalizeCoordinates(value) {
  if (!value || value.latitude === null || value.longitude === null
      || value.latitude === undefined || value.longitude === undefined
      || !['number', 'string'].includes(typeof value.latitude)
      || !['number', 'string'].includes(typeof value.longitude)
      || String(value.latitude).trim() === '' || String(value.longitude).trim() === '') return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && Number.isFinite(longitude) && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}

// Fórmula de Haversine já utilizada em Animais Próximos, em quilômetros.
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180)
    * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const safe = Math.max(0, Math.min(1, a));
  return R * 2 * Math.atan2(Math.sqrt(safe), Math.sqrt(1 - safe));
}

export function nearbyItems(items, origin, radius) {
  const point = normalizeCoordinates(origin);
  if (!point || !Number.isFinite(radius) || radius <= 0) return [];
  return items.flatMap(item => {
    const destination = normalizeCoordinates(item);
    if (!destination) return [];
    const dist = calculateDistance(point.latitude, point.longitude, destination.latitude, destination.longitude);
    return dist <= radius ? [{ ...item, dist }] : [];
  }).sort((a, b) => a.dist - b.dist);
}
