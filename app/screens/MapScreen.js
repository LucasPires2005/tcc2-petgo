import React, { useEffect, useState, useContext } from 'react';
import { View, StyleSheet, Alert, Modal, Text, TextInput, TouchableOpacity, Image, KeyboardAvoidingView, Platform, ScrollView, Share, TouchableWithoutFeedback } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';

export default function MapScreen() {
  const { user, refreshUserData, animals, fetchAnimals, donateCoins } = useContext(AuthContext); 
  
  const [location, setLocation] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false); 
  const [rescueModalVisible, setRescueModalVisible] = useState(false);

  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedAnimal, setSelectedAnimal] = useState(null);
  const [filter, setFilter] = useState('Todos'); 
  
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('');
  const [breed, setBreed] = useState('');
  const [health, setHealth] = useState('');
  const [image, setImage] = useState(null);

  const [rescuerName, setRescuerName] = useState('');
  const [rescuerContact, setRescuerContact] = useState('');
  const [rescueImage, setRescueImage] = useState(null); 

  const API_BASE_URL = 'https://subpeltate-gene-nonpracticed.ngrok-free.dev';
  const API_URL = `${API_BASE_URL}/animals`;

  useEffect(() => { getLocation(); fetchAnimals(); }, []);

  async function getLocation() {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    let loc = await Location.getCurrentPositionAsync({});
    setLocation(loc.coords);
  }

  // FUNÇÃO: Tirar foto de prova para o resgate
  async function pickRescueImage() {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert("Permissão Necessária", "Autorize o uso da câmera para validar o resgate.");
      return;
    }
    let result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.5 });
    if (!result.canceled) setRescueImage(result.assets[0].uri);
  }

  const handleSupportChoice = () => {
    Alert.alert("Como apoiar? ❤️", "Escolha a forma de ajudar:", [
      { text: "Cancelar", style: "cancel" },
      { text: "10 PetCoins", onPress: async () => { if (await donateCoins(10)) Alert.alert("Sucesso!", "Doação em moedas realizada."); } },
      { text: "PIX", onPress: () => Alert.alert("Copia e Cola 📋", "Chave: petgo-pix-2026-tcc") }
    ]);
  };

  const onShare = async (animal) => {
    try {
      const lat = animal?.latitude;
      const lon = animal?.longitude;
      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
      const message = `🐾 Ajuda Necessária!\n\n${animal?.species} (${animal?.name || 'Sem nome'})\n📍 Localização: ${googleMapsUrl}\n🏥 Estado: ${animal?.health}\n\nVia PetGo 🐶`;
      await Share.share({ message });
    } catch (error) { Alert.alert("Erro", "Falha ao compartilhar"); }
  };

  async function pickImage() {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.5 });
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
    formData.append('userId', user?.id);
    if (image) {
      const filename = image.split('/').pop();
      const match = /\.(\w+)$/.exec(filename);
      formData.append('image', { uri: image, name: filename, type: match ? `image/${match[1]}` : `image` });
    }
    try {
      const res = await fetch(API_URL, { method: 'POST', body: formData, headers: { 'ngrok-skip-browser-warning': 'true' } });
      if (res.ok) {
        setSelectedLocation(null); // Limpa o marcador verde
        Alert.alert('Sucesso 🎉', 'Animal cadastrado no mapa!');
        setModalVisible(false);
        setName(''); setImage(null); fetchAnimals();
      }
    } catch (e) { Alert.alert('Erro', 'Falha na conexão'); }
  }

  async function handleRescue() {
    if (!rescuerName || !rescuerContact || !rescueImage) return Alert.alert('Atenção', 'Preencha os dados e a FOTO DE PROVA!');
    try {
      const res = await fetch(`${API_URL}/${selectedAnimal.id}/rescue`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ rescuer_name: rescuerName, rescuer_contact: rescuerContact, userId: user?.id }),
      });
      if (res.ok) {
        setRescueModalVisible(false); setRescueImage(null); setRescuerName('');
        await refreshUserData(); fetchAnimals();
        Alert.alert('Parabéns! ❤️', 'Resgate validado com foto! +50 PetCoins creditadas.');
      }
    } catch (e) { Alert.alert('Erro', 'Falha ao processar resgate'); }
  }

  const filteredAnimals = animals.filter(a => {
    if (filter === 'Todos') return a.status === 0;
    return a.status === 0 && a.species === filter;
  });

  if (!location) return null;

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{ latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        onLongPress={(e) => setSelectedLocation(e.nativeEvent.coordinate)}
      >
        <Marker coordinate={location}>
          <View style={[styles.userMarker, user?.is_premium ? styles.userMarkerPremium : null]}>
            <Ionicons name={user?.is_premium ? "star" : "person"} size={20} color="#FFF" />
          </View>
        </Marker>

        {filteredAnimals.map((animal) => (
          <Marker key={animal.id} coordinate={{ latitude: animal.latitude, longitude: animal.longitude }} onPress={() => { setSelectedAnimal(animal); setDetailVisible(true); }}>
            <View style={[styles.petMarker, { backgroundColor: animal.species === 'Gato' ? '#FF9F43' : '#FF6B6B' }]}>
              <Ionicons name="paw" size={16} color="#FFF" />
            </View>
          </Marker>
        ))}

        {selectedLocation && <Marker coordinate={selectedLocation}><Ionicons name="location" size={40} color="#2ECC71" /></Marker>}
      </MapView>

      {/* FILTROS DE ESPÉCIE */}
      <View style={styles.filterContainer}>
        {['Todos', 'Cachorro', 'Gato'].map(f => (
          <TouchableOpacity key={f} style={[styles.filterBtn, filter === f && styles.filterBtnActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity 
        style={[styles.addButton, { backgroundColor: selectedLocation ? '#2ECC71' : '#4A90E2' }]} 
        onPress={() => selectedLocation ? setModalVisible(true) : Alert.alert('Dica', 'Segure no mapa para marcar o local.')}
      >
        {/* CORREÇÃO DO ReferenceError AQUI: styles.addButtonText */}
        <Text style={styles.addButtonText}>{selectedLocation ? '✅ Confirmar Local' : '+ Adicionar Animal'}</Text>
      </TouchableOpacity>

      <Modal visible={detailVisible} animationType="slide" transparent={true}>
        <TouchableWithoutFeedback onPress={() => setDetailVisible(false)}>
          <View style={styles.drawerOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.drawerContent}>
                <View style={styles.drawerHandle} />
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={styles.drawerHeader}>
                    <Text style={styles.drawerTitle}>{selectedAnimal?.name}</Text>
                    <TouchableOpacity onPress={() => setDetailVisible(false)}><Ionicons name="close-circle" size={30} color="#DDD" /></TouchableOpacity>
                  </View>
                  <Image source={selectedAnimal?.image_url ? { uri: `${API_BASE_URL}${selectedAnimal.image_url}` } : null} style={styles.drawerImage} />
                  <View style={styles.infoRow}>
                    <View style={styles.infoBadge}><Ionicons name="paw" size={16} color="#4A90E2" /><Text style={styles.infoBadgeText}>{selectedAnimal?.species}</Text></View>
                    <View style={[styles.infoBadge, {backgroundColor: '#FFF0F0'}]}><Ionicons name="medical" size={16} color="#FF6B6B" /><Text style={[styles.infoBadgeText, {color: '#FF6B6B'}]}>{selectedAnimal?.health}</Text></View>
                  </View>
                  <Text style={styles.drawerSectionTitle}>Sobre o registro:</Text>
                  <Text style={styles.drawerDescription}>Este animal precisa de ajuda. Resgate para ganhar moedas ou apoie a causa comunitária.</Text>
                  <View style={styles.drawerActions}>
                    <TouchableOpacity style={styles.shareButton} onPress={() => onShare(selectedAnimal)}><Ionicons name="logo-whatsapp" size={20} color="#FFF" /></TouchableOpacity>
                    <TouchableOpacity style={styles.rescueButton} onPress={() => { setDetailVisible(false); setTimeout(() => setRescueModalVisible(true), 500); }}><Text style={styles.actionButtonText}>Resgatar</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.donateButtonNew} onPress={handleSupportChoice}><Ionicons name="heart" size={18} color="#FFF" /><Text style={styles.donateButtonText}>Apoiar</Text></TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalContent}>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.modalTitle}>Novo Registro 🐾</Text>
                  <TextInput placeholder="Nome" placeholderTextColor="#999" value={name} onChangeText={setName} style={styles.input} />
                  <View style={styles.row}>
                    <TouchableOpacity style={[styles.tag, species === 'Cachorro' && styles.tagSelected]} onPress={() => setSpecies('Cachorro')}><Text style={[styles.tagText, species === 'Cachorro' && styles.tagTextSelected]}>🐶 Cachorro</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.tag, species === 'Gato' && styles.tagSelected]} onPress={() => setSpecies('Gato')}><Text style={[styles.tagText, species === 'Gato' && styles.tagTextSelected]}>🐱 Gato</Text></TouchableOpacity>
                  </View>
                  <TextInput placeholder="Raça" placeholderTextColor="#999" value={breed} onChangeText={setBreed} style={styles.input} />
                  <TextInput placeholder="Saúde" placeholderTextColor="#999" value={health} onChangeText={setHealth} style={styles.input} />
                  <TouchableOpacity onPress={pickImage} style={styles.imagePickerBtn}>
                    {image ? <Image source={{ uri: image }} style={styles.previewImage} /> : <Text style={{color: '#999'}}>📸 Adicionar Foto</Text>}
                  </TouchableOpacity>
                  <View style={styles.modalActions}>
                    <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}><Text style={{color: '#999'}}>Voltar</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.saveButton} onPress={saveAnimal}><Text style={{color:'#FFF', fontWeight: 'bold'}}>Salvar no Mapa</Text></TouchableOpacity>
                  </View>
                </ScrollView>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL RESGATE (COM FOTO DE PROVA) */}
      <Modal visible={rescueModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.rescueModal}>
            <Text style={styles.modalTitle}>Validar Resgate ❤️</Text>
            <TextInput placeholder="Seu Nome" value={rescuerName} onChangeText={setRescuerName} style={styles.input} />
            <TextInput placeholder="WhatsApp" value={rescuerContact} onChangeText={setRescuerContact} style={styles.input} keyboardType="phone-pad" />
            
            <Text style={{fontWeight:'bold', marginBottom:10, color:'#333'}}>Foto de Prova (Final Feliz) 📸</Text>
            <TouchableOpacity onPress={pickRescueImage} style={styles.imagePickerMini}>
              {rescueImage ? <Image source={{ uri: rescueImage }} style={{width:'100%', height:'100%', borderRadius:10}} /> : <Ionicons name="camera" size={30} color="#CCC" />}
            </TouchableOpacity>

            <TouchableOpacity style={styles.confirmRescueBtn} onPress={handleRescue}><Text style={{color:'#FFF', fontWeight:'bold'}}>Confirmar e Ganhar Moedas</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setRescueModalVisible(false)} style={{marginTop: 15}}><Text style={{textAlign:'center', color:'#999'}}>Voltar</Text></TouchableOpacity>
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
  userMarkerPremium: { backgroundColor: '#FFD700', borderColor: '#B8860B' },
  petMarker: { padding: 6, borderRadius: 15, borderWidth: 2, borderColor: '#FFF' },
  filterContainer: { position: 'absolute', top: 60, flexDirection: 'row', alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.95)', padding: 5, borderRadius: 30, elevation: 5, zIndex: 10 },
  filterBtn: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  filterBtnActive: { backgroundColor: '#4A90E2' },
  filterText: { color: '#666', fontWeight: 'bold' },
  filterTextActive: { color: '#FFF' },
  addButton: { position: 'absolute', bottom: 40, alignSelf: 'center', paddingHorizontal: 30, paddingVertical: 15, borderRadius: 30, elevation: 5 },
  addButtonText: { color: '#fff', fontWeight: 'bold' },
  drawerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  drawerContent: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, maxHeight: '75%', elevation: 10 },
  drawerHandle: { width: 40, height: 5, backgroundColor: '#EEE', borderRadius: 10, alignSelf: 'center', marginBottom: 15 },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  drawerTitle: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  drawerImage: { width: '100%', height: 180, borderRadius: 20, marginBottom: 15, backgroundColor: '#F0F0F0' },
  infoRow: { flexDirection: 'row', marginBottom: 15 },
  infoBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F7FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginRight: 10 },
  infoBadgeText: { marginLeft: 6, fontWeight: 'bold', color: '#4A90E2', fontSize: 13 },
  drawerSectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  drawerDescription: { fontSize: 14, color: '#777', lineHeight: 20, marginBottom: 20 },
  drawerActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shareButton: { backgroundColor: '#25D366', padding: 14, borderRadius: 15, width: 55, alignItems: 'center' },
  rescueButton: { flex: 1, backgroundColor: '#4A90E2', padding: 14, borderRadius: 15, marginHorizontal: 8, alignItems: 'center' },
  donateButtonNew: { backgroundColor: '#FF6B6B', flexDirection: 'row', padding: 14, borderRadius: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 },
  donateButtonText: { color: '#FFF', fontWeight: 'bold', marginLeft: 5, fontSize: 14 },
  actionButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, maxHeight: '85%' },
  rescueModal: { backgroundColor: '#FFF', borderRadius: 25, padding: 25, elevation: 10 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#333' },
  input: { backgroundColor: '#F8F9FA', padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#EEE', color: '#333' },
  row: { flexDirection: 'row', marginBottom: 15 },
  tag: { flex: 1, backgroundColor: '#F1F3F5', padding: 14, marginRight: 10, borderRadius: 12, alignItems: 'center' },
  tagSelected: { backgroundColor: '#4A90E2' },
  tagText: { color: '#495057', fontWeight: 'bold' },
  tagTextSelected: { color: '#FFF' },
  imagePickerBtn: { height: 100, backgroundColor: '#F8F9FA', borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: '#CCC', marginBottom: 15 },
  imagePickerMini: { height: 80, backgroundColor: '#F8F9FA', borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: '#CCC', marginBottom: 20 },
  previewImage: { width: '100%', height: '100%', borderRadius: 15 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelButton: { padding: 15, flex: 1, alignItems: 'center' },
  saveButton: { backgroundColor: '#2ECC71', padding: 15, borderRadius: 12, flex: 2, alignItems: 'center' },
  confirmRescueBtn: { backgroundColor: '#2ECC71', padding: 16, borderRadius: 12, alignItems: 'center' },
});