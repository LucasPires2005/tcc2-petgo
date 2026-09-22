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
  const key = `petgo-activation-${encodeURIComponent(API_BASE_URL)}-${userId}.json`;
  return runner(key, action, payload, captureSessionGuard());
}
