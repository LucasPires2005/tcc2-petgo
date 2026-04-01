import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, SafeAreaView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function RescuedScreen() {
  const [rescuedAnimals, setRescuedAnimals] = useState([]);
  const [loading, setLoading] = useState(true);

  // URL DO SEU NGROK (Lembre-se de conferir se o link no terminal é este mesmo)
  const API_URL = 'https://subpeltate-gene-nonpracticed.ngrok-free.dev/animals/rescued';

  useEffect(() => {
    fetchRescued();
  }, []);

  async function fetchRescued() {
    try {
      const res = await fetch(API_URL, {
        headers: { 
          'ngrok-skip-browser-warning': 'true',
          'Accept': 'application/json'
        }
      });
      const data = await res.json();
      
      // Filtramos para garantir que só pegamos quem tem status 1 (resgatado)
      setRescuedAnimals(Array.isArray(data) ? data : []);
    } catch (e) {
      console.log("Erro ao buscar resgatados:", e);
      setRescuedAnimals([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2ECC71" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Finais Felizes! ❤️</Text>
        <Text style={styles.subtitle}>Estes animais já foram retirados das ruas.</Text>
      </View>

      <FlatList
        data={rescuedAnimals}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ padding: 20 }}
        ListEmptyComponent={
          <Text style={styles.empty}>Ainda não temos resgates registrados. Que tal começar um?</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardInfo}>
              <Text style={styles.animalName}>{item.name}</Text>
              <Text style={styles.infoText}>{item.species} • Resgatado por {item.rescuer_name || 'Alguém especial'}</Text>
            </View>
            <Ionicons name="heart" size={24} color="#E74C3C" />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { padding: 20, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#EEE', paddingTop: 60 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 5 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { 
    backgroundColor: '#FFF', 
    padding: 20, 
    borderRadius: 15, 
    marginBottom: 15, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
  },
  cardInfo: { flex: 1 },
  animalName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  infoText: { color: '#666', marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 50, color: '#999', paddingHorizontal: 40 },
});