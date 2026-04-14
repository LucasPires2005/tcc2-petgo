import React, { useEffect, useState, useContext } from 'react';
import { View, StyleSheet, Alert, Modal, Text, TextInput, TouchableOpacity, Image, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';

export default function MapScreen() {
  const { user, refreshUserData, animals, fetchAnimals } = useContext(AuthContext); 
  const [location, setLocation] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('');
  const [breed, setBreed] = useState('');
  const [health, setHealth] = useState('');
  const [image, setImage] = useState(null);
  
  const [rescueModalVisible, setRescueModalVisible] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState(null);
  const [rescuerName, setRescuerName] = useState('');
  const [rescuerContact, setRescuerContact] = useState('');

  const API_URL = 'https://subpeltate-gene-nonpracticed.ngrok-free.dev/animals';

  useEffect(() => {
    getLocation();
    fetchAnimals(); 
  }, []);

  async function getLocation() {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    let loc = await Location.getCurrentPositionAsync({});
    setLocation(loc.coords);
  }

  async function pickImage() {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.5,
    });
    if (!result.canceled) setImage(result.assets[0].uri);
  }

  async function saveAnimal() {
    if (!selectedLocation || !species || !health) return Alert.alert('Atenção', 'Preencha os campos obrigatórios');
    const formData = new FormData();
    formData.append('name', name || "Sem nome");
    formData.append('species', species);
    formData.append('breed', breed);
    formData.append('health', health);
    formData.append('latitude', selectedLocation.latitude.toString());
    formData.append('longitude', selectedLocation.longitude.toString());
    formData.append('userId', user.id);
    if (image) {
      const filename = image.split('/').pop();
      const match = /\.(\w+)$/.exec(filename);
      formData.append('image', { uri: image, name: filename, type: match ? `image/${match[1]}` : `image` });
    }
    try {
      const res = await fetch(API_URL, { method: 'POST', body: formData, headers: { 'ngrok-skip-browser-warning': 'true' } });
      if (res.ok) {
        Alert.alert('Sucesso', 'Animal cadastrado!');
        setModalVisible(false);
        setName(''); setSpecies(''); setBreed(''); setHealth(''); setImage(null); setSelectedLocation(null);
        fetchAnimals(); // ATUALIZA TUDO NA HORA
      }
    } catch (error) { Alert.alert('Erro', 'Falha ao conectar'); }
  }

  async function handleRescue() {
    if (!rescuerName || !rescuerContact) return Alert.alert('Atenção', 'Preencha seus dados');
    try {
      const res = await fetch(`${API_URL}/${selectedAnimal.id}/rescue`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ rescuer_name: rescuerName, rescuer_contact: rescuerContact, userId: user.id }),
      });
      if (res.ok) {
        setRescueModalVisible(false);
        setRescuerName(''); setRescuerContact('');
        await refreshUserData(); 
        fetchAnimals(); 
        Alert.alert('Parabéns! ❤️', 'Você ganhou 50 PetCoins!');
      }
    } catch (error) { Alert.alert('Erro', 'Falha ao resgatar'); }
  }

  if (!location) return null;

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        onLongPress={(e) => setSelectedLocation(e.nativeEvent.coordinate)}
      >
        <Marker coordinate={location}>
          <View style={styles.userMarker}><Ionicons name="person" size={20} color="#FFF" /></View>
        </Marker>

        {animals.filter(a => a.status === 0).map((animal) => (
          <Marker key={animal.id} coordinate={{ latitude: animal.latitude, longitude: animal.longitude }}>
            <View style={[styles.petMarker, { backgroundColor: animal.species === 'Gato' ? '#FF9F43' : '#FF6B6B' }]}>
              <Ionicons name="paw" size={16} color="#FFF" />
            </View>
            <Callout tooltip onPress={() => { setSelectedAnimal(animal); setRescueModalVisible(true); }}>
              <View style={styles.calloutContainer}>
                <Text style={styles.calloutTitle}>{animal.name}</Text>
                <Text style={styles.calloutText}>{animal.species} • {animal.health}</Text>
                <View style={styles.rescueBtnMini}><Text style={styles.rescueBtnMiniText}>Quero Resgatar!</Text></View>
              </View>
            </Callout>
          </Marker>
        ))}

        {selectedLocation && (
          <Marker coordinate={selectedLocation}>
            <Ionicons name="location" size={40} color="#2ECC71" />
          </Marker>
        )}
      </MapView>

      <TouchableOpacity 
        style={[styles.addButton, { backgroundColor: selectedLocation ? '#2ECC71' : '#4A90E2' }]} 
        onPress={() => selectedLocation ? setModalVisible(true) : Alert.alert('Dica', 'Segure no mapa para marcar o local.')}
      >
        <Text style={styles.addButtonText}>{selectedLocation ? '✅ Confirmar Local' : '+ Adicionar Animal'}</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Novo Registro 🐾</Text>
              <TextInput placeholder="Nome" placeholderTextColor="#999" value={name} onChangeText={setName} style={styles.input} />
              <View style={styles.row}>
                <TouchableOpacity style={[styles.tag, species === 'Cachorro' && styles.tagSelected]} onPress={() => setSpecies('Cachorro')}>
                  <Text style={[styles.tagText, species === 'Cachorro' && styles.tagTextSelected]}>🐶 Cachorro</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tag, species === 'Gato' && styles.tagSelected]} onPress={() => setSpecies('Gato')}>
                  <Text style={[styles.tagText, species === 'Gato' && styles.tagTextSelected]}>🐱 Gato</Text>
                </TouchableOpacity>
              </View>
              <TextInput placeholder="Raça" placeholderTextColor="#999" value={breed} onChangeText={setBreed} style={styles.input} />
              <TextInput placeholder="Saúde" placeholderTextColor="#999" value={health} onChangeText={setHealth} style={styles.input} />
              <TouchableOpacity onPress={pickImage} style={styles.imagePickerBtn}>
                {image ? <Image source={{ uri: image }} style={styles.previewImage} /> : <Text style={{color: '#999'}}>📸 Selecionar Foto</Text>}
              </TouchableOpacity>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}><Text style={{color: '#999'}}>Cancelar</Text></TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={saveAnimal}><Text style={{color:'#FFF', fontWeight: 'bold'}}>Salvar</Text></TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={rescueModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.rescueModal}>
            <Text style={styles.modalTitle}>Resgatar Animal ❤️</Text>
            <TextInput placeholder="Seu Nome" placeholderTextColor="#999" style={styles.input} value={rescuerName} onChangeText={setRescuerName} />
            <TextInput placeholder="WhatsApp" placeholderTextColor="#999" style={styles.input} keyboardType="phone-pad" value={rescuerContact} onChangeText={setRescuerContact} />
            <TouchableOpacity style={styles.confirmRescueBtn} onPress={handleRescue}><Text style={{color:'#FFF', fontWeight:'bold'}}>Confirmar</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setRescueModalVisible(false)}><Text style={{textAlign:'center', marginTop:15, color:'#999'}}>Voltar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  userMarker: { backgroundColor: '#4A90E2', padding: 6, borderRadius: 20, borderWidth: 2, borderColor: '#FFF' },
  petMarker: { padding: 6, borderRadius: 15, borderWidth: 2, borderColor: '#FFF' },
  calloutContainer: { backgroundColor: '#FFF', padding: 10, borderRadius: 10, width: 150, alignItems: 'center' },
  calloutTitle: { fontWeight: 'bold', fontSize: 16, color: '#333' },
  calloutText: { fontSize: 12, color: '#666', marginBottom: 8 },
  rescueBtnMini: { backgroundColor: '#2ECC71', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 5 },
  rescueBtnMiniText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  addButton: { position: 'absolute', bottom: 40, alignSelf: 'center', paddingHorizontal: 30, paddingVertical: 15, borderRadius: 30, elevation: 5 },
  addButtonText: { color: '#fff', fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, maxHeight: '85%' },
  rescueModal: { backgroundColor: '#FFF', borderRadius: 20, padding: 25 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#333' },
  input: { backgroundColor: '#F8F9FA', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#EEE', color: '#333' },
  row: { flexDirection: 'row', marginBottom: 15 },
  tag: { flex: 1, backgroundColor: '#F1F3F5', padding: 14, marginRight: 10, borderRadius: 12, alignItems: 'center' },
  tagSelected: { backgroundColor: '#4A90E2' },
  tagText: { color: '#495057', fontWeight: 'bold' },
  tagTextSelected: { color: '#FFF' },
  imagePickerBtn: { height: 120, backgroundColor: '#F8F9FA', borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: '#CCC', marginBottom: 20 },
  previewImage: { width: '100%', height: '100%', borderRadius: 15 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelButton: { padding: 15, flex: 1, alignItems: 'center' },
  saveButton: { backgroundColor: '#2ECC71', padding: 15, borderRadius: 12, flex: 2, alignItems: 'center' },
  confirmRescueBtn: { backgroundColor: '#2ECC71', padding: 18, borderRadius: 12, alignItems: 'center' },
});