import React, { useState } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet, Linking, Platform, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { categoryLabel, directionsUrls } from '../services/supportNetwork';

export default function SupportPartnerDetails({ partner, referenceLabel, onClose }) {
  const insets = useSafeAreaInsets();
  const [opening, setOpening] = useState(false);
  async function openDirections() {
    if (!partner || opening) return;
    setOpening(true);
    try {
      const urls = directionsUrls(partner, Platform.OS);
      try { await Linking.openURL(urls.native); }
      catch { await Linking.openURL(urls.fallback); }
    } catch {
      Alert.alert('Não foi possível abrir o mapa', 'Tente novamente ou consulte as coordenadas exibidas nos detalhes.');
    } finally { setOpening(false); }
  }
  return <Modal visible={Boolean(partner)} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <View accessibilityViewIsModal style={[styles.card, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        {partner && <ScrollView contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={styles.title}>{partner.name}</Text>
          <Text style={styles.category}>{categoryLabel(partner.category)}</Text>
          <Text style={styles.badge}>Demonstração acadêmica</Text>
          <Text style={styles.text}>{partner.description}</Text>
          <Text style={styles.label}>Endereço ilustrativo</Text>
          <Text style={styles.text}>{partner.address}</Text>
          <Text style={styles.label}>Distância aproximada em linha reta</Text>
          <Text style={styles.text}>{partner.dist.toFixed(1)} km · {referenceLabel}</Text>
          <Text style={styles.text}>Coordenadas: {partner.latitude}, {partner.longitude}</Text>
          <Text style={styles.notice}>Este estabelecimento é fictício e não representa uma parceria real. O endereço e a localização são ilustrativos. O mapa será aberto nessas coordenadas apenas para demonstrar a navegação.</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityHint="Abre a localização ilustrativa no aplicativo de mapas."
            accessibilityState={{ disabled: opening }} disabled={opening} style={styles.primary} onPress={openDirections}>
            {opening ? <ActivityIndicator color={colors.background} /> : <Text style={styles.primaryText}>Como chegar</Text>}
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>Fechar</Text>
          </TouchableOpacity>
        </ScrollView>}
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  card: { maxHeight: '90%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  content: { padding: 24 }, title: { fontSize: 23, fontWeight: 'bold', color: colors.primary },
  category: { fontSize: 15, color: colors.text, marginTop: 6 },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.surface, color: colors.primary, padding: 8, borderRadius: 8, marginVertical: 16 },
  text: { color: colors.text, fontSize: 15, lineHeight: 22, marginBottom: 12 },
  label: { color: colors.primary, fontWeight: '600', marginBottom: 6, marginTop: 8 },
  notice: { color: colors.text, backgroundColor: colors.surface, padding: 14, borderRadius: 12, lineHeight: 21, marginVertical: 12 },
  primary: { backgroundColor: colors.action, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 14 },
  primaryText: { color: colors.background, fontWeight: 'bold' },
  close: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  closeText: { color: colors.primary, fontWeight: '600' }
});
