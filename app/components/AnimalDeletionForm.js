import React, { useContext, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../theme/colors';
import { AuthContext } from '../context/AuthContext';
import { deleteOwnAnimal, isAnimalAuthor } from '../services/animalDeletion';

// Conteúdo reutilizado na modal já aberta, sem empilhar modais no iOS.
export default function AnimalDeletionForm({ animal, onCancel, onDeleted }) {
  const { user, fetchAnimals, refreshUserData } = useContext(AuthContext);
  const [choice, setChoice] = useState('Criado por engano');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const reason = choice === 'Outro' ? custom.trim() : choice;
  async function confirm() {
    if (lock.current || !isAnimalAuthor(animal, user?.id)) return;
    if (reason.length < 3 || reason.length > 500) { setError('Escreva um motivo com 3 a 500 caracteres.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await deleteOwnAnimal(animal.id, reason);
      onDeleted();
      // Exclusão já confirmada: não prender a modal enquanto atualiza a listagem.
      void Promise.allSettled([fetchAnimals(), refreshUserData()]);
      Alert.alert('Registro excluído', result.storageCleanup?.status === 'partial'
        ? 'O registro foi removido. Algumas fotos ainda precisam de limpeza pela equipe.'
        : 'O registro foi removido do PetGo.');
    } catch (err) {
      setError(err.message || 'Não foi possível excluir. Atualize a lista e tente novamente.');
    } finally { lock.current = false; setBusy(false); }
  }
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>Excluir registro</Text>
    <Text style={styles.description}>Deseja remover {animal?.name || 'este animal'}? O registro e suas fotos serão excluídos, exceto fotos compartilhadas. Não há desfazer. Essa ação não altera PetCoins.</Text>
    <Text style={styles.label}>Qual é o motivo?</Text>
    {['Criado por engano', 'Animal já encontrado', 'Outro'].map(value => <TouchableOpacity key={value}
      accessibilityRole="radio" accessibilityState={{ checked: choice === value, disabled: busy }} disabled={busy}
      style={[styles.option, choice === value && styles.selected]} onPress={() => { setChoice(value); setError(''); }}>
      <Text style={styles.optionText}>{choice === value ? '●' : '○'}  {value}</Text>
    </TouchableOpacity>)}
    {choice === 'Outro' && <TextInput accessibilityLabel="Motivo da exclusão" editable={!busy} value={custom}
      onChangeText={setCustom} multiline maxLength={500} placeholder="Conte o motivo (3 a 500 caracteres)"
      placeholderTextColor="#666666" style={styles.input} textAlignVertical="top" />}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <View style={styles.actions}>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.cancel}><Text style={styles.optionText}>Cancelar</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Confirmar exclusão do registro" disabled={busy || !isAnimalAuthor(animal, user?.id)}
        onPress={confirm} style={[styles.confirm, busy && { opacity: 0.6 }]}>
        {busy ? <ActivityIndicator color={colors.background} /> : <Text style={styles.confirmText}>Excluir registro</Text>}
      </TouchableOpacity>
    </View>
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { paddingBottom: 24 }, title: { fontSize: 22, fontWeight: 'bold', color: colors.primary },
  description: { color: colors.text, lineHeight: 21, marginVertical: 14 }, label: { color: colors.primary, fontWeight: '600', marginBottom: 10 },
  option: { minHeight: 48, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#DDDDDD', marginBottom: 8 },
  selected: { borderColor: colors.action, backgroundColor: colors.surface }, optionText: { color: colors.primary, fontWeight: '600' },
  input: { backgroundColor: colors.surface, color: colors.text, padding: 14, minHeight: 90, borderRadius: 12, marginVertical: 8 },
  error: { color: '#B91C1C', marginVertical: 10 }, actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancel: { flex: 1, minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#DDDDDD', alignItems: 'center', justifyContent: 'center' },
  confirm: { flex: 2, minHeight: 48, padding: 12, borderRadius: 12, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: colors.background, fontWeight: 'bold' }
});
