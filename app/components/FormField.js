import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

export function FormNotice({ allRequired = false }) {
  return <Text style={styles.notice}>{allRequired
    ? 'Todos os campos são obrigatórios. * indica campo obrigatório.'
    : 'Campos com * são obrigatórios.'}</Text>;
}

export function FieldLabel({ label, required = false, help }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={styles.labelGroup}>
    <View style={styles.row}>
      <Text style={styles.label}>{label}{required ? ' *' : ' (opcional)'}</Text>
      {!!help && <TouchableOpacity accessibilityRole="button"
        accessibilityLabel={`Ajuda: ${label}`} accessibilityState={{ expanded }}
        accessibilityHint="Mostra ou oculta uma orientação sobre este campo."
        onPress={() => setExpanded(value => !value)} style={styles.helpButton}>
        <Ionicons name="information-circle-outline" size={22} color={colors.primary} />
      </TouchableOpacity>}
    </View>
    {expanded && <Text accessibilityLiveRegion="polite" style={styles.help}>{help}</Text>}
  </View>;
}

// Acrescenta apresentação e acessibilidade sem controlar valor ou eventos do input.
export default function FormField({ label, required = false, help, children }) {
  const input = React.Children.only(children);
  return <View style={styles.field}>
    <FieldLabel label={label} required={required} help={help} />
    {React.cloneElement(input, {
      accessibilityLabel: `${label}, ${required ? 'obrigatório' : 'opcional'}`,
      accessibilityHint: help || input.props.accessibilityHint
    })}
  </View>;
}

const styles = StyleSheet.create({
  field: { alignSelf: 'stretch' },
  notice: { color: colors.text, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  labelGroup: { alignSelf: 'stretch', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { flex: 1, color: colors.primary, fontSize: 14, fontWeight: '600' },
  helpButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  help: { color: colors.text, fontSize: 13, lineHeight: 19, marginBottom: 8 }
});
