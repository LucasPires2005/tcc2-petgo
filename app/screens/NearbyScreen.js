import { colors } from '../theme/colors';
import React, { useEffect, useState, useContext, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, SafeAreaView, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { getBestAvailableLocation } from '../services/location';
import { normalizeCoordinates, nearbyItems } from '../services/proximity';
import { SUPPORT_CATEGORIES, categoryLabel, nearbyPartners, loadSupportNetwork } from '../services/supportNetwork';
import SupportPartnerDetails from '../components/SupportPartnerDetails';

export default function NearbyScreen({ route, navigation }) {
  const { animals } = useContext(AuthContext);
  const initialRegion = normalizeCoordinates(route.params?.supportRegion);
  const [view, setView] = useState(initialRegion ? 'support' : 'animals');
  const [region, setRegion] = useState(initialRegion ? { ...initialRegion, name: route.params.supportRegion.name } : null);
  const [location, setLocation] = useState(null);
  const [radius, setRadius] = useState(10);
  const [category, setCategory] = useState('all');
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [partners, setPartners] = useState(null);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnersError, setPartnersError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const mounted = useRef(true);
  const locationBusy = useRef(false);
  const needsLocation = view === 'animals' || !region;
  const origin = view === 'support' && region ? region : location;
  const referenceLabel = view === 'support' && region
    ? 'Região do animal: ' + (region.name || 'registro selecionado') : 'Sua localização';

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function loadLocation() {
    if (locationBusy.current) return;
    locationBusy.current = true;
    setLocating(true);
    setLocationError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Permita o acesso à localização para consultar esta área.');
      const loc = await getBestAvailableLocation();
      const coordinates = normalizeCoordinates(loc.coords);
      if (!coordinates) throw new Error('Localização indisponível. Ative o GPS e tente novamente.');
      if (mounted.current) setLocation(coordinates);
    } catch (error) {
      if (mounted.current) setLocationError(error.message || 'Não foi possível obter sua localização. Ative o GPS e tente novamente.');
    } finally {
      locationBusy.current = false;
      if (mounted.current) setLocating(false);
    }
  }

  useEffect(() => {
    if (needsLocation && !location) loadLocation();
  }, [needsLocation]);

  useEffect(() => {
    const coordinates = normalizeCoordinates(route.params?.supportRegion);
    if (!coordinates) return;
    setRegion({ ...coordinates, name: route.params.supportRegion.name });
    setView('support');
    setCategory('all');
    setSelectedPartner(null);
    // Consome o pedido: voltar à aba não força novamente o filtro anterior.
    navigation.setParams({ supportRegion: undefined });
  }, [route.params?.supportRegion, navigation]);

  useEffect(() => {
    if (view !== 'support' || partners !== null) return;
    let active = true;
    setPartnersLoading(true);
    setPartnersError(null);
    loadSupportNetwork().then(items => { if (active) setPartners(items); })
      .catch(error => { if (active) setPartnersError(error.message || 'Não foi possível carregar a rede de apoio.'); })
      .finally(() => { if (active) setPartnersLoading(false); });
    return () => { active = false; };
  }, [view, retry]);

  const filtered = !origin ? [] : view === 'animals'
    ? nearbyItems(animals.filter(animal => animal.status === 0), origin, radius)
    : nearbyPartners(partners || [], origin, radius, category);
  const loading = (!origin && locating) || (view === 'support' && partnersLoading);
  const error = !origin ? locationError : view === 'support' ? partnersError : null;

  const header = <View style={styles.header}>
    <Text accessibilityRole="header" style={styles.title}>{view === 'animals' ? 'Animais Próximos ' : 'Rede de Apoio'}</Text>
    <View style={styles.switchRow}>
      {[{ value: 'animals', label: 'Animais' }, { value: 'support', label: 'Rede de Apoio' }].map(option => (
        <TouchableOpacity key={option.value} accessibilityRole="tab" accessibilityState={{ selected: view === option.value }}
          style={[styles.switch, view === option.value && styles.activeSwitch]}
          onPress={() => { setView(option.value); setSelectedPartner(null); }}>
          <Text style={[styles.switchText, view === option.value && styles.activeText]}>{option.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
    <Text style={styles.reference}>{referenceLabel}</Text>
    {view === 'support' && region && <TouchableOpacity accessibilityRole="button" style={styles.locationButton}
      onPress={() => { setRegion(null); setSelectedPartner(null); }}>
      <Text style={styles.link}>Usar minha localização</Text>
    </TouchableOpacity>}
    <Text style={styles.subtitle}>Raio: {radius.toFixed(0)} km</Text>
    <Slider style={styles.slider} minimumValue={1} maximumValue={100} minimumTrackTintColor={colors.primary}
      thumbTintColor={colors.primary} value={radius} onValueChange={setRadius}
      accessibilityLabel="Raio de busca em quilômetros" accessibilityValue={{ min: 1, max: 100, now: Math.round(radius) }} />
    {view === 'support' && <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {SUPPORT_CATEGORIES.map(option => <TouchableOpacity key={option.value} accessibilityRole="radio"
          accessibilityState={{ checked: category === option.value }} style={[styles.chip, category === option.value && styles.activeChip]}
          onPress={() => { setCategory(option.value); setSelectedPartner(null); }}>
          <Text style={styles.chipText}>{option.label}</Text>
        </TouchableOpacity>)}
      </ScrollView>
      <Text style={styles.demoNotice}>Rede fictícia para demonstração acadêmica. Nomes, endereços e coordenadas são ilustrativos; não há parcerias reais. Exemplos próximos ao Senac Nações Unidas, em Santo Amaro, São Paulo/SP.</Text>
      <Text style={styles.distanceHint}>Distâncias aproximadas em linha reta.</Text>
    </>}
  </View>;

  return <SafeAreaView style={styles.container}>
    <FlatList key={view} data={loading || error ? [] : filtered} keyExtractor={item => String(item.id)}
      ListHeaderComponent={header} contentContainerStyle={styles.listContent}
      ListEmptyComponent={<View style={styles.emptyBox}>
        {loading ? <ActivityIndicator size="large" color={colors.primary} /> : error ? <>
          <Text accessibilityRole="alert" style={styles.empty}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.retryButton}
            onPress={() => !origin ? loadLocation() : setRetry(value => value + 1)}>
            <Text style={styles.retryButtonText}>Tentar novamente</Text>
          </TouchableOpacity>
        </> : <Text style={styles.empty}>{view === 'animals' ? 'Nenhum animal nesta área.'
          : 'Nenhum estabelecimento de demonstração neste raio e categoria. Aumente o raio ou escolha Todos.'}</Text>}
      </View>}
      renderItem={({ item }) => view === 'animals' ? <View style={styles.card}>
        <View style={styles.cardInfo}><Text style={styles.animalName}>{item.name}</Text><Text style={styles.animalInfo}>{item.species} • {item.health}</Text></View>
        <Text style={styles.distanceText}>{item.dist.toFixed(1)} km</Text>
      </View> : <TouchableOpacity accessibilityRole="button"
        accessibilityLabel={item.name + ', ' + categoryLabel(item.category) + ', ' + item.dist.toFixed(1) + ' quilômetros, estabelecimento fictício. Ver detalhes.'}
        style={styles.card} onPress={() => setSelectedPartner(item)}>
        <View style={styles.partnerIcon}><Ionicons name={{ store: 'storefront-outline', clinic: 'medkit-outline', ngo: 'heart-outline' }[item.category] || 'location-outline'} size={24} color={colors.primary} /></View>
        <View style={styles.cardInfo}>
          <Text style={styles.animalName}>{item.name}</Text>
          <Text style={styles.category}>{categoryLabel(item.category)}</Text>
          <Text style={styles.animalInfo}>{item.address}</Text>
          <Text style={styles.demoTag}>Demonstração acadêmica</Text>
        </View>
        <View style={styles.distance}><Text style={styles.distanceText}>{item.dist.toFixed(1)} km</Text><Ionicons name="chevron-forward" size={18} color={colors.primary} /></View>
      </TouchableOpacity>} />
    <SupportPartnerDetails partner={selectedPartner} referenceLabel={referenceLabel} onClose={() => setSelectedPartner(null)} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { paddingBottom: 24 },
  header: { padding: 20, borderBottomWidth: 1, borderColor: '#EEE', paddingTop: 60, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: colors.primary },
  subtitle: { fontSize: 16, color: colors.text, marginTop: 12 },
  reference: { color: colors.text, fontSize: 14, lineHeight: 20, marginTop: 12 },
  switchRow: { flexDirection: 'row', marginTop: 16, gap: 8 },
  switch: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.surface },
  activeSwitch: { backgroundColor: colors.action, borderColor: colors.action },
  switchText: { color: colors.primary, fontWeight: '600' },
  activeText: { color: colors.background },
  slider: { width: '100%', height: 40 },
  filters: { gap: 8, paddingVertical: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: '#DDD' },
  activeChip: { backgroundColor: colors.surface, borderColor: colors.primary },
  chipText: { color: colors.primary, fontWeight: '600' },
  demoNotice: { color: colors.text, backgroundColor: colors.surface, padding: 12, borderRadius: 10, lineHeight: 19, fontSize: 12, marginTop: 8 },
  distanceHint: { color: colors.text, fontSize: 12, marginTop: 8 },
  locationButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { color: colors.action, fontWeight: '600' },
  card: { marginHorizontal: 20, backgroundColor: colors.background, padding: 16, borderRadius: 15, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#EEE', elevation: 2 },
  cardInfo: { flex: 1 },
  animalName: { fontSize: 17, fontWeight: 'bold', color: colors.primary },
  animalInfo: { color: colors.text, lineHeight: 20, marginTop: 4 },
  category: { color: colors.action, fontSize: 13, marginTop: 4 },
  partnerIcon: { padding: 10, backgroundColor: colors.surface, borderRadius: 12, marginRight: 12 },
  distance: { alignItems: 'flex-end', marginLeft: 8, gap: 8 },
  distanceText: { fontWeight: 'bold', color: colors.primary },
  demoTag: { color: colors.primary, fontSize: 11, marginTop: 6 },
  emptyBox: { paddingHorizontal: 24, paddingVertical: 24, alignItems: 'center' },
  empty: { textAlign: 'center', color: colors.text, lineHeight: 22, marginBottom: 16 },
  retryButton: { backgroundColor: colors.action, minHeight: 48, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, justifyContent: 'center' },
  retryButtonText: { color: colors.background, fontWeight: 'bold' }
});
