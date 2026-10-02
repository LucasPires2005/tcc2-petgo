import React, { useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { FormNotice } from '../components/FormField';
import EligibilityFields from '../components/EligibilityFields';
import { birthDateToIso, declarationError } from '../services/eligibilityApi';
import { colors } from '../theme/colors';

export default function SocialOnboardingScreen({ navigation }) {
  const { completeGoogleRegistration, cancelSocialLogin, hasPendingSocialRegistration } = useContext(AuthContext);
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    if (!hasPendingSocialRegistration()) {
      setError('Seu acesso com Google expirou. Volte ao login e entre com Google novamente.');
    }
    const unsubscribe = navigation.addListener('beforeRemove', () => cancelSocialLogin());
    return () => { active.current = false; cancelSocialLogin(); unsubscribe(); };
  }, [navigation, cancelSocialLogin, hasPendingSocialRegistration]);

  function cancel() {
    cancelSocialLogin();
    navigation.navigate('Login');
  }

  async function confirm() {
    if (lock.current) return;
    const validation = declarationError(cpf, birthDate, accepted);
    if (validation) { setError(validation); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      await completeGoogleRegistration({ cpf, birthDate: birthDateToIso(birthDate), acceptedDeclaration: accepted });
    } catch (err) {
      if (active.current && err.code !== 'SOCIAL_CANCELLED') setError(err.message || 'Não foi possível concluir. Tente novamente.');
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }

  return <SafeAreaView style={styles.container}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
        <Text accessibilityRole="header" style={styles.title}>Complete seu cadastro</Text>
        <Text style={styles.description}>Seu acesso com Google foi confirmado. Para criar sua conta PetGo, complete a declaração de maioridade.</Text>
        <Text style={styles.description}>Se preferir sair agora, sua identidade Google será preservada. Você poderá retomar o cadastro ao entrar com Google novamente.</Text>
        <FormNotice allRequired />
        <EligibilityFields cpf={cpf} setCpf={setCpf} birthDate={birthDate} setBirthDate={setBirthDate}
          accepted={accepted} setAccepted={setAccepted} disabled={busy} />
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: busy, busy }}
          disabled={busy} onPress={confirm} style={[styles.button, busy && styles.disabled]}>
          {busy ? <ActivityIndicator color={colors.background} /> : <Text style={styles.buttonText}>Concluir cadastro e entrar</Text>}
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={cancel} style={styles.cancel}>
          <Text style={styles.cancelText}>Voltar ao login</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: 26, paddingVertical: 24 },
  title: { color: colors.primary, fontSize: 25, fontWeight: 'bold', marginBottom: 16 },
  description: { color: colors.text, fontSize: 14, lineHeight: 21, marginBottom: 16 },
  error: { color: colors.danger, lineHeight: 21, marginBottom: 14 },
  button: { backgroundColor: colors.action, minHeight: 50, padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.background, fontSize: 16, fontWeight: 'bold' },
  disabled: { opacity: 0.6 },
  cancel: { minHeight: 48, padding: 16, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.primary, fontWeight: '600' }
});
