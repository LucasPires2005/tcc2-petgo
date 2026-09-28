const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = file => fs.readFileSync(path.resolve(__dirname, '../../app', file), 'utf8');
const api = 'https://tcc-2026-1-e-2-petgo.onrender.com';
const checkout = source('context/CheckoutContext.js');
const checkoutStorage = checkout.slice(checkout.indexOf('const keyFor ='), checkout.indexOf('export function CheckoutProvider'));
const activation = source('services/subscriptionApi.js').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const operations = source('services/subscriptionOperations.js').replace(/^export /gm, '');

// Reproduz a decodificação da URI feita por Uri.path no Android, sem dispositivo.
function androidDisk() {
  const files = new Map();
  const documentDirectory = 'file:///data/user/0/com.petgo/files/';
  const resolve = uri => {
    const decoded = decodeURIComponent(new URL(uri).pathname);
    assert.equal(path.posix.dirname(decoded), '/data/user/0/com.petgo/files', 'não deve criar subdiretórios pela URL da API');
    return decoded;
  };
  return {
    files, documentDirectory,
    async getInfoAsync(uri) { return { exists: files.has(resolve(uri)) }; },
    async readAsStringAsync(uri) { return files.get(resolve(uri)); },
    async writeAsStringAsync(uri, value) { files.set(resolve(uri), value); },
    async deleteAsync(uri) { files.delete(resolve(uri)); }
  };
}

function checkoutFixture(os, url = api, disk = androidDisk()) {
  return vm.runInNewContext(`${checkoutStorage}; ({ keyFor, readPending, writePending });`, {
    Platform: { OS: os }, API_BASE_URL: url, FileSystem: disk
  });
}

function activationKey(os, url, userId) {
  const start = activation.indexOf('function performActivation');
  return vm.runInNewContext(`${activation.slice(start)}; performActivation(userId, 'upgrade-pro');`, {
    Platform: { OS: os }, API_BASE_URL: url, userId,
    runner: key => key, captureSessionGuard: () => () => {}
  });
}

test('Android: checkout e ativação usam nomes seguros, separados por API e usuário', () => {
  for (const key of [
    (url, user) => checkoutFixture('android', url).keyFor(user),
    (url, user) => activationKey('android', url, user)
  ]) {
    const urls = [api, 'http://192.168.0.10:3000/api', `${api}/a`, `${api}_2Fa`, `${api}/ação?x=1`];
    const names = urls.flatMap(url => [10, 29].map(user => key(url, user)));
    assert.equal(new Set(names).size, names.length);
    for (const name of names) {
      assert.doesNotMatch(name, /[%/\\:]/);
      assert.equal(decodeURIComponent(name), name);
      assert.ok(name.endsWith('.json'));
    }
    assert.equal(key(api, 10), key(api, 10));
  }
});

test('iOS e web preservam exatamente as chaves de operações já existentes', () => {
  for (const os of ['ios', 'web']) {
    assert.equal(checkoutFixture(os).keyFor(10), `petgo-checkout-${encodeURIComponent(api)}-10.json`);
    assert.equal(activationKey(os, api, 10), `petgo-activation-${encodeURIComponent(api)}-10.json`);
  }
});

test('Android: checkout grava, restaura após reinício e remove o mesmo arquivo', async () => {
  const disk = androidDisk();
  const first = checkoutFixture('android', api, disk);
  const record = { id: 'preference-10', userId: 10, url: 'https://sandbox.example.test/pay' };
  await first.writePending(first.keyFor(10), record);
  const restarted = checkoutFixture('android', api, disk);
  assert.equal(JSON.stringify(await restarted.readPending(restarted.keyFor(10))), JSON.stringify(record));
  assert.equal(await restarted.readPending(restarted.keyFor(29)), null);
  await restarted.writePending(restarted.keyFor(10), null);
  assert.equal(disk.files.size, 0);
});

test('Android: PRO persiste antes de enviar e reutiliza operationId após falha e reinício', async () => {
  const disk = androidDisk();
  const ids = [];
  let offline = true;
  const load = () => vm.runInNewContext(`${operations}\n${activation}\nperformActivation;`, {
    Platform: { OS: 'android' }, API_BASE_URL: api, FileSystem: disk,
    captureSessionGuard: () => () => {},
    mobileFetch: async (url, options) => {
      assert.equal(url, `${api}/auth/upgrade-pro`);
      const { operationId } = JSON.parse(options.body);
      assert.equal(JSON.parse([...disk.files.values()][0]).operationId, operationId);
      ids.push(operationId);
      if (offline) throw new Error('offline');
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
  });
  await assert.rejects(load()(29, 'upgrade-pro'), /offline/);
  assert.equal(disk.files.size, 1);
  offline = false;
  await load()(29, 'upgrade-pro');
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
  assert.equal(disk.files.size, 0);
});

function profileFixture() {
  const screen = source('screens/AccountScreen.js');
  const start = screen.indexOf('export default function AccountScreen');
  const end = screen.indexOf('  return (', start);
  assert.ok(start >= 0 && end > start);
  const states = [];
  let cursor = 0;
  let profile = { id: 10, name: 'Lucas', email: 'lucas@example.test' };
  let saveSucceeds = true;
  const saved = [];
  const render = vm.runInNewContext(`${screen.slice(start, end).replace('export default ', '')}
    return { openEditProfile, newName, newEmail, setNewName, setNewEmail, editModal, setEditModal, handleUpdate };
  }; AccountScreen;`, {
    ONGS_LIST: ['ONG teste'], AuthContext: {},
    useCheckout: () => ({}),
    useContext: () => ({ user: profile, refreshUserData() {}, updateAccount: async (...draft) => { saved.push(draft); return saveSucceeds; } }),
    useBenefits: () => ({ plan: { active: false }, premium: { active: false } }),
    useCallback: fn => fn, useFocusEffect() {},
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = value; }];
    }
  });
  assert.equal((screen.match(/onPress=\{openEditProfile\}/g) || []).length, 2, 'avatar e menu abrem o mesmo rascunho');
  assert.match(screen, /value=\{newName\} onChangeText=\{setNewName\}/);
  assert.match(screen, /value=\{newEmail\} onChangeText=\{setNewEmail\}/);
  return {
    render() { cursor = 0; return render({ navigation: {} }); }, saved,
    refresh(next) { profile = next; }, failSave() { saveSucceeds = false; }
  };
}

test('perfil: digitação sobrevive a renderizações e atualização do contexto; salva só ao confirmar', async () => {
  const f = profileFixture();
  f.render().openEditProfile();
  let ui = f.render();
  assert.equal(ui.newName, 'Lucas');
  ui.setNewName('Lucass');
  ui.setNewEmail('lucass@example.test');
  f.refresh({ id: 10, name: 'Lucas', email: 'lucas@example.test', coins: 50 });
  for (let i = 0; i < 3; i++) {
    ui = f.render();
    assert.equal(ui.newName, 'Lucass');
    assert.equal(ui.newEmail, 'lucass@example.test');
  }
  assert.equal(f.saved.length, 0);
  await ui.handleUpdate();
  assert.deepEqual(f.saved, [['Lucass', 'lucass@example.test']]);
  assert.equal(f.render().editModal, false);
});

test('perfil: cancelar não salva; reabrir carrega perfil atual; erro ao salvar mantém rascunho', async () => {
  const f = profileFixture();
  f.render().openEditProfile();
  let ui = f.render();
  ui.setNewName('Descartar');
  ui.setEditModal(false);
  assert.equal(f.saved.length, 0);
  f.refresh({ id: 10, name: 'Nome atual', email: 'atual@example.test' });
  f.render().openEditProfile();
  ui = f.render();
  assert.equal(ui.newName, 'Nome atual');
  assert.equal(ui.newEmail, 'atual@example.test');
  ui.setNewName('Rascunho');
  f.failSave();
  await f.render().handleUpdate();
  assert.equal(f.render().editModal, true);
  assert.equal(f.render().newName, 'Rascunho');
});
