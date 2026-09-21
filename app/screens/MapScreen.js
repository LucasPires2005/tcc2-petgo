import { mobileFetch, API_BASE_URL } from '../services/mobileApi';
import { useCheckout } from '../context/CheckoutContext';
import React, { useEffect, useState, useContext } from 'react';
import { 
  View, 
  StyleSheet, 
  Alert, 
  Modal, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Image, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView, 
  Share, 
  TouchableWithoutFeedback,
  ActivityIndicator
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { getBestAvailableLocation } from '../services/location';
import PetMap from '../components/PetMap';

// Função auxiliar para transformar data em tempo relativo (Timestamp Humano)
const getRelativeTime = (dateString) => {
  if (!dateString) return 'Data desconhecida';
  const now = new Date();
  const past = new Date(dateString);
  const diffInMs = now - past;
  const diffInMins = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMins < 1) return 'Agora mesmo';
  if (diffInMins < 60) return `Visto há ${diffInMins}min`;
  if (diffInHours < 24) return `Visto há ${diffInHours}h`;
  return `Visto há ${diffInDays} dias`;
};

export default function MapScreen() {
  const { startCheckout } = useCheckout();
  const { user, refreshUserData, animals, fetchAnimals } = useContext(AuthContext); 
  const insets = useSafeAreaInsets();
   
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false); 
  const [rescueModalVisible, setRescueModalVisible] = useState(false);
  const [isUploadingAnimal, setIsUploadingAnimal] = useState(false);
  const [isUploadingRescue, setIsUploadingRescue] = useState(false);
   
  // Modal de Doação Customizado
  const [donateModalVisible, setDonateModalVisible] = useState(false);
  const [donationAmount, setDonationAmount] = useState('10');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedAnimal, setSelectedAnimal] = useState(null);
  const [filter, setFilter] = useState('Todos'); 
   
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('');
  const [breed, setBreed] = useState('');
  const [health, setHealth] = useState('');
  const [image, setImage] = useState(null);
   
  // Estado para gerenciar o Semáforo de Urgência
  const [urgency, setUrgency] = useState('Estável');

  const [rescuerName, setRescuerName] = useState('');
  const [rescuerContact, setRescuerContact] = useState('');
  const [rescueImage, setRescueImage] = useState(null); 

  const API_URL = `${API_BASE_URL}/animals`;

  useEffect(() => { 
    getLocation(); 
    fetchAnimals(); 

  }, []);

  async function getLocation() {
    setLocationLoading(true);
    setLocationError(null);

    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Permita o acesso à localização para abrir o mapa.');
        return;
      }

      const loc = await getBestAvailableLocation();
      setLocation(loc.coords);
    } catch (err) {
      console.log('Erro de localização:', err);
      setLocationError('Não foi possível obter sua localização. Ative o GPS e tente novamente.');
    } finally {
      setLocationLoading(false);
    }
  }

  async function pickRescueImage() {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert("Permissão Necessária", "Autorize o uso da câmera.");
      return;
    }
    // FIX: Adicionado mediaTypes: ['images'] para remover o aviso de depreciação
    let result = await ImagePicker.launchCameraAsync({ 
      mediaTypes: ['images'], 
      allowsEditing: true, 
      quality: 0.7
    });
    if (!result.canceled) setRescueImage(result.assets[0]);
  }

  const handleMercadoPagoDonation = async () => {
    const numericAmount = parseFloat(donationAmount.replace(',', '.'));
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert("Valor Inválido", "Por favor, insira um valor válido para doação.");
      return;
    }

    setIsProcessingPayment(true);
    try {
      await startCheckout({
          userId: user?.id,
          title: `Apoio PetGo - ${selectedAnimal?.name ? 'Animal: ' + selectedAnimal.name : 'Causa Animal'}`,
          price: numericAmount,
          quantity: 1,
          type: 'donation'
      });
      setDonateModalVisible(false);
    } catch (error) {
      Alert.alert("Erro", error.message || "Falha de conexão com a plataforma de pagamento.");
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const onShare = async (animal) => {
    try {
      const lat = animal?.latitude;
      const lon = animal?.longitude;
      const googleMapsUrl = `http://maps.google.com/?q=${lat},${lon}`;
      const message = `🐾 Ajuda Necessária!\n\n${animal?.species}\n📍 Localização: ${googleMapsUrl}\n🏥 Estado: ${animal?.health}\n\nVia PetGo 🐶`;
      await Share.share({ message });
    } catch (error) { Alert.alert("Erro", "Falha ao compartilhar"); }
  };

  async function pickImage() {
    // FIX: Substituído o MediaTypeOptions pelo novo padrão ['images']
    let result = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ['images'], 
      allowsEditing: true, 
      quality: 0.7
    });
    if (!result.canceled) setImage(result.assets[0]);
  }

  async function saveAnimal() {
    if (!selectedLocation || !species || !health) return Alert.alert('Atenção', 'Preencha os campos obrigatórios');
    
    if (!image) 
      return Alert.alert('Atenção', 'Selecione uma foto do animal');

    setIsUploadingAnimal(true);

    const formData = new FormData();
    formData.append('name', name || "Sem nome");
    formData.append('species', species);
    formData.append('breed', breed);
    formData.append('health', health);
    formData.append('latitude', selectedLocation.latitude.toString());
    formData.append('longitude', selectedLocation.longitude.toString());
    formData.append('userId', user?.id?.toString());
     
    // ADIÇÃO: Enviando a urgência para o banco
    formData.append('urgency', urgency);

    if (image) {
      try {
        const response = await fetch(image.uri);
        let blob = await response.blob();
        
        //  NOVO: Se o blob estiver como text/plain, converter para image/jpeg
        if (blob.type === 'text/plain' || blob.type === '') {
          console.log('⚠️ Blob type incorreto. Corrigindo de:', blob.type, 'para: image/jpeg');
          blob = blob.slice(0, blob.size, 'image/jpeg');
        }
        
        console.log('✅ Blob final:', { size: blob.size, type: blob.type });
        formData.append('image', blob, image.fileName || `animal-${Date.now()}.jpg`);
      } catch (error) {
        console.error('Erro ao converter imagem:', error);
        setIsUploadingAnimal(false);
        return Alert.alert('Erro', 'Falha ao processar a imagem. Tente novamente.');
      }
    }
    
    try {
      const res = await mobileFetch(API_URL, { method: 'POST', body: formData, headers: { 'ngrok-skip-browser-warning': 'true' } });
      if (res.ok) {
        setSelectedLocation(null);
        Alert.alert('Sucesso 🎉', 'Animal cadastrado!');
        setModalVisible(false);
        setName(''); setImage(null); setUrgency('Estável'); fetchAnimals();
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('Erro na resposta:', errorData);
        Alert.alert(
          res.status === 422 ? 'Imagem não permitida' : 'Erro',
          errorData.error || `Falha ao cadastrar: ${res.status}`
        );
      }
    } catch (e) { 
      console.error('Erro ao salvar animal:', e);
      Alert.alert('Erro', 'Falha na conexão'); 
    } finally {
      setIsUploadingAnimal(false);
    }
  }

  async function handleRescue() {
    if (!rescuerName || !rescuerContact || !rescueImage) return Alert.alert('Atenção', 'Preencha os dados e a FOTO DE PROVA!');
    
    setIsUploadingRescue(true);
     
    const formData = new FormData();
    formData.append('rescuer_name', rescuerName);
    formData.append('rescuer_contact', rescuerContact);
    formData.append('userId', user?.id?.toString());

    // NOVO: Anexando a foto do resgate com fix do MIME type
    try {
      const response = await fetch(rescueImage.uri);
      let blob = await response.blob();
      
      //  NOVO: Se o blob estiver como text/plain, converter para image/jpeg
      if (blob.type === 'text/plain' || blob.type === '') {
        console.log('⚠️ Blob type incorreto. Corrigindo de:', blob.type, 'para: image/jpeg');
        blob = blob.slice(0, blob.size, 'image/jpeg');
      }
      
      console.log('✅ Blob final:', { size: blob.size, type: blob.type });
      formData.append('rescue_image', blob, rescueImage.fileName || `resgate-${Date.now()}.jpg`);
    } catch (error) {
      console.error('Erro ao converter imagem de resgate:', error);
      setIsUploadingRescue(false);
      return Alert.alert('Erro', 'Falha ao processar a foto. Tente novamente.');
    }

    try {
      const res = await mobileFetch(`${API_URL}/${selectedAnimal.id}/rescue`, {
        method: 'PATCH',
        body: formData,
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });

      if (res.ok) {
        const data = await res.json();
        setRescueModalVisible(false); 
        setRescueImage(null); 
        setRescuerName('');
        if (refreshUserData) {
          await refreshUserData().catch((e) => console.log('Erro de sincronização de dados:', e));
        }
        fetchAnimals();
         
        const earnedText = data.earnedCoins 
          ? `+${data.earnedCoins} PetCoins creditadas!` 
          : '+50 PetCoins creditadas.';
          
        Alert.alert('Parabéns! ❤️', `Resgate validado com foto!\n\n${earnedText}`);
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error('Erro na resposta:', errorData);
        Alert.alert(
          res.status === 422 ? 'Imagem não permitida' : 'Erro',
          errorData.error || `Falha ao processar resgate: ${res.status}`
        );
      }
    } catch (e) { 
      console.error('Erro ao fazer resgate:', e);
      Alert.alert('Erro', 'Falha ao processar resgate'); 
    } finally {
      setIsUploadingRescue(false);
    }
  }

  const filteredAnimals = animals.filter(a => {
    if (filter === 'Todos') return a.status === 0;
    return a.status === 0 && a.species === filter;
  });

  if (locationLoading) {
    return <View style={styles.locationState}><ActivityIndicator size="large" color="#4A90E2" /></View>;
  }

  if (locationError || !location) {
    return (
      <View style={styles.locationState}>
        <Text style={styles.locationErrorText}>{locationError}</Text>
        <TouchableOpacity style={styles.locationRetryButton} onPress={getLocation}>
          <Text style={styles.locationRetryText}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const validMapAnimals = filteredAnimals
    .map(animal => ({
      ...animal,
      latitude: Number(animal.latitude),
      longitude: Number(animal.longitude),
      markerColor:
        animal.urgency === 'Crítico' ? '#E74C3C' :
        animal.urgency === 'Alerta' ? '#F1C40F' :
        animal.urgency === 'Estável' ? '#2ECC71' :
        animal.species === 'Gato' ? '#FF9F43' : '#FF6B6B'
    }))
    .filter(animal => Number.isFinite(animal.latitude) && Number.isFinite(animal.longitude));

  return (
    <View style={styles.container}>
      <PetMap
        location={location}
        animals={validMapAnimals}
        selectedLocation={selectedLocation}
        isPremium={Boolean(user?.is_premium)}
        onSelectLocation={setSelectedLocation}
        onSelectAnimal={(animal) => {
          setSelectedAnimal(animal);
          setDetailVisible(true);
        }}
      />

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
        <Text style={styles.addButtonText}>{selectedLocation ? '✅ Confirmar Local' : '+ Adicionar Animal'}</Text>
      </TouchableOpacity>

      {/* Drawer de Detalhes do Animal */}
      <Modal visible={detailVisible} animationType="slide" transparent={true}>
        <TouchableWithoutFeedback onPress={() => setDetailVisible(false)}>
          <View style={styles.drawerOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.drawerContent}>
                <View style={styles.drawerHandle} />
                <ScrollView
                  contentContainerStyle={{
                    paddingBottom: Math.max(insets.bottom, 16) + 20
                  }}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  <View style={styles.drawerHeader}>
                    <Text style={styles.drawerTitle}>{selectedAnimal?.name}</Text>
                    <TouchableOpacity onPress={() => setDetailVisible(false)}><Ionicons name="close-circle" size={30} color="#DDD" /></TouchableOpacity>
                  </View>
                  
                  {/* CORREÇÃO APLICADA AQUI: Tratamento de URL Supabase vs Local */}
                  <Image 
                    source={
                      selectedAnimal?.image_url 
                        ? { 
                            uri: selectedAnimal.image_url.startsWith('http') 
                              ? selectedAnimal.image_url 
                              : `${API_BASE_URL}${selectedAnimal.image_url}` 
                          } 
                        : null
                    } 
                    style={styles.drawerImage} 
                  />
                   
                  <View style={styles.infoRow}>
                    <View style={styles.infoBadge}><Ionicons name="paw" size={16} color="#4A90E2" /><Text style={styles.infoBadgeText}>{selectedAnimal?.species}</Text></View>
                    <View style={[styles.infoBadge, {backgroundColor: '#FFF0F0'}]}><Ionicons name="medical" size={16} color="#FF6B6B" /><Text style={[styles.infoBadgeText, {color: '#FF6B6B'}]}>{selectedAnimal?.health}</Text></View>
                     
                    {/* ADIÇÃO: Badge de Tempo Relativo (Visto há X min) */}
                    <View style={[styles.infoBadge, {backgroundColor: '#F5F5F5'}]}>
                      <Ionicons name="time-outline" size={16} color="#666" />
                      <Text style={[styles.infoBadgeText, {color: '#666'}]}>
                        {getRelativeTime(selectedAnimal?.created_at)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.drawerSectionTitle}>Sobre o registro:</Text>
                  <Text style={styles.drawerDescription}>Este animal precisa de ajuda. Faça uma doação para apoiar o resgate e tratamento.</Text>
                  <View style={styles.drawerActions}>
                    <TouchableOpacity style={styles.shareButton} onPress={() => onShare(selectedAnimal)}><Ionicons name="logo-whatsapp" size={20} color="#FFF" /></TouchableOpacity>
                    <TouchableOpacity style={styles.rescueButton} onPress={() => { setDetailVisible(false); setTimeout(() => setRescueModalVisible(true), 500); }}><Text style={styles.actionButtonText}>Resgatar</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.donateButtonNew} onPress={() => { setDetailVisible(false); setTimeout(() => setDonateModalVisible(true), 400); }}><Ionicons name="heart" size={18} color="#FFF" /><Text style={styles.donateButtonText}>Apoiar</Text></TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Modal Customizado de Doação Mercado Pago */}
      <Modal visible={donateModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlayCenter}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.donateCard}>
            <View style={styles.donateHeader}>
              <View style={styles.heartCircle}>
                <Ionicons name="heart" size={32} color="#FF6B6B" />
              </View>
              <Text style={styles.donateTitle}>Fazer uma Doação ❤️</Text>
              <Text style={styles.donateSubtitle}>Sua contribuição ajuda nos cuidados e tratamento de {selectedAnimal?.name || 'animais resgatados'}.</Text>
            </View>

            <Text style={styles.presetLabel}>Escolha ou digite um valor:</Text>
             
            <View style={styles.presetContainer}>
              {['5', '10', '25', '50'].map(val => (
                <TouchableOpacity 
                  key={val} 
                  style={[styles.presetChip, donationAmount === val && styles.presetChipSelected]}
                  onPress={() => setDonationAmount(val)}
                >
                  <Text style={[styles.presetText, donationAmount === val && styles.presetTextSelected]}>R$ {val}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.customAmountContainer}>
              <Text style={styles.currencyPrefix}>R$</Text>
              <TextInput 
                style={styles.customAmountInput} 
                keyboardType="numeric" 
                value={donationAmount} 
                onChangeText={setDonationAmount}
                placeholder="0.00"
                placeholderTextColor="#A0AEC0"
              />
            </View>

            <TouchableOpacity 
              style={styles.mpButton} 
              onPress={handleMercadoPagoDonation}
              disabled={isProcessingPayment}
            >
              {isProcessingPayment ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name="card-outline" size={20} color="#FFF" style={{marginRight: 8}} />
                  <Text style={styles.mpButtonText}>Pagar com Mercado Pago</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setDonateModalVisible(false)} style={styles.closeDonateBtn}>
              <Text style={styles.closeDonateText}>Cancelar</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Modal Novo Registro */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboardContainer}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
            <View style={styles.modalContent}>
                <ScrollView
                  contentContainerStyle={[
                    styles.animalFormContent,
                    { paddingBottom: Math.max(insets.bottom, 16) + 32 }
                  ]}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.modalTitle}>Novo Registro 🐾</Text>
                  <TextInput placeholder="Nome" placeholderTextColor="#999" value={name} onChangeText={setName} style={styles.input} />
                  <View style={styles.row}>
                    <TouchableOpacity style={[styles.tag, species === 'Cachorro' && styles.tagSelected]} onPress={() => setSpecies('Cachorro')}><Text style={[styles.tagText, species === 'Cachorro' && styles.tagTextSelected]}>🐶 Cachorro</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.tag, species === 'Gato' && styles.tagSelected]} onPress={() => setSpecies('Gato')}><Text style={[styles.tagText, species === 'Gato' && styles.tagTextSelected]}>🐱 Gato</Text></TouchableOpacity>
                  </View>

                  {/* ADIÇÃO: Seleção de Urgência no Cadastro */}
                  <Text style={{fontWeight: 'bold', marginBottom: 10, color: '#333'}}>Nível de Urgência:</Text>
                  <View style={styles.row}>
                    {['Estável', 'Alerta', 'Crítico'].map(level => (
                      <TouchableOpacity 
                        key={level} 
                        style={[styles.tag, urgency === level && {backgroundColor: level === 'Crítico' ? '#E74C3C' : level === 'Alerta' ? '#F1C40F' : '#2ECC71'}]} 
                        onPress={() => setUrgency(level)}
                      >
                        <Text style={[styles.tagText, urgency === level && {color: '#FFF'}]}>{level}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TextInput placeholder="Raça" placeholderTextColor="#999" value={breed} onChangeText={setBreed} style={styles.input} />
                  <TextInput placeholder="Saúde" placeholderTextColor="#999" value={health} onChangeText={setHealth} style={styles.input} />
                  <TouchableOpacity onPress={pickImage} style={styles.imagePickerBtn}>
                    {image ? <Image source={{ uri: image.uri }} style={styles.previewImage} /> : <Text style={{color: '#999'}}>📸 Adicionar Foto</Text>}
                  </TouchableOpacity>
                  <View style={styles.modalActions}>
                    <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}><Text style={{color: '#999'}}>Voltar</Text></TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.saveButton, isUploadingAnimal && {opacity: 0.6}]} 
                      onPress={saveAnimal}
                      disabled={isUploadingAnimal}
                    >
                      {isUploadingAnimal ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <Text style={{color:'#FFF', fontWeight: 'bold'}}>Salvar no Mapa</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Resgate */}
      <Modal visible={rescueModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.rescueModal}>
            <Text style={styles.modalTitle}>Validar Resgate ❤️</Text>
            <TextInput placeholder="Seu Nome" value={rescuerName} onChangeText={setRescuerName} style={styles.input} />
            <TextInput placeholder="WhatsApp" value={rescuerContact} onChangeText={setRescuerContact} style={styles.input} keyboardType="phone-pad" />
             
            <Text style={{fontWeight:'bold', marginBottom:10, color:'#333'}}>Foto de Prova (Final Feliz) 📸</Text>
            <TouchableOpacity onPress={pickRescueImage} style={styles.imagePickerMini}>
              {rescueImage ? <Image source={{ uri: rescueImage.uri }} style={{width:'100%', height:'100%', borderRadius:10}} /> : <Ionicons name="camera" size={30} color="#CCC" />}
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.confirmRescueBtn, isUploadingRescue && {opacity: 0.6}]} 
              onPress={handleRescue}
              disabled={isUploadingRescue}
            >
              {isUploadingRescue ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={{color:'#FFF', fontWeight:'bold'}}>Confirmar e Ganhar Moedas</Text>
              )}
            </TouchableOpacity>
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
  locationState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#FFF' },
  locationErrorText: { color: '#666', fontSize: 16, textAlign: 'center', marginBottom: 18 },
  locationRetryButton: { backgroundColor: '#4A90E2', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  locationRetryText: { color: '#FFF', fontWeight: 'bold' },
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
  infoRow: { flexDirection: 'row', marginBottom: 15, flexWrap: 'wrap' },
  infoBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F7FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginRight: 8, marginBottom: 5 },
  infoBadgeText: { marginLeft: 6, fontWeight: 'bold', color: '#4A90E2', fontSize: 11 },
  drawerSectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  drawerDescription: { fontSize: 14, color: '#777', lineHeight: 20, marginBottom: 20 },
  drawerActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shareButton: { backgroundColor: '#25D366', padding: 14, borderRadius: 15, width: 55, alignItems: 'center' },
  rescueButton: { flex: 1, backgroundColor: '#4A90E2', padding: 14, borderRadius: 15, marginHorizontal: 8, alignItems: 'center' },
  donateButtonNew: { backgroundColor: '#FF6B6B', flexDirection: 'row', padding: 14, borderRadius: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 },
  donateButtonText: { color: '#FFF', fontWeight: 'bold', marginLeft: 5, fontSize: 14 },
  actionButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalKeyboardContainer: { flex: 1 },
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, maxHeight: '90%', overflow: 'hidden' },
  animalFormContent: { paddingHorizontal: 25, paddingTop: 25 },
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

  // Estilos do Modal de Doação Customizado
  donateCard: { backgroundColor: '#FFF', borderRadius: 28, padding: 24, elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  donateHeader: { alignItems: 'center', marginBottom: 20 },
  heartCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFF0F0', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  donateTitle: { fontSize: 20, fontWeight: 'bold', color: '#2D3748', textAlign: 'center' },
  donateSubtitle: { fontSize: 13, color: '#718096', textAlign: 'center', marginTop: 6, lineHeight: 18 },
  presetLabel: { fontSize: 13, fontWeight: '600', color: '#4A5568', marginBottom: 10 },
  presetContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  presetChip: { flex: 1, backgroundColor: '#F7FAFC', borderWidth: 1.5, borderColor: '#E2E8F0', paddingVertical: 10, borderRadius: 12, marginHorizontal: 3, alignItems: 'center' },
  presetChipSelected: { backgroundColor: '#EBF8FF', borderColor: '#3182CE' },
  presetText: { fontSize: 14, fontWeight: 'bold', color: '#4A5568' },
  presetTextSelected: { color: '#3182CE' },
  customAmountContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7FAFC', borderWidth: 1.5, borderColor: '#CBD5E0', borderRadius: 14, paddingHorizontal: 16, marginBottom: 20, height: 54 },
  currencyPrefix: { fontSize: 18, fontWeight: 'bold', color: '#4A5568', marginRight: 8 },
  customAmountInput: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#2D3748' },
  mpButton: { backgroundColor: '#009EE3', flexDirection: 'row', paddingVertical: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  mpButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  closeDonateBtn: { marginTop: 14, paddingVertical: 10, alignItems: 'center' },
  closeDonateText: { color: '#A0AEC0', fontWeight: '600', fontSize: 14 }
});
