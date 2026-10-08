const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../../app/services/photoSelection.js'), 'utf8');
const photoModule = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const asset = { uri: 'file:///animal.jpg', mimeType: 'image/jpeg', fileName: 'animal.jpg' };
const success = { canceled: false, assets: [asset] };
const launcherError = contract => new Error(
  'java.lang.IllegalStateException: Attempting to launch an unregistered ActivityResultLauncher ' +
  `with contract expo.modules.imagepicker.contracts.${contract}@abc and input options`
);
const enableClock = t => t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
const tick = async (t, ms) => { t.mock.timers.tick(ms); await Promise.resolve(); };

test('fotos: aguarda a atualização da UI mesmo quando o app está ativo', async t => {
  const { waitForPhotoPickerReady } = await photoModule;
  enableClock(t);
  let finished = false;
  const pending = waitForPhotoPickerReady({ currentState: 'active' }, () => true);
  pending.then(() => { finished = true; });
  await tick(t, 249);
  assert.equal(finished, false);
  await tick(t, 1);
  assert.equal(await pending, true);
});

test('fotos: aguarda voltar ao primeiro plano e verifica novamente antes de liberar', async t => {
  const { waitForPhotoPickerReady } = await photoModule;
  enableClock(t);
  const appState = { currentState: 'background' };
  let finished = false;
  const pending = waitForPhotoPickerReady(appState, () => true);
  pending.then(() => { finished = true; });
  await tick(t, 100);
  assert.equal(finished, false);
  appState.currentState = 'active';
  await tick(t, 100);
  appState.currentState = 'background';
  await tick(t, 250);
  assert.equal(finished, false);
  appState.currentState = 'active';
  await tick(t, 100);
  await tick(t, 250);
  assert.equal(await pending, true);
});

test('fotos: fechar o formulário cancela a espera sem abrir seletor atrasado', async t => {
  const { waitForPhotoPickerReady, selectAnimalPhoto } = await photoModule;
  enableClock(t);
  let current = true;
  let launches = 0;
  const isCurrent = () => current;
  const pending = selectAnimalPhoto({ launchImageLibraryAsync: async () => { launches++; return success; } }, 'gallery', {
    isCurrent,
    beforeLaunch: () => waitForPhotoPickerReady({ currentState: 'active' }, isCurrent),
  });
  current = false;
  await tick(t, 250);
  assert.equal(await pending, null);
  assert.equal(launches, 0);
});

test('fotos: espera em segundo plano tem limite e libera o fluxo com mensagem clara', async t => {
  const { waitForPhotoPickerReady } = await photoModule;
  enableClock(t);
  const rejected = assert.rejects(
    waitForPhotoPickerReady({ currentState: 'background' }, () => true), /Volte ao PetGo/
  );
  await tick(t, 4000);
  await rejected;
});

test('fotos: verifica a tela antes e depois da permissão da câmera', async () => {
  const { selectAnimalPhoto } = await photoModule;
  const calls = [];
  const picker = {
    requestCameraPermissionsAsync: async () => { calls.push('permission'); return { granted: true }; },
    launchCameraAsync: async () => { calls.push('camera'); return success; },
  };
  assert.equal(await selectAnimalPhoto(picker, 'camera', {
    beforeLaunch: async () => { calls.push('ready'); return true; },
  }), asset);
  assert.deepEqual(calls, ['ready', 'permission', 'ready', 'camera']);
});

test('fotos: cancelamento durante permissão não abre câmera nem gera erro de permissão', async () => {
  const { selectAnimalPhoto } = await photoModule;
  let current = true;
  let launches = 0;
  const result = await selectAnimalPhoto({
    requestCameraPermissionsAsync: async () => { current = false; return { granted: false }; },
    launchCameraAsync: async () => { launches++; return success; },
  }, 'camera', { isCurrent: () => current });
  assert.equal(result, null);
  assert.equal(launches, 0);
});

for (const [source, contract, method] of [
  ['camera', 'CameraContract', 'launchCameraAsync'],
  ['gallery', 'ImageLibraryContract', 'launchImageLibraryAsync'],
]) {
  test(`fotos ${source}: uma falha transitória no launcher Android permite uma nova tentativa`, async () => {
    const { selectAnimalPhoto } = await photoModule;
    let launches = 0;
    let permissions = 0;
    let preparations = 0;
    const optionsUsed = [];
    const picker = {
      requestCameraPermissionsAsync: async () => { permissions++; return { granted: true }; },
      [method]: async options => {
        optionsUsed.push(options);
        if (++launches === 1) throw launcherError(contract);
        return success;
      },
    };
    assert.equal(await selectAnimalPhoto(picker, source, {
      platform: 'android', beforeLaunch: async () => { preparations++; return true; },
    }), asset);
    assert.equal(launches, 2);
    assert.equal(permissions, source === 'camera' ? 1 : 0);
    assert.equal(preparations, source === 'camera' ? 3 : 2);
    assert.equal(optionsUsed[0], optionsUsed[1]);
    assert.deepEqual(optionsUsed[0], { mediaTypes: ['images'], allowsEditing: true, quality: 0.7 });
  });

  test(`fotos ${source}: falha persistente não cria loop e orienta reabrir sem stack Java`, async () => {
    const { selectAnimalPhoto } = await photoModule;
    let launches = 0;
    await assert.rejects(selectAnimalPhoto({
      requestCameraPermissionsAsync: async () => ({ granted: true }),
      [method]: async () => { launches++; throw launcherError(contract); },
    }, source, { platform: 'android', beforeLaunch: async () => true }), error => {
      assert.equal(error.code, 'PHOTO_PICKER_RESTART_REQUIRED');
      assert.match(error.message, /Feche completamente o PetGo/);
      assert.doesNotMatch(error.message, /java|ActivityResultLauncher/);
      return true;
    });
    assert.equal(launches, 2);
  });
}

test('fotos: nunca repete captura se o erro veio do recorte ou de outra causa', async () => {
  const { selectAnimalPhoto } = await photoModule;
  for (const failure of [launcherError('CropImageContract'), new Error('Sem espaço no aparelho')]) {
    let launches = 0;
    await assert.rejects(selectAnimalPhoto({
      requestCameraPermissionsAsync: async () => ({ granted: true }),
      launchCameraAsync: async () => { launches++; throw failure; },
    }, 'camera', { platform: 'android', beforeLaunch: async () => true }));
    assert.equal(launches, 1);
  }
});

test('fotos: cancelamento do usuário não reabre seletor; falhas no iOS não disparam retry Android', async () => {
  const { selectAnimalPhoto } = await photoModule;
  let launches = 0;
  const picker = { launchImageLibraryAsync: async () => { launches++; return { canceled: true, assets: null }; } };
  assert.equal(await selectAnimalPhoto(picker, 'gallery', {
    platform: 'android', beforeLaunch: async () => true,
  }), null);
  assert.equal(launches, 1);
  launches = 0;
  await assert.rejects(selectAnimalPhoto({ launchImageLibraryAsync: async () => {
    launches++; throw launcherError('ImageLibraryContract');
  } }, 'gallery', { platform: 'ios', beforeLaunch: async () => true }));
  assert.equal(launches, 1);
});

test('fotos: fechar formulário após falha impede nova tentativa Android', async () => {
  const { selectAnimalPhoto } = await photoModule;
  let current = true;
  let launches = 0;
  assert.equal(await selectAnimalPhoto({ launchImageLibraryAsync: async () => {
    launches++;
    current = false;
    throw launcherError('ImageLibraryContract');
  } }, 'gallery', {
    platform: 'android', beforeLaunch: async () => true, isCurrent: () => current,
  }), null);
  assert.equal(launches, 1);
});
