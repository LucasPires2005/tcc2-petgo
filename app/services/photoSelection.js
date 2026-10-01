// Mantém as opções e o formato de asset já usados pelos uploads existentes.
export async function selectAnimalPhoto(picker, source) {
  if (source !== 'camera' && source !== 'gallery') throw new Error('Opção de foto inválida.');
  if (source === 'camera') {
    const permission = await picker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error(permission.canAskAgain === false
        ? 'Autorize a câmera nas configurações do aparelho ou escolha uma foto da galeria.'
        : 'Autorize o uso da câmera ou escolha uma foto da galeria.');
    }
  }
  // O seletor de fotos do sistema não exige acesso amplo à galeria.
  const options = { mediaTypes: ['images'], allowsEditing: true, quality: 0.7 };
  const result = source === 'camera'
    ? await picker.launchCameraAsync(options)
    : await picker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.uri) throw new Error('Não foi possível abrir a foto. Tente novamente.');
  return asset;
}
