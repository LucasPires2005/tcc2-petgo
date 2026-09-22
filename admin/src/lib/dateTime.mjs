export function localTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// A API fornece timestamps com Z ou deslocamento UTC; não subtrair horas manualmente.
export function formatDateTime(value, timeZone = localTimeZone()) {
  if (typeof value !== 'string' || !value.trim()) return 'Não informado';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Não informado';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(({ type, value: part }) => [type, part]));
  return `${parts.day}/${parts.month}/${parts.year}, ${parts.hour}:${parts.minute}:${parts.second}`;
}
