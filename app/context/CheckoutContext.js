import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { AuthContext } from './AuthContext';
import { API_BASE_URL, mobileFetch } from '../services/mobileApi';
import { createCheckoutVerifier } from '../services/checkoutVerification';

const CheckoutContext = createContext();
export const useCheckout = () => useContext(CheckoutContext);

// Salva apenas preferência/URL e identidade. Endereço fica no provedor, JWT nunca vai ao arquivo.
const keyFor = userId => `petgo-checkout-${encodeURIComponent(API_BASE_URL)}-${userId}.json`;
async function readPending(key) {
  if (Platform.OS === 'web') return JSON.parse(localStorage.getItem(key) || 'null');
  const path = `${FileSystem.documentDirectory}${key}`;
  if (!(await FileSystem.getInfoAsync(path)).exists) return null;
  return JSON.parse(await FileSystem.readAsStringAsync(path));
}
async function writePending(key, value) {
  if (Platform.OS === 'web') {
    if (value) localStorage.setItem(key, JSON.stringify(value)); else localStorage.removeItem(key);
    return;
  }
  const path = `${FileSystem.documentDirectory}${key}`;
  if (value) await FileSystem.writeAsStringAsync(path, JSON.stringify(value));
  else await FileSystem.deleteAsync(path, { idempotent: true });
}

export function CheckoutProvider({ children }) {
  const { user, refreshUserData } = useContext(AuthContext);
  const [pending, setPending] = useState(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Aguardando pagamento');
  const starting = useRef(false);
  const verifyRef = useRef(null);
  const userRef = useRef(user?.id);
  const refreshRef = useRef(refreshUserData);
  userRef.current = user?.id;
  refreshRef.current = refreshUserData;

  useEffect(() => {
    let active = true;
    setPending(null);
    setReady(false);
    if (!user?.id) return () => { active = false; };
    readPending(keyFor(user.id)).then(value => {
      if (active && value?.userId === user.id && typeof value.id === 'string'
        && typeof value.url === 'string' && value.url.startsWith('https://')) setPending(value);
    }).catch(() => {
      if (active) Alert.alert('Checkout', 'Não foi possível restaurar o acompanhamento local.');
    }).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!pending || pending.userId !== user?.id) return;
    let active = true;
    let attempts = 0;
    const verifier = createCheckoutVerifier({
      canNotify: () => AppState.currentState === 'active' && userRef.current === pending.userId,
      load: async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await mobileFetch(`${API_BASE_URL}/auth/checkout-status?preferenceId=${encodeURIComponent(pending.id)}`, { signal: controller.signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Falha ao consultar pagamento.');
          return data;
        } finally { clearTimeout(timer); }
      },
      acknowledge: () => writePending(keyFor(pending.userId), null),
      notify: (message, result) => {
        if (userRef.current !== pending.userId) return;
        setPending(null);
        Alert.alert(message.title, message.message);
        if (result.status === 'approved') refreshRef.current?.();
      }
    });
    const check = async () => {
      if (!active || AppState.currentState !== 'active' || userRef.current !== pending.userId) return;
      setStatus('Consultando pagamento…');
      try {
        const result = await verifier.check();
        if (active && result) setStatus(result.status === 'pending' ? 'Aguardando pagamento' : 'Aguardando confirmação');
      } catch {
        if (active) setStatus('Não foi possível consultar. Toque em Verificar.');
      }
    };
    verifyRef.current = check;
    check();
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active') { attempts = 0; check(); }
    });
    const link = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith('petgo://checkout/return')) { attempts = 0; check(); }
    });
    // Janela limitada de polling, apenas em primeiro plano. O botão continua disponível.
    const interval = setInterval(() => {
      if (AppState.currentState === 'active' && attempts++ < 8) check();
    }, 15000);
    return () => {
      active = false;
      verifier.dispose();
      verifyRef.current = null;
      clearInterval(interval);
      foreground.remove();
      link.remove();
    };
  }, [pending, user?.id]);

  async function startCheckout(body) {
    if (!ready || starting.current) throw new Error('Aguarde o checkout carregar.');
    if (pending) throw new Error('Já existe um pagamento em acompanhamento. Verifique ou dispense o aviso abaixo antes de iniciar outro.');
    const owner = userRef.current;
    if (!owner) throw new Error('Entre novamente para continuar.');
    starting.current = true;
    try {
      const response = await mobileFetch(`${API_BASE_URL}/auth/create-preference`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível iniciar o pagamento.');
      const url = data.sandbox_init_point || data.init_point;
      if (!data.id || typeof url !== 'string' || !url.startsWith('https://')) throw new Error('Resposta de checkout inválida.');
      if (userRef.current !== owner) return;
      const record = { id: String(data.id), url, userId: owner };
      await writePending(keyFor(owner), record);
      if (userRef.current !== owner) return;
      setPending(record);
      await Linking.openURL(url);
    } finally { starting.current = false; }
  }

  function dismiss() {
    Alert.alert('Dispensar acompanhamento?', 'Isso remove apenas este aviso. Não cancela nem estorna pagamentos no Mercado Pago.', [
      { text: 'Manter', style: 'cancel' },
      { text: 'Dispensar', onPress: async () => {
        try {
          await writePending(keyFor(pending.userId), null);
          if (userRef.current === pending.userId) setPending(null);
        } catch { Alert.alert('Checkout', 'Não foi possível remover o aviso. Tente novamente.'); }
      } }
    ]);
  }

  return <CheckoutContext.Provider value={{ startCheckout }}>
    <View style={{ flex: 1 }}>{children}</View>
    {pending && pending.userId === user?.id && <SafeAreaView edges={['bottom']} style={{ padding: 12, backgroundColor: '#EAF7EF' }}>
      <Text accessibilityLiveRegion="polite">{status}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <TouchableOpacity accessibilityRole="button" onPress={() => verifyRef.current?.()} style={{ padding: 8 }}><Text>Verificar</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={() => Linking.openURL(pending.url).catch(() => Alert.alert('Checkout', 'Não foi possível abrir o navegador.'))} style={{ padding: 8 }}><Text>Abrir pagamento</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={dismiss} style={{ padding: 8 }}><Text>Dispensar</Text></TouchableOpacity>
      </View>
    </SafeAreaView>}
  </CheckoutContext.Provider>;
}
