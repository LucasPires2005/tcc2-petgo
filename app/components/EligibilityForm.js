import React, { useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { FormNotice } from './FormField';
import EligibilityFields from './EligibilityFields';
import { colors } from '../theme/colors';
import { birthDateToIso, declarationError, declareEligibility } from '../services/eligibilityApi';

// Vive somente dentro do formulário de resgate. Nenhum documento vai ao perfil/cache.
export default function EligibilityForm({ onCancel, onCompleted }) {
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function confirm() {
    if (lock.current) return;
    const validation = declarationError(cpf, birthDate, accepted);
    if (validation) { setError(validation); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await declareEligibility(cpf, birthDateToIso(birthDate), accepted);
      if (!active.current) return;
      if (!result.declaredAdult) throw new Error('A declaração não foi confirmada. Tente novamente.');
      // O CPF só preenche o resgate em andamento; não é salvo localmente.
      onCompleted(cpf);
    } catch (err) {
      if (active.current) setError(err.message || 'Não foi possível concluir. Tente novamente.');
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }

  return <>
    <Text accessibilityRole="header" style={styles.title}>Antes de resgatar</Text>
    <Text style={styles.description}>Complete sua declaração de maioridade para continuar com este resgate. Você pode cancelar e continuar navegando no mapa.</Text>
    <FormNotice allRequired />
    <EligibilityFields cpf={cpf} setCpf={setCpf} birthDate={birthDate} setBirthDate={setBirthDate}
      accepted={accepted} setAccepted={setAccepted} disabled={busy} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={confirm} style={[styles.button, busy && { opacity: 0.6 }]}>
      {busy ? <ActivityIndicator color={colors.background} /> : <Text style={styles.buttonText}>Confirmar e continuar</Text>}
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.cancel}><Text style={styles.cancelText}>Voltar ao mapa</Text></TouchableOpacity>
  </>;
}

const styles = StyleSheet.create({
  title: { color: colors.primary, fontSize: 21, fontWeight: 'bold', marginBottom: 12 },
  description: { color: colors.text, fontSize: 14, lineHeight: 21, marginBottom: 14 },
  error: { color: colors.danger, lineHeight: 20, marginBottom: 12 },
  button: { backgroundColor: colors.action, minHeight: 48, padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.background, fontWeight: 'bold' },
  cancel: { minHeight: 48, padding: 14, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.primary, fontWeight: '600' }
});
