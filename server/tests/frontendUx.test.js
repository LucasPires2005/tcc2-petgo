const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.resolve(__dirname, '../../', file), 'utf8');
const photoModule = import(`data:text/javascript;base64,${Buffer.from(read('app/services/photoSelection.js')).toString('base64')}`);

test('admin: status zero e um recebem rótulos; ausência não se confunde com zero', async () => {
  const { animalStatusLabel } = await import('../../admin/src/lib/animalStatus.mjs');
  for (const status of [0, '0']) assert.equal(animalStatusLabel(status), 'Aguardando resgate');
  for (const status of [1, '1']) assert.equal(animalStatusLabel(status), 'Resgatado');
  for (const status of [undefined, null, '']) assert.equal(animalStatusLabel(status), 'Não informado');
  for (const status of [2, false, {}, 'outro']) assert.equal(animalStatusLabel(status), 'Status desconhecido');
  assert.match(read('admin/src/pages/AnimalsPage.jsx'), /animalStatusLabel\(animal.status\)/);
});

test('fotos: câmera e galeria preservam asset, qualidade e recorte existentes', async () => {
  const { selectAnimalPhoto } = await photoModule;
  for (const source of ['camera', 'gallery']) {
    const calls = [];
    const asset = { uri: 'file:///animal.jpg', mimeType: 'image/jpeg', fileName: 'animal.jpg' };
    const picker = {
      async requestCameraPermissionsAsync() { calls.push('permission'); return { granted: true }; },
      async launchCameraAsync(options) { calls.push('camera'); assert.equal(options.quality, 0.7); assert.equal(options.allowsEditing, true); assert.deepEqual(options.mediaTypes, ['images']); return { canceled: false, assets: [asset] }; },
      async launchImageLibraryAsync(options) { calls.push('gallery'); assert.equal(options.quality, 0.7); assert.equal(options.allowsEditing, true); assert.deepEqual(options.mediaTypes, ['images']); return { canceled: false, assets: [asset] }; }
    };
    assert.equal(await selectAnimalPhoto(picker, source), asset);
    assert.deepEqual(calls, source === 'camera' ? ['permission', 'camera'] : ['gallery']);
  }
});

test('fotos: cancelamento, permissão negada, resultado inválido e erro nativo', async () => {
  const { selectAnimalPhoto } = await photoModule;
  for (const source of ['camera', 'gallery']) {
    const picker = { requestCameraPermissionsAsync: async () => ({ granted: true }),
      launchCameraAsync: async () => ({ canceled: true, assets: null }),
      launchImageLibraryAsync: async () => ({ canceled: true, assets: null }) };
    assert.equal(await selectAnimalPhoto(picker, source), null);
  }
  await assert.rejects(selectAnimalPhoto({ requestCameraPermissionsAsync: async () => ({ granted: false, canAskAgain: false }) }, 'camera'), /configurações/);
  await assert.rejects(selectAnimalPhoto({ launchImageLibraryAsync: async () => ({ canceled: false, assets: [] }) }, 'gallery'), /abrir a foto/);
  await assert.rejects(selectAnimalPhoto({ launchImageLibraryAsync: async () => { throw new Error('indisponível'); } }, 'gallery'), /indisponível/);
});

function mapFixture(selectPhoto, uploading = false) {
  const source = read('app/screens/MapScreen.js');
  const start = source.indexOf('  function closeAnimalForm()');
  const end = source.indexOf('  async function getLocation()', start);
  assert.ok(start > 0 && end > start);
  const state = { location: { latitude: 1 }, modal: true, rescueModal: true, image: 'original', rescueImage: 'resgate', menu: null, alerts: [] };
  const controller = vm.runInNewContext(`${source.slice(start, end)}; ({ closeAnimalForm, closeRescueForm, choosePhoto, openPhotoOptions });`, {
    isUploadingAnimal: uploading, isUploadingRescue: uploading,
    photoRequest: { current: 0 }, photoBusy: { current: false }, ImagePicker: {}, selectAnimalPhoto: selectPhoto,
    setPhotoSourceTarget: value => { state.menu = value; },
    setModalVisible: value => { state.modal = value; }, setSelectedLocation: value => { state.location = value; },
    setRescueModalVisible: value => { state.rescueModal = value; },
    setImage: value => { state.image = value; }, setRescueImage: value => { state.rescueImage = value; },
    Keyboard: { dismiss() {} }, Alert: { alert: (...args) => state.alerts.push(args) }
  });
  return { state, ...controller };
}

test('mapa: desistir limpa pin e modal; envio em andamento impede fechamento', () => {
  const f = mapFixture();
  f.closeAnimalForm();
  assert.equal(f.state.location, null);
  assert.equal(f.state.modal, false);
  const busy = mapFixture(null, true);
  busy.closeAnimalForm();
  busy.closeRescueForm();
  assert.equal(busy.state.modal, true);
  assert.equal(busy.state.rescueModal, true);
  assert.ok(busy.state.location);
  assert.match(read('app/screens/MapScreen.js'), /onRequestClose=\{closeAnimalForm\}/);
});

test('mapa: fotos são independentes; cancelar mantém foto e ponto anteriores', async () => {
  for (const target of ['animal', 'rescue']) {
    const f = mapFixture(async () => ({ uri: 'nova' }));
    await f.choosePhoto('gallery', target);
    assert.equal(target === 'animal' ? f.state.image.uri : f.state.rescueImage.uri, 'nova');
    assert.equal(target === 'animal' ? f.state.rescueImage : f.state.image, target === 'animal' ? 'resgate' : 'original');
    assert.ok(f.state.location);
    const cancelled = mapFixture(async () => null);
    await cancelled.choosePhoto('camera', target);
    assert.equal(cancelled.state.image, 'original');
    assert.equal(cancelled.state.rescueImage, 'resgate');
    assert.ok(cancelled.state.location);
  }
});

test('mapa: bloqueia seletor duplicado e ignora foto recebida após fechar formulário', async () => {
  let resolve;
  let calls = 0;
  const f = mapFixture(() => { calls++; return new Promise(done => { resolve = done; }); });
  const pending = f.choosePhoto('camera', 'animal');
  await f.choosePhoto('gallery', 'rescue');
  assert.equal(calls, 1);
  f.closeAnimalForm();
  resolve({ uri: 'tardia' });
  await pending;
  assert.equal(f.state.image, 'original');
  const failed = mapFixture(async () => { throw new Error('Sem permissão'); });
  await failed.choosePhoto('camera', 'rescue');
  assert.equal(failed.state.alerts.length, 1);
  assert.equal(failed.state.rescueImage, 'resgate');
});

test('senhas: oito campos usam controle independente sem alterar callbacks', () => {
  for (const [file, count] of [['LoginScreen', 1], ['RegisterScreen', 2], ['ResetPasswordScreen', 2], ['AccountScreen', 3]]) {
    const source = read(`app/screens/${file}.js`);
    assert.equal((source.match(/<PasswordInput\b/g) || []).length, count);
    assert.doesNotMatch(source, /secureTextEntry/);
  }
  const source = read('app/components/PasswordInput.js');
  const start = source.indexOf('export default function');
  const end = source.indexOf('  return <View', start);
  const toggle = source.match(/onPress=\{(\(\) => setVisible\(value => !value\))\}/)[1];
  function instance() {
    let state = false;
    let previous = Symbol();
    const render = vm.runInNewContext(`${source.slice(start, end).replace('export default ', '')}
      return { visible, toggle: ${toggle}, value: props.value, onChangeText: props.onChangeText }; }; PasswordInput;`, {
      useState: () => [state, value => { state = typeof value === 'function' ? value(state) : value; }],
      useEffect: (fn, [key]) => { if (key !== previous) { previous = key; fn(); } },
      StyleSheet: { flatten: value => value }
    });
    return render;
  }
  const first = instance(), second = instance();
  const props = { value: 'senha-original', onChangeText() {}, resetKey: true };
  first(props).toggle();
  assert.equal(first(props).visible, true);
  assert.equal(second(props).visible, false);
  assert.equal(first(props).value, props.value);
  assert.equal(first(props).onChangeText, props.onChangeText);
  first({ ...props, resetKey: false });
  assert.equal(first({ ...props, resetKey: false }).visible, false);
  assert.match(source, /secureTextEntry=\{!visible\}/);
});

test('resgate: contraste explícito nos dois inputs e rolagem limitada à altura da modal', async () => {
  const { colors } = await import(`data:text/javascript;base64,${Buffer.from(read('app/theme/colors.js')).toString('base64')}`);
  const source = read('app/screens/MapScreen.js');
  for (const label of ['Seu Nome', 'WhatsApp']) {
    const input = source.split('\n').find(line => line.includes(`placeholder="${label}"`));
    assert.match(input, /placeholderTextColor="#52606D"/);
    assert.match(input, /styles.rescueInput/);
    assert.match(input, /underlineColorAndroid="transparent"/);
  }
  const styles = vm.runInNewContext(`${source.slice(source.indexOf('const styles = StyleSheet.create'))}; styles;`, { colors, StyleSheet: { create: value => value } });
  assert.equal(styles.rescueInput.color, '#1F2937');
  assert.equal(styles.rescueInput.backgroundColor, '#F8FAFC');
  assert.equal(styles.rescueInput.opacity, 1);
  assert.equal(styles.rescueModal.maxHeight, '95%');
});
