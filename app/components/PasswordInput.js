import { colors } from '../theme/colors';
import React, { useEffect, useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Cada instância controla somente sua visibilidade, sem alterar o valor do campo.
export default function PasswordInput({ style, resetKey, editable = true, ...props }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(false); }, [resetKey]);
  const fieldStyle = StyleSheet.flatten(style) || {};
  return <View style={{ alignSelf: 'stretch', marginBottom: fieldStyle.marginBottom }}>
    <TextInput {...props} editable={editable} secureTextEntry={!visible}
      style={[style, { marginBottom: 0, paddingRight: 52 }]} />
    <TouchableOpacity accessibilityRole="button"
      accessibilityLabel={`${visible ? 'Ocultar' : 'Mostrar'} ${props.placeholder || 'senha'}`}
      accessibilityState={{ disabled: !editable }} disabled={!editable}
      onPress={() => setVisible(value => !value)} style={styles.eye}>
      <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={24} color={colors.primary} />
    </TouchableOpacity>
  </View>;
}

const styles = StyleSheet.create({
  eye: { position: 'absolute', right: 4, top: 0, bottom: 0, width: 44, minHeight: 44,
    alignItems: 'center', justifyContent: 'center' }
});
