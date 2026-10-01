const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moderateImage, evaluateModeration } = require('../services/imageModeration');
const clean = () => ({ status: 'success', nudity: { sexual_activity: 0, sexual_display: 0, erotica: 0 }, gore: { prob: 0 }, faces: [], artificial_faces: [] });
const face = { x1: 0.2, x2: 0.6, y1: 0.1, y2: 0.6 };

test('anti-selfie bloqueia rosto real/artificial proeminente e não confunde ausência de rosto com cão/gato', () => {
  assert.equal(evaluateModeration(clean()).allowed, true);
  for (const field of ['faces', 'artificial_faces']) {
    assert.equal(evaluateModeration({ ...clean(), [field]: [face] }).allowed, false);
  }
  assert.equal(evaluateModeration({ ...clean(), faces: [{ x1: 0, x2: 0.05, y1: 0, y2: 0.05 }] }).allowed, true);
});

test('moderação preserva critérios sexuais/gráficos existentes', () => {
  assert.match(evaluateModeration({ ...clean(), nudity: { sexual_activity: 0.7, sexual_display: 0, erotica: 0 } }).reason, /sexual/);
  assert.match(evaluateModeration({ ...clean(), gore: { prob: 0.9 } }).reason, /violência/);
});

test('resposta incompleta ou coordenadas inválidas falham fechadas', () => {
  for (const value of [null, {}, { ...clean(), faces: undefined }, { ...clean(), gore: {} }, { ...clean(), faces: [{}] }, { ...clean(), faces: [{ ...face, x2: 5 }] }]) {
    assert.throws(() => evaluateModeration(value), { code: 'MODERATION_UNAVAILABLE' });
  }
});

function setup(t) {
  const old = [process.env.SIGHTENGINE_API_USER, process.env.SIGHTENGINE_API_SECRET];
  process.env.SIGHTENGINE_API_USER = 'unit-test-user'; process.env.SIGHTENGINE_API_SECRET = 'unit-test-secret';
  t.after(() => ['SIGHTENGINE_API_USER', 'SIGHTENGINE_API_SECRET'].forEach((key, i) => { if (old[i] === undefined) delete process.env[key]; else process.env[key] = old[i]; }));
  return { buffer: Buffer.from('synthetic'), mimetype: 'image/jpeg', originalname: 'pet.jpg' };
}

test('requisição real do serviço inclui face-analysis e mensagens não expõem chaves', async t => {
  const file = setup(t);
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.sightengine.com/1.0/check.json');
    assert.equal(options.body.get('models'), 'nudity-2.1,gore-2.0,face-analysis');
    return { ok: true, json: async () => clean() };
  });
  assert.equal((await moderateImage(file)).allowed, true);
});

test('sem configuração ou provedor indisponível não aprova upload silenciosamente', async t => {
  const file = setup(t);
  t.mock.method(global, 'fetch', async () => ({ ok: false, json: async () => ({ status: 'failure' }) }));
  await assert.rejects(moderateImage(file), { code: 'MODERATION_UNAVAILABLE' });
  process.env.SIGHTENGINE_API_SECRET = '  ';
  await assert.rejects(moderateImage(file), { code: 'MODERATION_UNAVAILABLE' });
  assert.equal((await moderateImage(null)).allowed, true); // Fotos opcionais: contrato anterior preservado.
});
