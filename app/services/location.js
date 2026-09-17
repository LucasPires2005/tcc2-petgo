import * as Location from 'expo-location';

const LOCATION_TIMEOUT_MS = 15000;

export async function getBestAvailableLocation() {
  const lastKnownLocation = await Location.getLastKnownPositionAsync();

  if (lastKnownLocation) {
    return lastKnownLocation;
  }

  let timeoutId;

  try {
    return await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Tempo limite para obter a localização excedido.'));
        }, LOCATION_TIMEOUT_MS);
      })
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}
