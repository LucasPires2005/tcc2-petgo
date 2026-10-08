const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Dá tempo para concluir a atualização do menu/teclado e o retorno de permissões.
// Isto não registra launchers nativos: um registro perdido de forma persistente
// ainda exige reiniciar o app ou corrigir o ciclo de vida no módulo Android.
export async function waitForPhotoPickerReady(appState, isCurrent) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    if (!isCurrent()) return false;
    const wasActive = appState.currentState === 'active';
    await wait(wasActive ? 250 : 100);
    if (!isCurrent()) return false;
    if (wasActive && appState.currentState === 'active') return true;
  }
  throw new Error('Volte ao PetGo e toque novamente para selecionar a foto.');
}

function isUnregisteredLauncher(error) {
  return /unregistered ActivityResultLauncher/i.test(error?.message || '');
}

function failedBeforeOpeningPicker(error, source) {
  const contract = source === 'camera' ? 'CameraContract' : 'ImageLibraryContract';
  return isUnregisteredLauncher(error) && new RegExp(
    `with contract\\s+expo\\.modules\\.imagepicker\\.contracts\\.${contract}@`
  ).test(error.message);
}

// Mantém as opções e o formato de asset já usados pelos uploads existentes.
export async function selectAnimalPhoto(picker, source, {
  platform,
  beforeLaunch,
  isCurrent = () => true,
} = {}) {
  if (source !== 'camera' && source !== 'gallery') throw new Error('Opção de foto inválida.');
  const prepare = async () => {
    if (!isCurrent()) return false;
    if (beforeLaunch && await beforeLaunch() === false) return false;
    return isCurrent();
  };
  if (source === 'camera') {
    if (!await prepare()) return null;
    const permission = await picker.requestCameraPermissionsAsync();
    if (!isCurrent()) return null;
    if (!permission.granted) {
      throw new Error(permission.canAskAgain === false
        ? 'Autorize a câmera nas configurações do aparelho ou escolha uma foto da galeria.'
        : 'Autorize o uso da câmera ou escolha uma foto da galeria.');
    }
  }
  // O seletor de fotos do sistema não exige acesso amplo à galeria.
  const options = { mediaTypes: ['images'], allowsEditing: true, quality: 0.7 };
  const launch = () => source === 'camera'
    ? picker.launchCameraAsync(options)
    : picker.launchImageLibraryAsync(options);
  if (!await prepare()) return null;
  let result;
  try {
    try {
      result = await launch();
    } catch (error) {
      // Uma tentativa extra só quando câmera/galeria nem chegaram a abrir.
      // Nunca repetir após erro no recorte: o usuário já pode ter tirado a foto.
      if (platform !== 'android' || !beforeLaunch || !failedBeforeOpeningPicker(error, source)) throw error;
      if (!await prepare()) return null;
      result = await launch();
    }
  } catch (error) {
    if (isUnregisteredLauncher(error)) {
      const unavailable = new Error('O Android não conseguiu iniciar o seletor de fotos. Feche completamente o PetGo e abra novamente. Os dados ainda não enviados deste formulário precisarão ser preenchidos novamente.');
      unavailable.code = 'PHOTO_PICKER_RESTART_REQUIRED';
      throw unavailable;
    }
    throw error;
  }
  if (!isCurrent()) return null;
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.uri) throw new Error('Não foi possível abrir a foto. Tente novamente.');
  return asset;
}
