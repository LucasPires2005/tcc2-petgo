import React, { useEffect, useState, useContext } from 'react';
import { View, Text, StyleSheet, FlatList, SafeAreaView, ActivityIndicator } from 'react-native';
import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import { AuthContext } from '../context/AuthContext';

export default function NearbyScreen() {
  const { animals } = useContext(AuthContext);
  const [location, setLocation] = useState(null);
  const [radius, setRadius] = useState(10);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
      setLoading(false);
    })();
  }, []);

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  if (loading || !location) return <View style={styles.center}><ActivityIndicator size="large" color="#4A90E2" /></View>;

  const filtered = animals
    .filter(a => a.status === 0)
    .map(a => ({ ...a, dist: calculateDistance(location.latitude, location.longitude, a.latitude, a.longitude) }))
    .filter(a => a.dist <= radius)
    .sort((a, b) => a.dist - b.dist);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Animais Próximos 📍</Text>
        <Text style={styles.subtitle}>Raio: {radius.toFixed(0)} km</Text>
        <Slider style={{width: '100%', height: 40}} minimumValue={1} maximumValue={100} minimumTrackTintColor="#4A90E2" thumbTintColor="#4A90E2" value={radius} onValueChange={setRadius} />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ padding: 20 }}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum animal nesta área.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View><Text style={styles.animalName}>{item.name}</Text><Text style={styles.animalInfo}>{item.species} • {item.health}</Text></View>
            <View style={{alignItems: 'flex-end'}}><Text style={styles.distanceText}>{item.dist.toFixed(1)} km</Text></View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { padding: 20, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#EEE', paddingTop: 60 },
  title: { fontSize: 22, fontWeight: 'bold' },
  subtitle: { fontSize: 16, color: '#666' },
  card: { backgroundColor: '#FFF', padding: 20, borderRadius: 15, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 2 },
  animalName: { fontSize: 18, fontWeight: 'bold' },
  animalInfo: { color: '#666' },
  distanceText: { fontWeight: 'bold', color: '#4A90E2' },
  empty: { textAlign: 'center', marginTop: 50, color: '#999' },
  center: { flex: 1, justifyContent: 'center' }
});