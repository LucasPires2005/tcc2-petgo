import React, { useContext, useEffect, useState } from 'react';
import { Alert, AppState, Text, TouchableOpacity, View } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { benefit } from '../services/subscriptionDisplay';

export function useBenefits(user) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 1000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') update(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, []);
  return { plan: benefit(user, 'plan', now), premium: benefit(user, 'premium', now) };
}

export default function SubscriptionBenefits({ user }) {
  const { cancelSubscription } = useContext(AuthContext);
  const benefits = useBenefits(user);
  const [busy, setBusy] = useState(false);
  const cancel = (kind, label) => Alert.alert(`Cancelar ${label}?`,
    'Você manterá os benefícios até o vencimento. Este cancelamento não gera estorno. O PetGo usa compras avulsas de teste, sem cobrança automática.', [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Confirmar cancelamento', style: 'destructive', onPress: async () => {
        setBusy(true);
        try { await cancelSubscription(kind); } finally { setBusy(false); }
      } }
    ]);
  return <View style={{ padding: 16, backgroundColor: '#FFF', borderRadius: 12, marginVertical: 12 }}>
    {['plan', 'premium'].map(kind => {
      const label = kind === 'plan' ? 'Plano' : 'PRO';
      const item = benefits[kind];
      return <View key={kind} style={{ marginVertical: 8 }}>
        <Text style={{ fontWeight: 'bold', color: '#333' }}>{label}</Text>
        <Text style={{ color: item.status === 'EXPIRED' ? '#B03A2E' : '#555', marginTop: 4 }}>{item.text}</Text>
        {item.canCancel && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Cancelar assinatura ${label}`}
          disabled={busy} onPress={() => cancel(kind, label)} style={{ paddingVertical: 12 }}>
          <Text style={{ color: '#B03A2E' }}>{busy ? 'Aguarde…' : `Cancelar Assinatura (${label})`}</Text>
        </TouchableOpacity>}
      </View>;
    })}
  </View>;
}
