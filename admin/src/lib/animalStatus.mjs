export function animalStatusLabel(status) {
  if (status === 0 || status === '0') return 'Aguardando resgate';
  if (status === 1 || status === '1') return 'Resgatado';
  if (status == null || status === '') return 'Não informado';
  return 'Status desconhecido';
}
