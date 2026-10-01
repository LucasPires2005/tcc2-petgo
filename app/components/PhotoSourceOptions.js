import { colors } from '../theme/colors';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

// Menu dentro da modal atual: não sobrepõe outra modal ao seletor nativo.
export default function PhotoSourceOptions({ onSelect, onCancel }) {
  return <View style={styles.menu}>
    <Text style={styles.title}>Como deseja adicionar a foto?</Text>
    <TouchableOpacity accessibilityRole="button" style={styles.option} onPress={() => onSelect('camera')}>
      <Text style={styles.label}>Tirar Foto</Text>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" style={styles.option} onPress={() => onSelect('gallery')}>
      <Text style={styles.label}>Escolher da Galeria</Text>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" style={styles.option} onPress={onCancel}>
      <Text style={[styles.label, { color: colors.danger }]}>Cancelar</Text>
    </TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({
  menu: { backgroundColor: colors.background, borderColor: '#CBD5E1', borderWidth: 1, borderRadius: 12, padding: 8, marginBottom: 15 },
  title: { color: colors.primary, textAlign: 'center', padding: 8, fontWeight: 'bold' },
  option: { minHeight: 44, justifyContent: 'center', alignItems: 'center', padding: 10 },
  label: { color: colors.primary, fontWeight: '600' }
});
