const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../../app/services/checkoutVerification.js'), 'utf8');
const loadModule = () => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('pop-up usa retirada/entrega restauradas e não mistura compra e doação', async () => {
  const { checkoutMessage } = await loadModule();
  const base = { status: 'approved', title: 'Caneca', paymentId: '123' };
  assert.match(checkoutMessage({ ...base, type: 'store_purchase', deliveryType: 'ONG', deliveryInfo: 'ONG Centro' }).message, /Retirada em:\nONG Centro/);
  assert.match(checkoutMessage({ ...base, type: 'store_purchase', deliveryType: 'DELIVERY', deliveryInfo: 'Rua 10' }).message, /Entrega no endereço:\nRua 10/);
  assert.match(checkoutMessage({ ...base, type: 'donation' }).title, /apoio/);
  assert.match(checkoutMessage({ ...base, type: 'plan' }).title, /Plano/);
});

test('retorno + timer concorrentes geram apenas uma confirmação', async () => {
  const { createCheckoutVerifier } = await loadModule();
  let finish; let calls = 0; let alerts = 0; let saves = 0;
  const verifier = createCheckoutVerifier({
    load: () => { calls++; return new Promise(resolve => { finish = resolve; }); },
    acknowledge: async () => { saves++; }, notify: () => { alerts++; }
  });
  const first = verifier.check();
  await verifier.check();
  finish({ status: 'approved', type: 'donation', title: 'Apoio' });
  await first; await verifier.check();
  assert.deepEqual([calls, saves, alerts], [1, 1, 1]);
});

test('pendência e falha de rede mantêm acompanhamento até aprovação', async () => {
  const { createCheckoutVerifier } = await loadModule();
  let state = 'pending'; let alerts = 0;
  const verifier = createCheckoutVerifier({ load: async () => {
    if (state === 'error') throw new Error('offline');
    return { status: state, type: 'plan' };
  }, acknowledge: async () => {}, notify: () => { alerts++; } });
  await verifier.check(); assert.equal(alerts, 0);
  state = 'error'; await assert.rejects(verifier.check(), /offline/);
  state = 'approved'; await verifier.check(); assert.equal(alerts, 1);
});

test('logout durante consulta impede confirmação na próxima conta', async () => {
  const { createCheckoutVerifier } = await loadModule();
  let finish; let saves = 0; let alerts = 0;
  const verifier = createCheckoutVerifier({ load: () => new Promise(resolve => { finish = resolve; }),
    acknowledge: async () => { saves++; }, notify: () => { alerts++; } });
  const request = verifier.check(); verifier.dispose();
  finish({ status: 'approved' }); await request;
  assert.deepEqual([saves, alerts], [0, 0]);
});

test('persistência com erro pode ser repetida sem perder confirmação', async () => {
  const { createCheckoutVerifier } = await loadModule();
  let fail = true; let alerts = 0;
  const verifier = createCheckoutVerifier({ load: async () => ({ status: 'approved', type: 'donation' }),
    acknowledge: async () => { if (fail) throw new Error('disk'); }, notify: () => { alerts++; } });
  await assert.rejects(verifier.check(), /disk/); assert.equal(alerts, 0);
  fail = false; await verifier.check(); assert.equal(alerts, 1);
});

test('resposta enquanto navegador está aberto mantém acompanhamento para retorno', async () => {
  const { createCheckoutVerifier } = await loadModule();
  let foreground = false; let saves = 0; let alerts = 0;
  const verifier = createCheckoutVerifier({ load: async () => ({ status: 'approved', type: 'donation' }),
    canNotify: () => foreground, acknowledge: async () => { saves++; }, notify: () => { alerts++; } });
  await verifier.check(); assert.deepEqual([saves, alerts], [0, 0]);
  foreground = true; await verifier.check(); assert.deepEqual([saves, alerts], [1, 1]);
});
