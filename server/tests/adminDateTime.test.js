const { test } = require('node:test');
const assert = require('node:assert/strict');
const helpers = import('../../admin/src/lib/dateTime.mjs');

test('horários admin: UTC convertido para Brasília e Cuiabá sem deslocamento duplo', async () => {
  const { formatDateTime } = await helpers;
  assert.equal(formatDateTime('2026-09-22T14:05:09Z', 'America/Sao_Paulo'), '22/09/2026, 11:05:09');
  assert.equal(formatDateTime('2026-09-22T14:05:09Z', 'America/Cuiaba'), '22/09/2026, 10:05:09');
  assert.equal(formatDateTime('2026-09-22T10:05:09-04:00', 'America/Cuiaba'), '22/09/2026, 10:05:09');
});

test('horários admin: virada de dia e meia-noite em formato 24 horas', async () => {
  const { formatDateTime } = await helpers;
  assert.equal(formatDateTime('2026-09-22T02:00:00+00:00', 'America/Cuiaba'), '21/09/2026, 22:00:00');
  assert.equal(formatDateTime('2026-09-22T03:00:00Z', 'America/Sao_Paulo'), '22/09/2026, 00:00:00');
});

test('horários admin: padrão acompanha dispositivo e datas ausentes não quebram tela', async () => {
  const { formatDateTime, localTimeZone } = await helpers;
  const value = '2026-09-22T14:05:09Z';
  assert.equal(formatDateTime(value), formatDateTime(value, Intl.DateTimeFormat().resolvedOptions().timeZone));
  assert.equal(localTimeZone(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  for (const missing of [null, undefined, '', 'inválida']) assert.equal(formatDateTime(missing), 'Não informado');
});
