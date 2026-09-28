import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { mobileFetch, API_BASE_URL, captureSessionGuard } from './mobileApi';
import { createOperationRunner } from './subscriptionOperations';

const runner = createOperationRunner({
  async read(key) {
    if (Platform.OS === 'web') return JSON.parse(localStorage.getItem(key) || 'null');
    const path = `${FileSystem.documentDirectory}${key}`;
    if (!(await FileSystem.getInfoAsync(path)).exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(path));
  },
  async write(key, value) {
    if (Platform.OS === 'web') {
      if (value) localStorage.setItem(key, JSON.stringify(value)); else localStorage.removeItem(key);
      return;
    }
    const path = `${FileSystem.documentDirectory}${key}`;
    if (value) await FileSystem.writeAsStringAsync(path, JSON.stringify(value));
    else await FileSystem.deleteAsync(path, { idempotent: true });
  },
  send(action, payload) {
    return mobileFetch(`${API_BASE_URL}/auth/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
  }
});
export function performActivation(userId, action, payload = {}) {
  const encodedApi = encodeURIComponent(API_BASE_URL);
  // Mesmo escape do checkout: sem sequências percentuais na URI do Android.
  // iOS/web mantêm as chaves e os operationIds já persistidos.
  const fileApi = Platform.OS === 'android' ? encodedApi.replace(/_/g, '__').replace(/%/g, '_') : encodedApi;
  const key = `petgo-activation-${fileApi}-${userId}.json`;
  return runner(key, action, payload, captureSessionGuard());
}
