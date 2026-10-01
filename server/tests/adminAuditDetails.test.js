const { test } = require('node:test');
const assert = require('node:assert/strict');

test('histórico: snapshot de usuário prevalece sobre cadastro atual', async () => {
  const { auditTarget } = await import('../../admin/src/lib/auditTarget.mjs');
  const fields = auditTarget({ action: 'user_ban', details: { name: 'Nome antigo', email: 'antigo@example.test' }, current_target: { name: 'Nome novo', email: 'novo@example.test' } });
  assert.deepEqual(fields.map(field => field.value), ['Nome antigo', 'antigo@example.test']);
  assert.ok(fields.every(field => field.source === 'recorded'));
});

test('histórico antigo: fallback atual é identificado; alvo apagado não é inventado', async () => {
  const { auditTarget } = await import('../../admin/src/lib/auditTarget.mjs');
  const fields = auditTarget({ action: 'user_unban', details: { banned: false }, current_target: { name: 'Hoje', email: 'hoje@example.test' } });
  assert.ok(fields.every(field => field.source === 'current'));
  const deleted = auditTarget({ action: 'user_delete', details: null, current_target: null });
  assert.ok(deleted.every(field => field.source === 'missing' && field.value === 'Não registrado'));
});

test('histórico animal: saúde/espécie preservadas e status zero não some', async () => {
  const { auditTarget } = await import('../../admin/src/lib/auditTarget.mjs');
  const fields = auditTarget({ action: 'animal_delete', details: { name: 'Luna', species: 'Gato', health: 'Em tratamento', status: 0 } });
  assert.deepEqual(fields.map(field => field.value), ['Luna', 'Gato', 'Em tratamento', 'Aguardando resgate']);
  assert.ok(fields.every(field => field.source === 'recorded'));
});

test('histórico: nulo gravado não é substituído por dado atual; ignora objetos inesperados', async () => {
  const { auditTarget } = await import('../../admin/src/lib/auditTarget.mjs');
  const fields = auditTarget({ action: 'user_delete', details: { name: null, email: {} }, current_target: { name: 'Atual' } });
  assert.ok(fields.every(field => field.value === 'Não informado' && field.source === 'recorded'));
  const oldAnimal = auditTarget({ action: 'animal_delete', details: { name: 'Luna' } });
  assert.equal(oldAnimal[0].source, 'recorded');
  assert.ok(oldAnimal.slice(1).every(field => field.source === 'missing'));
});
