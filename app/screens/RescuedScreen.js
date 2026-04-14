import React, { useContext } from 'react';
import { View, Text, StyleSheet, FlatList, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';

export default function RescuedScreen() {
  const { animals } = useContext(AuthContext);
  const rescuedAnimals = animals.filter(a => a.status === 1);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Finais Felizes! ❤️</Text>
        <Text style={styles.subtitle}>Animais que já foram salvos.</Text>
      </View>
      <FlatList
        data={rescuedAnimals}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={{ padding: 20 }}
        ListEmptyComponent={<Text style={styles.empty}>Ainda não temos resgates registrados.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardInfo}><Text style={styles.animalName}>{item.name}</Text><Text style={styles.infoText}>{item.species} • Resgatado por {item.rescuer_name || 'Herói'}</Text></View>
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
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 14, color: '#666' },
  card: { backgroundColor: '#FFF', padding: 20, borderRadius: 15, marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 3 },
  cardInfo: { flex: 1 },
  animalName: { fontSize: 18, fontWeight: 'bold' },
  infoText: { color: '#666' },
  empty: { textAlign: 'center', marginTop: 50, color: '#999' }
});