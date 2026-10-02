import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import FormField from './FormField';
import { colors } from '../theme/colors';
import { formatCpf, formatBirthDate } from '../services/eligibilityApi';

export default function EligibilityFields({ cpf, setCpf, birthDate, setBirthDate, accepted, setAccepted, disabled = false }) {
  return <View>
    <Text style={styles.notice}>Demonstração acadêmica: use dados de teste. A validação local do CPF e da data declarada não comprova identidade ou titularidade. O CPF não será exibido publicamente.</Text>
    <FormField label="CPF" required help="Informe os 11 dígitos. O servidor verifica o formato matemático, sem consultar órgãos oficiais.">
      <TextInput value={cpf} onChangeText={value => setCpf(formatCpf(value))} editable={!disabled}
        keyboardType="number-pad" placeholder="000.000.000-00" placeholderTextColor="#666666"
        maxLength={14} autoCorrect={false} underlineColorAndroid="transparent" selectionColor={colors.action} style={styles.input} />
    </FormField>
    <FormField label="Data de nascimento" required help="Digite DD/MM/AAAA. É necessário declarar idade igual ou superior a 18 anos.">
      <TextInput value={birthDate} onChangeText={value => setBirthDate(formatBirthDate(value))} editable={!disabled}
        keyboardType="number-pad" placeholder="DD/MM/AAAA" placeholderTextColor="#666666"
        maxLength={10} autoCorrect={false} underlineColorAndroid="transparent" selectionColor={colors.action} style={styles.input} />
    </FormField>
    <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel="Declaro ter 18 anos ou mais e que os dados informados são corretos, obrigatório"
      accessibilityState={{ checked: accepted, disabled }} disabled={disabled} onPress={() => setAccepted(value => !value)} style={styles.checkbox}>
      <Ionicons name={accepted ? 'checkbox' : 'square-outline'} size={25} color={colors.action} />
      <Text style={styles.checkboxText}>Declaro ter 18 anos ou mais e que os dados informados são corretos. *</Text>
    </TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  notice: { color: colors.text, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  input: { backgroundColor: colors.surface, color: colors.text, borderWidth: 1, borderColor: '#DDDDDD', borderRadius: 12, padding: 15, marginBottom: 15 },
  checkbox: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 10, marginBottom: 18 },
  checkboxText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 }
});
