import { colors } from '../theme/colors';
import React, { useContext, useState } from 'react';
import { View, Text, StyleSheet, FlatList, SafeAreaView, Modal, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import AnimalDeletionForm from '../components/AnimalDeletionForm';
import { isAnimalAuthor } from '../services/animalDeletion';

export default function RescuedScreen() {
  const { animals, user } = useContext(AuthContext);
  const [selected, setSelected] = useState(null);
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
            <View style={styles.cardInfo}><Text style={styles.animalName}>{item.name}</Text><Text style={styles.infoText}>{item.species} • Resgatado por {item.rescuer_name || 'Herói'}</Text>
              {isAnimalAuthor(item, user?.id) && <TouchableOpacity accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', marginTop: 8 }} onPress={() => setSelected(item)}>
                <Text style={{ color: colors.danger, fontWeight: '600' }}>Excluir meu registro</Text>
              </TouchableOpacity>}
            </View>
            <Ionicons name="heart" size={24} color={colors.action} />
          </View>
        )}
      />
      <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => {}}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: colors.background, borderRadius: 24, padding: 24, maxHeight: '85%' }}>
            {selected && <AnimalDeletionForm key={selected.id} animal={selected} onCancel={() => setSelected(null)} onDeleted={() => setSelected(null)} />}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 20, backgroundColor: colors.background, borderBottomWidth: 1, borderColor: '#EEE', paddingTop: 60 },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 14, color: colors.primary },
  card: { backgroundColor: colors.background, padding: 20, borderRadius: 15, marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 3 },
  cardInfo: { flex: 1 },
  animalName: { fontSize: 18, fontWeight: 'bold' },
  infoText: { color: colors.text },
  empty: { textAlign: 'center', marginTop: 50, color: '#999' }
});
