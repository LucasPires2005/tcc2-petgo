import { animalStatusLabel } from './animalStatus.mjs';

export function auditTarget(row) {
  const animal = row.action === 'animal_delete';
  const fields = animal ? [['name', 'Nome'], ['species', 'Espécie'], ['health', 'Saúde'], ['status', 'Status']]
    : [['name', 'Nome'], ['email', 'E-mail']];
  const saved = row.details && typeof row.details === 'object' ? row.details : {};
  const current = row.current_target && typeof row.current_target === 'object' ? row.current_target : {};
  return fields.map(([key, label]) => {
    const source = Object.hasOwn(saved, key) ? 'recorded' : Object.hasOwn(current, key) ? 'current' : 'missing';
    const raw = source === 'recorded' ? saved[key] : current[key];
    const value = source === 'missing' ? 'Não registrado'
      : key === 'status' ? animalStatusLabel(raw)
      : typeof raw === 'string' && raw.trim() ? raw : 'Não informado';
    return { key, label, source, value };
  });
}
