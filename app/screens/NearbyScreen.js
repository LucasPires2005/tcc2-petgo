import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, SafeAreaView, ActivityIndicator } from 'react-native';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import { getAnimals } from '../services/api';

export default function NearbyScreen() {
  const [animals, setAnimals] = useState([]);
  const [location, setLocation] = useState(null);
  const [radius, setRadius] = useState(10); // Aumentei o raio padrão para 10km
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      
      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
      
      const data = await getAnimals();
      setAnimals(data);
    } catch (e) {
      console.log("Erro no load:", e);
    } finally {
      setLoading(false);
    }
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#4A90E2" /></View>;

  // FILTRAGEM COM LOGS DE DEPURAÇÃO
  const filtered = (Array.isArray(animals) ? animals : [])
    .map(a => {
      const dist = calculateDistance(location.latitude, location.longitude, a.latitude, a.longitude);
      // Descomente a linha abaixo para ver as distâncias de cada animal no terminal:
      // console.log(`Animal: ${a.name} está a ${dist.toFixed(2)} km`); 
      return { ...a, dist };
    })
    .filter(a => a.dist <= radius)
    .sort((a, b) => a.dist - b.dist); // Mostrar os mais perto primeiro

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Animais Próximos 📍</Text>
        <Text style={styles.subtitle}>Raio de busca: {radius.toFixed(0)} km</Text>
        <Slider
          style={{ width: '100%', height: 40 }}
          minimumValue={1}
          maximumValue={100} // Aumentei o máximo para 100km para facilitar testes
          minimumTrackTintColor="#4A90E2"
          maximumTrackTintColor="#D3D3D3"
          thumbTintColor="#4A90E2"
          value={radius}
          onValueChange={setRadius}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ padding: 20 }}
        ListEmptyComponent={
          <View style={{alignItems: 'center', marginTop: 40}}>
             <Text style={styles.empty}>Nenhum animal nesta área.</Text>
             <Text style={{color: '#999', fontSize: 12, marginTop: 10}}>Tente aumentar o raio de busca no slider acima.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View>
              <Text style={styles.animalName}>{item.name}</Text>
              <Text style={styles.animalInfo}>{item.species} • {item.health}</Text>
            </View>
            <View style={{alignItems: 'flex-end'}}>
               <Text style={styles.distanceText}>{item.dist.toFixed(1)} km</Text>
               <Text style={{fontSize: 10, color: '#AAA'}}>distância</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8F9FA' },
    header: { padding: 20, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#EEE', paddingTop: 50 },
    title: { fontSize: 22, fontWeight: 'bold', color: '#333' },
    subtitle: { fontSize: 16, color: '#666', marginTop: 5 },
    card: { backgroundColor: '#FFF', padding: 20, borderRadius: 15, marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 2 },
    animalName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    animalInfo: { color: '#666', marginTop: 2 },
    distanceText: { fontWeight: 'bold', color: '#4A90E2' },
    empty: { textAlign: 'center', marginTop: 50, color: '#999' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' }
  });