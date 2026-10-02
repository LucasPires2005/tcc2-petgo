const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.resolve(__dirname, '../../app', file), 'utf8');
const api = 'https://api.example.test';
const cpf = '529.982.247-25';
const clean = value => JSON.parse(JSON.stringify(value));
function apiFixture(fetcher, timers = {}) {
  let token = 'session-1';
  const service = vm.runInNewContext(`${read('services/eligibilityApi.js').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '')}
    ; ({ formatCpf, formatBirthDate, birthDateToIso, declarationError, getEligibility, declareEligibility });`, {
    API_BASE_URL: api, mobileFetch: fetcher,
    AbortController, setTimeout, clearTimeout, ...timers,
    captureSessionGuard: () => { const expected = token; return () => { if (!expected || token !== expected) throw new Error('Sessão mudou'); }; }
  });
  return { ...service, logout() { token = null; } };
}
const helpers = apiFixture(() => {});
const reply = (eligibility, ok = true, code) => ({ ok, json: async () => ok ? { eligibility } : { code, error: 'Erro amigável' } });

test('mobile: máscara de CPF preserva zeros e nascimento converte sem rollover de calendário', () => {
  assert.equal(helpers.formatCpf('01234567890'), '012.345.678-90');
  assert.equal(helpers.formatCpf('529982247251234'), cpf);
  assert.equal(helpers.formatBirthDate('02101990'), '02/10/1990');
  assert.equal(helpers.birthDateToIso('02/10/1990'), '1990-10-02');
  assert.equal(helpers.birthDateToIso('29/02/2000'), '2000-02-29');
  for (const value of ['31/04/1990', '29/02/1900', '02/13/1990', '2026-10-02', '1/1/1990', '01/01/0000']) {
    assert.equal(helpers.birthDateToIso(value), null);
  }
  assert.match(helpers.declarationError('', '02/10/1990', true), /CPF/);
  assert.match(helpers.declarationError(cpf, '31/04/1990', true), /nascimento/);
  assert.match(helpers.declarationError(cpf, '02/10/1990', false), /Confirme/);
  assert.equal(helpers.declarationError(cpf, '02/10/1990', true), null);
});

test('mobile: endpoints privados enviam contrato mínimo e não propagam documentos/HMAC na resposta', async () => {
  const calls = [];
  const service = apiFixture(async (url, options) => {
    calls.push({ url, options });
    return reply({ status: 'DECLARED_ADULT', declaredAdult: true, identityVerified: true, cpfHmac: 'não público', cpf });
  });
  assert.deepEqual(clean(await service.getEligibility()), { status: 'DECLARED_ADULT', declaredAdult: true, identityVerified: false });
  await service.declareEligibility(cpf, '1990-10-02', true);
  assert.equal(calls[0].url, `${api}/auth/eligibility`);
  assert.equal(calls[1].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].options.body), { cpf, birthDate: '1990-10-02', acceptedDeclaration: true });
});

test('mobile: declaração falha fechada em erro, resposta incoerente e troca de sessão durante JSON', async () => {
  const denied = apiFixture(async () => reply(null, false, 'UNDERAGE'));
  await assert.rejects(denied.declareEligibility(cpf, '2015-10-02', true), error => error.code === 'UNDERAGE');
  for (const result of [{}, { status: 'PENDING', declaredAdult: true }, { status: 'OTHER', declaredAdult: false }]) {
    await assert.rejects(apiFixture(async () => reply(result)).getEligibility(), /servidor não confirmou/);
  }
  let resume;
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  const changing = apiFixture(async () => ({ ok: true, json: () => new Promise(resolve => { resume = resolve; markStarted(); }) }));
  const pending = changing.getEligibility();
  await started; changing.logout();
  resume({ eligibility: { status: 'DECLARED_ADULT', declaredAdult: true } });
  await assert.rejects(pending, /Sessão mudou/);
});

test('mobile: timeout da elegibilidade cancela rede e retorna erro amigável sem esperar indefinidamente', async () => {
  let abort, cleared = false;
  const service = apiFixture((url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }), {
    setTimeout(callback, milliseconds) { assert.equal(milliseconds, 15000); abort = callback; return 17; },
    clearTimeout(id) { assert.equal(id, 17); cleared = true; }
  });
  const pending = service.getEligibility(); abort();
  await assert.rejects(pending, error => error.code === 'ELIGIBILITY_TIMEOUT' && /conexão/.test(error.message));
  assert.equal(cleared, true);
});

function hookFixture(createController, context) {
  const states = [], refs = [], effects = [];
  const defaultProps = { navigation: {} };
  let stateCursor = 0, refCursor = 0, effectCursor = 0, queue = [];
  const controller = createController({
    ...context,
    useState(initial) {
      const index = stateCursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(initial) { const index = refCursor++; return refs[index] || (refs[index] = { current: initial }); },
    useEffect(callback, deps) {
      const index = effectCursor++, previous = effects[index];
      if (!previous || deps.some((value, at) => value !== previous.deps[at])) queue.push(() => {
        previous?.cleanup?.(); effects[index] = { deps, cleanup: callback() };
      });
    }
  });
  return {
    render(props = defaultProps) {
      stateCursor = refCursor = effectCursor = 0; queue = [];
      const ui = controller(props); queue.forEach(run => run()); return ui;
    },
    unmount() { effects.forEach(effect => effect.cleanup?.()); }
  };
}

function mapFixture(options = {}) {
  const source = read('screens/MapScreen.js');
  const prefix = source.slice(source.indexOf('export default function MapScreen'), source.indexOf('  const filteredAnimals =')).replace('export default ', '');
  let user = { id: 7, name: 'Pessoa de Teste', email: 'teste@example.test' }, token = 'session-1';
  const calls = [], alerts = [], timers = [];
  const listeners = {};
  const navigation = { addListener(event, listener) { listeners[event] = listener; return () => { delete listeners[event]; }; } };
  const f = hookFixture(context => vm.runInNewContext(`${prefix}
    return { requestRescue, closeAnimalDetails, closeRescueForm, completeEligibility, handleRescue,
      setSelectedAnimal, setRescuerName, setRescuerContact, setRescuerEmail, setRescuerCpf, setAcceptedResponsibility, setRescueImage,
      eligibilityNeeded, rescueModalVisible, rescuerName, rescuerEmail, rescuerCpf, acceptedResponsibility, rescueImage, isUploadingRescue };
    }; MapScreen;`, context), {
    AuthContext: {}, useContext: () => ({ user, animals: [], fetchAnimals() {}, refreshUserData: async () => {} }),
    useCheckout: () => ({}), useSafeAreaInsets: () => ({ bottom: 0 }), API_BASE_URL: api,
    Location: { requestForegroundPermissionsAsync: async () => ({ status: 'denied' }) },
    getEligibility: options.getEligibility || (async () => ({ declaredAdult: true })), formatCpf: helpers.formatCpf,
    captureSessionGuard: () => { const expected = token; return () => { if (!expected || token !== expected) throw new Error('Sessão mudou'); }; },
    setTimeout: callback => timers.push(callback), Alert: { alert: (...args) => alerts.push(args) },
    FormData: class { constructor() { this.fields = {}; } append(key, value) { this.fields[key] = value; } },
    fetch: options.fetch || (async () => ({ blob: async () => ({ type: 'image/jpeg' }) })),
    mobileFetch: async (url, request) => {
      calls.push({ url, fields: request.body.fields });
      return options.response ? options.response() : { ok: true, json: async () => ({ earnedCoins: 50 }) };
    }
  });
  const render = () => f.render({ navigation });
  return {
    render, calls, alerts, unmount: f.unmount,
    blur() { listeners.blur?.(); },
    flushTimers() { while (timers.length) timers.shift()(); },
    logout() { token = null; user = null; render(); },
    async open() {
      render(); render().setSelectedAnimal({ id: 42 });
      await render().requestRescue(); this.flushTimers(); return render();
    },
    fill() {
      const ui = render(); ui.setRescuerContact('(11) 91234-5678'); ui.setRescuerCpf(cpf);
      ui.setAcceptedResponsibility(true); ui.setRescueImage({ uri: 'file:///proof.jpg', fileName: 'proof.jpg' }); return render();
    }
  };
}

test('mobile: complementação impede duplo envio, exige aceite e ignora retorno após sair do formulário', async () => {
  const source = read('components/EligibilityForm.js');
  const prefix = source.slice(source.indexOf('export default function EligibilityForm'), source.indexOf('  return <>')).replace('export default ', '');
  let resolve, calls = 0;
  const completed = [];
  const f = hookFixture(context => vm.runInNewContext(`${prefix}
    return { confirm, setCpf, setBirthDate, setAccepted, busy, error };
    }; () => EligibilityForm({ onCompleted: value => completed.push(value) });`, context), {
    completed, birthDateToIso: helpers.birthDateToIso, declarationError: helpers.declarationError,
    declareEligibility: () => { calls++; return new Promise(done => { resolve = done; }); }
  });
  let ui = f.render(); ui.setCpf(cpf); ui.setBirthDate('02/10/1990');
  await f.render().confirm(); assert.equal(calls, 0); assert.match(f.render().error, /Confirme/);
  f.render().setAccepted(true); ui = f.render();
  const pending = ui.confirm(); await ui.confirm(); assert.equal(calls, 1);
  f.unmount(); resolve({ declaredAdult: true }); await pending;
  assert.equal(completed.length, 0);
});

test('mobile: conta antiga abre complementação apenas no resgate; declaração libera formulário sem CPF no contexto', async () => {
  const f = mapFixture({ getEligibility: async () => ({ declaredAdult: false }) });
  let ui = await f.open();
  assert.equal(ui.rescueModalVisible, true); assert.equal(ui.eligibilityNeeded, true);
  await ui.handleRescue(); assert.equal(f.calls.length, 0);
  ui.completeEligibility(cpf); ui = f.render();
  assert.equal(ui.eligibilityNeeded, false); assert.equal(ui.rescuerCpf, cpf);
  assert.equal(ui.rescuerName, 'Pessoa de Teste'); assert.equal(ui.rescuerEmail, 'teste@example.test');
  ui.closeRescueForm(); ui = f.render();
  assert.equal(ui.rescueModalVisible, false); assert.equal(ui.rescuerCpf, ''); assert.equal(ui.rescuerEmail, '');
});

test('mobile: fechar detalhe ou mudar sessão impede abertura tardia do resgate', async () => {
  let resolve;
  const f = mapFixture({ getEligibility: () => new Promise(done => { resolve = done; }) });
  f.render(); f.render().setSelectedAnimal({ id: 42 });
  const pending = f.render().requestRescue(); f.render().closeAnimalDetails();
  resolve({ declaredAdult: true }); await pending; f.flushTimers();
  assert.equal(f.render().rescueModalVisible, false);
  const loggedOut = mapFixture(); await loggedOut.open(); loggedOut.fill(); loggedOut.logout();
  assert.equal(loggedOut.render().rescueModalVisible, false); assert.equal(loggedOut.render().rescuerCpf, '');
});

test('mobile: sair da aba Mapa limpa documento, foto e aceite sem restringir navegação', async () => {
  const f = mapFixture(); await f.open(); f.fill(); f.blur();
  const ui = f.render();
  assert.equal(ui.rescueModalVisible, false); assert.equal(ui.rescuerCpf, '');
  assert.equal(ui.rescueImage, null); assert.equal(ui.acceptedResponsibility, false);
});

test('mobile: resgate envia os quatro dados, foto e aceite, impede duplo clique e limpa documento ao concluir', async () => {
  const f = mapFixture(); await f.open(); const ui = f.fill();
  await Promise.all([ui.handleRescue(), ui.handleRescue()]);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, `${api}/animals/42/rescue`);
  assert.deepEqual(clean(f.calls[0].fields), {
    rescuer_name: 'Pessoa de Teste', rescuer_contact: '(11) 91234-5678', rescuer_email: 'teste@example.test',
    rescuer_cpf: cpf, acceptedResponsibility: 'true', userId: '7', rescue_image: { type: 'image/jpeg' }
  });
  assert.equal(f.render().rescuerCpf, ''); assert.equal(f.render().rescueImage, null);
  assert.equal(f.render().rescueModalVisible, false);
});

test('mobile: aceite é obrigatório; elegibilidade ausente retorna à complementação; CPF divergente pode ser corrigido', async () => {
  const noConsent = mapFixture(); await noConsent.open(); noConsent.fill().setAcceptedResponsibility(false);
  await noConsent.render().handleRescue(); assert.equal(noConsent.calls.length, 0);
  for (const code of ['ELIGIBILITY_REQUIRED', 'CPF_DECLARATION_MISMATCH']) {
    const f = mapFixture({ response: () => ({ ok: false, status: code === 'ELIGIBILITY_REQUIRED' ? 403 : 400,
      json: async () => ({ code, error: 'Confira sua declaração' }) }) });
    await f.open(); await f.fill().handleRescue();
    const ui = f.render(); assert.equal(ui.rescuerCpf, ''); assert.equal(ui.isUploadingRescue, false);
    assert.equal(ui.eligibilityNeeded, code === 'ELIGIBILITY_REQUIRED');
    assert.equal(ui.rescueModalVisible, true);
  }
});

test('mobile: mudança de sessão durante processamento da foto não envia resgate em outra conta', async () => {
  let complete;
  const f = mapFixture({ fetch: () => new Promise(resolve => { complete = resolve; }) });
  await f.open(); const pending = f.fill().handleRescue(); f.logout();
  complete({ blob: async () => ({ type: 'image/jpeg' }) }); await pending;
  assert.equal(f.calls.length, 0); assert.equal(f.render().rescuerCpf, '');
});

test('mobile: cadastro envia declaração sem guardar documento no AuthContext; formulários têm ajuda e teclado multiplataforma', async () => {
  const auth = read('context/AuthContext.js');
  const start = auth.indexOf('  async function register('), end = auth.indexOf('  async function resendConfirmationEmail', start);
  const calls = [];
  const register = vm.runInNewContext(`${auth.slice(start, end)}; register;`, {
    BASE_URL: api, Alert: { alert() {} }, fetch: async (url, options) => {
      calls.push({ url, payload: JSON.parse(options.body) }); return { ok: true, json: async () => ({}) };
    }
  });
  assert.equal(await register('Teste', 'TESTE@example.test', 'senha123', { cpf, birthDate: '1990-10-02', acceptedDeclaration: true }), true);
  assert.deepEqual(calls[0].payload, { name: 'Teste', email: 'teste@example.test', password: 'senha123', cpf, birthDate: '1990-10-02', acceptedDeclaration: true });
  assert.doesNotMatch(auth.slice(start, end), /setUser|setMobileSession|AsyncStorage|FileSystem|console\./);
  const registerScreen = read('screens/RegisterScreen.js');
  assert.match(registerScreen, /<EligibilityFields/); assert.match(registerScreen, /birthDate: birthDateToIso\(birthDate\)/);
  assert.match(registerScreen, /addListener\('blur'/);
  for (const source of [registerScreen, read('screens/MapScreen.js')]) {
    assert.match(source, /behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/);
    assert.match(source, /keyboardShouldPersistTaps="handled"/);
  }
  const fields = read('components/EligibilityFields.js');
  assert.match(fields, /Demonstração acadêmica/); assert.match(fields, /não comprova identidade/);
  assert.match(fields, /accessibilityRole="checkbox"/);
  const privateSources = [read('services/eligibilityApi.js'), fields, read('components/EligibilityForm.js')].join('\n');
  assert.doesNotMatch(privateSources, /AsyncStorage|FileSystem|localStorage|console\./);
});
