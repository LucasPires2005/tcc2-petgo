const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Executa a função real do contexto, sem precisar de renderer React Native.
function fixture(response, error) {
  const source = fs.readFileSync(path.resolve(__dirname, '../../app/context/AuthContext.js'), 'utf8');
  const start = source.indexOf('  async function buyPremium()');
  const end = source.indexOf('  async function subscribeToPlan', start);
  assert.ok(start >= 0 && end > start);
  const alerts = [];
  const profiles = [];
  const run = vm.runInNewContext(`(async () => { ${source.slice(start, end)}; return buyPremium(); })`, {
    user: { id: 7, coins: 0 }, BASE_URL: 'https://api.example.test',
    mobileFetch: async () => { if (error) throw error; return { ok: response.ok, json: async () => response.body }; },
    setUser: profile => profiles.push(profile),
    Alert: { alert: (...args) => alerts.push(args) }
  });
  return { run, alerts, profiles };
}

test('upgrade sem saldo mostra mensagem do backend e não atualiza perfil', async () => {
  const f = fixture({ ok: false, body: { error: 'Saldo insuficiente ou conta já PRO.' } });
  assert.equal(await f.run(), false);
  assert.equal(f.alerts.length, 1);
  assert.match(f.alerts[0][1], /Saldo insuficiente/);
  assert.equal(f.profiles.length, 0);
});

test('upgrade aprovado mantém perfil e aviso de sucesso', async () => {
  const profile = { id: 7, coins: 0, is_premium: 1 };
  const f = fixture({ ok: true, body: { user: profile } });
  assert.equal(await f.run(), true);
  assert.equal(f.profiles[0], profile);
  assert.match(f.alerts[0][0], /Parabéns/);
});

test('upgrade apresenta fallback para falha do servidor e falha de rede', async () => {
  const f = fixture({ ok: false, body: {} });
  assert.equal(await f.run(), false);
  assert.match(f.alerts[0][1], /50 PetCoins/);
  const offline = fixture(null, new Error('offline'));
  assert.equal(await offline.run(), false);
  assert.match(offline.alerts[0][1], /conexão/);
  assert.equal(offline.profiles.length, 0);
});

test('upgrade não duplica aviso de sessão inválida ou banimento', async () => {
  for (const code of ['SESSION_INVALID', 'ACCOUNT_BANNED']) {
    const f = fixture({ ok: false, body: { code } });
    assert.equal(await f.run(), false);
    assert.equal(f.alerts.length, 0);
  }
});
