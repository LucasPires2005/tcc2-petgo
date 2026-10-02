import { colors } from '../theme/colors';
import { mobileFetch, API_BASE_URL, captureSessionGuard } from '../services/mobileApi';
import { useCheckout } from '../context/CheckoutContext';
import React, { useEffect, useState, useContext, useRef } from 'react';
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
  ActivityIndicator,
  Keyboard
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { getBestAvailableLocation } from '../services/location';
import PetMap from '../components/PetMap';
import PhotoSourceOptions from '../components/PhotoSourceOptions';
import { selectAnimalPhoto } from '../services/photoSelection';
import AnimalDeletionForm from '../components/AnimalDeletionForm';
import FormField, { FormNotice, FieldLabel } from '../components/FormField';
import { isAnimalAuthor } from '../services/animalDeletion';
import { normalizeCoordinates } from '../services/proximity';
import EligibilityForm from '../components/EligibilityForm';
import { getEligibility, formatCpf } from '../services/eligibilityApi';

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

export default function MapScreen({ navigation }) {
  const { startCheckout } = useCheckout();
  const { user, refreshUserData, animals, fetchAnimals } = useContext(AuthContext); 
  const insets = useSafeAreaInsets();
   
  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false); 
  const [deleteMode, setDeleteMode] = useState(false);
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
  const [rescuerEmail, setRescuerEmail] = useState('');
  const [rescuerCpf, setRescuerCpf] = useState('');
  const [acceptedResponsibility, setAcceptedResponsibility] = useState(false);
  const [eligibilityNeeded, setEligibilityNeeded] = useState(false);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [rescueImage, setRescueImage] = useState(null); 
  const [photoSourceTarget, setPhotoSourceTarget] = useState(null);
  const photoBusy = useRef(false);
  const photoRequest = useRef(0);
  const rescueRequest = useRef(0);
  const rescueLookupBusy = useRef(false);
  const rescueSubmitBusy = useRef(false);
  const rescueAlive = useRef(true);
  const rescueFormGuard = useRef(null);

  const API_URL = `${API_BASE_URL}/animals`;

  useEffect(() => { 
    getLocation(); 
    fetchAnimals(); 

  }, []);
  useEffect(() => () => { photoRequest.current++; }, []);
  useEffect(() => {
    rescueAlive.current = true;
    return () => { rescueAlive.current = false; rescueRequest.current++; };
  }, []);
  useEffect(() => {
    rescueRequest.current++;
    rescueLookupBusy.current = false;
    rescueSubmitBusy.current = false;
    rescueFormGuard.current = null;
    photoRequest.current++;
    setPhotoSourceTarget(null);
    setIsCheckingEligibility(false);
    setIsUploadingRescue(false);
    setRescueModalVisible(false);
    setEligibilityNeeded(false);
    clearRescueDraft();
  }, [user?.id]);
  useEffect(() => navigation.addListener?.('blur', () => {
    // Não reabre um resgate atrasado nem deixa documento no mapa fora de foco.
    rescueRequest.current++;
    rescueLookupBusy.current = false;
    rescueSubmitBusy.current = false;
    rescueFormGuard.current = null;
    photoRequest.current++;
    setPhotoSourceTarget(null);
    setIsCheckingEligibility(false); setIsUploadingRescue(false);
    setRescueModalVisible(false); setEligibilityNeeded(false);
    clearRescueDraft();
  }), [navigation]);

  function clearRescueDraft() {
    setRescuerName(''); setRescuerContact(''); setRescuerEmail(''); setRescuerCpf('');
    setAcceptedResponsibility(false); setRescueImage(null);
  }

  function closeAnimalDetails() {
    if (deleteMode) return;
    rescueRequest.current++;
    rescueLookupBusy.current = false;
    setIsCheckingEligibility(false);
    setDetailVisible(false);
  }

  async function requestRescue() {
    if (rescueLookupBusy.current || rescueSubmitBusy.current || !selectedAnimal?.id || !user?.id) return;
    const animal = selectedAnimal;
    const request = ++rescueRequest.current;
    const ensureSession = captureSessionGuard();
    rescueLookupBusy.current = true; setIsCheckingEligibility(true);
    try {
      const eligibility = await getEligibility();
      ensureSession();
      if (!rescueAlive.current || request !== rescueRequest.current) return;
      clearRescueDraft();
      setRescuerName(user.name || ''); setRescuerEmail(user.email || '');
      setEligibilityNeeded(!eligibility.declaredAdult);
      setDetailVisible(false);
      // Fecha o detalhe antes de abrir outro Modal nativo, também no iOS.
      setTimeout(() => {
        try { ensureSession(); } catch { return; }
        if (!rescueAlive.current || request !== rescueRequest.current) return;
        rescueFormGuard.current = ensureSession;
        setSelectedAnimal(animal); setRescueModalVisible(true);
      }, 400);
    } catch (error) {
      if (rescueAlive.current && request === rescueRequest.current) {
        Alert.alert('Não foi possível continuar', error.message || 'Confira sua conexão e tente novamente.');
      }
    } finally {
      if (rescueAlive.current && request === rescueRequest.current) {
        rescueLookupBusy.current = false; setIsCheckingEligibility(false);
      }
    }
  }

  function closeAnimalForm() {
    if (isUploadingAnimal) return;
    photoRequest.current++;
    setPhotoSourceTarget(null);
    setModalVisible(false);
    setSelectedLocation(null);
  }

  function closeRescueForm() {
    if (isUploadingRescue) return;
    rescueRequest.current++;
    rescueFormGuard.current = null;
    photoRequest.current++;
    setPhotoSourceTarget(null);
    setRescueModalVisible(false);
    setEligibilityNeeded(false);
    clearRescueDraft();
  }

  function completeEligibility(cpf) {
    if (!rescueFormGuard.current || !rescueAlive.current) return;
    try { rescueFormGuard.current(); } catch { closeRescueForm(); return; }
    setRescuerCpf(formatCpf(cpf));
    setAcceptedResponsibility(false);
    setEligibilityNeeded(false);
  }

  function openPhotoOptions(target) {
    if (photoBusy.current || isUploadingAnimal || isUploadingRescue) return;
    Keyboard.dismiss();
    setPhotoSourceTarget(target);
  }

  async function choosePhoto(source, target) {
    if (photoBusy.current || isUploadingAnimal || isUploadingRescue) return;
    photoBusy.current = true;
    const request = ++photoRequest.current;
    setPhotoSourceTarget(null);
    try {
      const asset = await selectAnimalPhoto(ImagePicker, source);
      if (asset && request === photoRequest.current) {
        if (target === 'rescue') setRescueImage(asset);
        else setImage(asset);
      }
    } catch (error) {
      if (request === photoRequest.current) Alert.alert('Não foi possível selecionar a foto',
        error.message || 'Verifique as permissões do aparelho e tente novamente.');
    } finally {
      photoBusy.current = false;
    }
  }

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
    openPhotoOptions('rescue');
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
          title: 'Apoio à manutenção da plataforma PetGo',
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
    openPhotoOptions('animal');
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
    if (rescueSubmitBusy.current || eligibilityNeeded) return;
    if (!rescuerName.trim() || !rescuerContact.trim() || !rescuerEmail.trim() || !rescuerCpf || !rescueImage) {
      return Alert.alert('Atenção', 'Preencha nome, WhatsApp, e-mail, CPF e a foto de prova.');
    }
    if (!/^(?:\d{10,11}|55\d{10,11})$/.test(rescuerContact.replace(/\D/g, ''))) {
      return Alert.alert('Confira o WhatsApp', 'Informe um telefone com DDD.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rescuerEmail.trim())) {
      return Alert.alert('Confira o e-mail', 'Informe um endereço de e-mail válido.');
    }
    if (!/^\d{11}$/.test(rescuerCpf.replace(/[.\-]/g, ''))) return Alert.alert('Confira o CPF', 'Informe os 11 dígitos do CPF declarado.');
    if (!acceptedResponsibility) return Alert.alert('Declaração obrigatória', 'Confirme sua responsabilidade pelo resgate antes de continuar.');
    const ensureSession = rescueFormGuard.current;
    if (!ensureSession) return Alert.alert('Abra o resgate novamente', 'Confira sua sessão antes de continuar.');
    const request = ++rescueRequest.current;
    const animalId = selectedAnimal?.id;
    rescueSubmitBusy.current = true; setIsUploadingRescue(true);
    try {
      ensureSession();
      const formData = new FormData();
      formData.append('rescuer_name', rescuerName.trim());
      formData.append('rescuer_contact', rescuerContact.trim());
      formData.append('rescuer_email', rescuerEmail.trim().toLowerCase());
      formData.append('rescuer_cpf', rescuerCpf);
      formData.append('acceptedResponsibility', 'true');
      formData.append('userId', user?.id?.toString());

      // Preserva a conversão de foto já validada no Android/iOS.
      const response = await fetch(rescueImage.uri);
      let blob = await response.blob();
      if (blob.type === 'text/plain' || blob.type === '') {
        blob = blob.slice(0, blob.size, 'image/jpeg');
      }
      formData.append('rescue_image', blob, rescueImage.fileName || `resgate-${Date.now()}.jpg`);
      ensureSession();
      if (!rescueAlive.current || request !== rescueRequest.current) return;
      const res = await mobileFetch(`${API_URL}/${animalId}/rescue`, {
        method: 'PATCH',
        body: formData,
        headers: { 'ngrok-skip-browser-warning': 'true' },
      });

      if (res.ok) {
        const data = await res.json();
        ensureSession();
        if (!rescueAlive.current || request !== rescueRequest.current) return;
        setRescueModalVisible(false); rescueFormGuard.current = null;
        clearRescueDraft();
        if (refreshUserData) {
          await refreshUserData().catch(() => {});
        }
        ensureSession();
        if (!rescueAlive.current || request !== rescueRequest.current) return;
        fetchAnimals();
         
        const earnedText = data.earnedCoins 
          ? `+${data.earnedCoins} PetCoins creditadas!` 
          : '+50 PetCoins creditadas.';
          
        Alert.alert('Parabéns! ❤️', `Resgate validado com foto!\n\n${earnedText}`);
      } else {
        const errorData = await res.json().catch(() => ({}));
        ensureSession();
        if (!rescueAlive.current || request !== rescueRequest.current) return;
        if (errorData.code === 'ELIGIBILITY_REQUIRED') {
          setRescuerCpf(''); setAcceptedResponsibility(false); setEligibilityNeeded(true);
          return;
        }
        if (errorData.code === 'CPF_DECLARATION_MISMATCH') setRescuerCpf('');
        Alert.alert(
          res.status === 422 ? 'Imagem não permitida' : 'Erro',
          errorData.error || `Falha ao processar resgate: ${res.status}`
        );
      }
    } catch (e) {
      if (rescueAlive.current && request === rescueRequest.current) {
        try { ensureSession(); } catch {
          clearRescueDraft(); setRescueModalVisible(false); rescueFormGuard.current = null;
        }
        Alert.alert('Erro', 'Não foi possível concluir. Confira sua sessão, a foto e a conexão e tente novamente.');
      }
    } finally {
      if (rescueAlive.current && request === rescueRequest.current) {
        rescueSubmitBusy.current = false; setIsUploadingRescue(false);
      }
    }
  }

  const filteredAnimals = animals.filter(a => {
    if (filter === 'Todos') return a.status === 0;
    return a.status === 0 && a.species === filter;
  });

  if (locationLoading) {
    return <View style={styles.locationState}><ActivityIndicator size="large" color={colors.primary} /></View>;
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
          rescueRequest.current++;
          rescueLookupBusy.current = false; setIsCheckingEligibility(false);
          setDeleteMode(false);
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
        style={[styles.addButton, { backgroundColor: selectedLocation ? colors.success : colors.primary }]}
        onPress={() => selectedLocation ? setModalVisible(true) : Alert.alert('Dica', 'Segure no mapa para marcar o local.')}
      >
        <Text style={styles.addButtonText}>{selectedLocation ? '✅ Confirmar Local' : '+ Adicionar Animal'}</Text>
      </TouchableOpacity>
      {selectedLocation && !modalVisible && <TouchableOpacity
        accessibilityRole="button" accessibilityLabel="Cancelar seleção do local"
        style={styles.clearLocationButton} onPress={closeAnimalForm}>
        <Ionicons name="close" size={20} color={colors.text} />
        <Text style={{ color: colors.danger, fontWeight: 'bold' }}>Cancelar seleção</Text>
      </TouchableOpacity>}

      {/* Drawer de Detalhes do Animal */}
      <Modal visible={detailVisible} animationType="slide" transparent={true} onRequestClose={closeAnimalDetails}>
        <TouchableWithoutFeedback onPress={closeAnimalDetails}>
          <KeyboardAvoidingView style={styles.drawerOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <TouchableWithoutFeedback>
              <View style={styles.drawerContent}>
                <View style={styles.drawerHandle} />
                {deleteMode ? <AnimalDeletionForm animal={selectedAnimal} onCancel={() => setDeleteMode(false)}
                  onDeleted={() => { setDeleteMode(false); setDetailVisible(false); setSelectedAnimal(null); }} /> : <ScrollView
                  contentContainerStyle={{
                    paddingBottom: Math.max(insets.bottom, 16) + 20
                  }}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  <View style={styles.drawerHeader}>
                    <Text style={styles.drawerTitle}>{selectedAnimal?.name}</Text>
                    <TouchableOpacity onPress={closeAnimalDetails}><Ionicons name="close-circle" size={30} color="#DDD" /></TouchableOpacity>
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
                    <View style={styles.infoBadge}><Ionicons name="paw" size={16} color={colors.primary} /><Text style={styles.infoBadgeText}>{selectedAnimal?.species}</Text></View>
                    <View style={[styles.infoBadge, {backgroundColor: '#FFF0F0'}]}><Ionicons name="medical" size={16} color="#FF6B6B" /><Text style={[styles.infoBadgeText, {color: '#FF6B6B'}]}>{selectedAnimal?.health}</Text></View>
                     
                    {/* ADIÇÃO: Badge de Tempo Relativo (Visto há X min) */}
                    <View style={[styles.infoBadge, {backgroundColor: colors.surface}]}>
                      <Ionicons name="time-outline" size={16} color={colors.text} />
                      <Text style={[styles.infoBadgeText, {color: colors.text}]}>
                        {getRelativeTime(selectedAnimal?.created_at)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.drawerSectionTitle}>Apoie a causa PetGo</Text>
                  <Text style={styles.drawerDescription}>Sua contribuição apoia a manutenção da plataforma PetGo, que conecta pessoas e mapeia animais em situação de vulnerabilidade. Os valores não são destinados diretamente a este animal.</Text>
                  {normalizeCoordinates(selectedAnimal) && <TouchableOpacity accessibilityRole="link"
                    style={{ minHeight: 44, justifyContent: 'center', marginBottom: 12 }}
                    onPress={() => {
                      closeAnimalDetails();
                      navigation.navigate('Próximos', { supportRegion: {
                        ...normalizeCoordinates(selectedAnimal), name: selectedAnimal.name
                      } });
                    }}>
                    <Text style={{ color: colors.action, fontWeight: '600' }}>Ver rede de apoio nesta região</Text>
                  </TouchableOpacity>}
                  <View style={styles.drawerActions}>
                    <TouchableOpacity style={styles.shareButton} disabled={isCheckingEligibility} onPress={() => onShare(selectedAnimal)}><Ionicons name="logo-whatsapp" size={20} color={colors.background} /></TouchableOpacity>
                    <TouchableOpacity style={[styles.rescueButton, isCheckingEligibility && { opacity: 0.6 }]} disabled={isCheckingEligibility}
                      onPress={requestRescue}>{isCheckingEligibility ? <ActivityIndicator color={colors.background} /> : <Text style={styles.actionButtonText}>Resgatar</Text>}</TouchableOpacity>
                    <TouchableOpacity style={styles.donateButtonNew} onPress={() => { closeAnimalDetails(); setTimeout(() => setDonateModalVisible(true), 400); }}><Ionicons name="heart" size={18} color={colors.action} /><Text style={styles.donateButtonText}>Apoiar</Text></TouchableOpacity>
                  </View>
                  {isAnimalAuthor(selectedAnimal, user?.id) && <TouchableOpacity accessibilityRole="button" disabled={isCheckingEligibility}
                    style={{ minHeight: 48, padding: 14, marginTop: 18, borderRadius: 12, borderWidth: 1, borderColor: colors.danger, alignItems: 'center' }}
                    onPress={() => setDeleteMode(true)}><Text style={{ color: colors.danger, fontWeight: '600' }}>Excluir meu registro</Text></TouchableOpacity>}
                </ScrollView>}
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Modal Customizado de Doação Mercado Pago */}
      <Modal visible={donateModalVisible} animationType="fade" transparent={true} onRequestClose={() => setDonateModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlayCenter}>
          <View style={[styles.donateCard, { maxHeight: '95%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}>
            <View style={styles.donateHeader}>
              <View style={styles.heartCircle}>
                <Ionicons name="heart" size={32} color={colors.action} />
              </View>
              <Text style={styles.donateTitle}>Apoiar o PetGo ❤️</Text>
              <Text style={styles.donateSubtitle}>O apoio é destinado à manutenção da plataforma e de sua infraestrutura, sem repasse direto ao animal deste registro.</Text>
              <Text style={styles.donateSubtitle}>Demonstração acadêmica: pagamento em ambiente de testes, sem cobrança real.</Text>
            </View>

            <FormNotice allRequired />
            <FieldLabel label="Valor do apoio (R$)" required help="Escolha um valor sugerido ou digite um valor maior que zero." />
             
            <View style={styles.presetContainer}>
              {['5', '10', '25', '50'].map(val => (
                <TouchableOpacity 
                  key={val} 
                  accessibilityRole="radio" accessibilityLabel={`Apoiar com ${val} reais`} accessibilityState={{ checked: donationAmount === val }}
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
                accessibilityLabel="Valor do apoio em reais, obrigatório"
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
                <ActivityIndicator color={colors.background} />
              ) : (
                <>
                  <Ionicons name="card-outline" size={20} color={colors.background} style={{marginRight: 8}} />
                  <Text style={styles.mpButtonText}>Pagar com Mercado Pago</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setDonateModalVisible(false)} style={styles.closeDonateBtn}>
              <Text style={styles.closeDonateText}>Cancelar</Text>
            </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Novo Registro */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={closeAnimalForm}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboardContainer}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={closeAnimalForm}>
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
                  <FormNotice />
                  <FormField label="Nome ou característica" help="Não sabe o nome? Use uma característica, como Caramelo perto da praça.">
                  <TextInput placeholder="Nome" placeholderTextColor="#999" value={name} onChangeText={setName} style={styles.input} />
                  </FormField>
                  <FieldLabel label="Espécie" required />
                  <View style={styles.row}>
                    <TouchableOpacity accessibilityRole="radio" accessibilityState={{ checked: species === 'Cachorro' }} style={[styles.tag, species === 'Cachorro' && styles.tagSelected]} onPress={() => setSpecies('Cachorro')}><Text style={[styles.tagText, species === 'Cachorro' && styles.tagTextSelected]}>🐶 Cachorro</Text></TouchableOpacity>
                    <TouchableOpacity accessibilityRole="radio" accessibilityState={{ checked: species === 'Gato' }} style={[styles.tag, species === 'Gato' && styles.tagSelected]} onPress={() => setSpecies('Gato')}><Text style={[styles.tagText, species === 'Gato' && styles.tagTextSelected]}>🐱 Gato</Text></TouchableOpacity>
                  </View>

                  {/* ADIÇÃO: Seleção de Urgência no Cadastro */}
                  <FieldLabel label="Nível de urgência" required help="Selecione a situação aparente: Estável, Alerta ou Crítico. A opção inicial é Estável." />
                  <View style={styles.row}>
                    {['Estável', 'Alerta', 'Crítico'].map(level => (
                      <TouchableOpacity 
                        key={level} 
                        accessibilityRole="radio" accessibilityState={{ checked: urgency === level }}
                        style={[styles.tag, urgency === level && {backgroundColor: level === 'Crítico' ? '#E74C3C' : level === 'Alerta' ? '#F1C40F' : '#2ECC71'}]} 
                        onPress={() => setUrgency(level)}
                      >
                        <Text style={[styles.tagText, urgency === level && {color: '#FFF'}]}>{level}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <FormField label="Raça" help="Não tem certeza? Informe Não identificada ou descreva o animal.">
                    <TextInput placeholder="Raça" placeholderTextColor="#999" value={breed} onChangeText={setBreed} style={styles.input} />
                  </FormField>
                  <FormField label="Estado de saúde aparente" required help="Descreva apenas o que consegue observar. Não é necessário fazer um diagnóstico.">
                    <TextInput placeholder="Saúde" placeholderTextColor="#999" value={health} onChangeText={setHealth} style={styles.input} />
                  </FormField>
                  <FieldLabel label="Foto do animal" required help="Use uma foto nítida do animal, sem rostos humanos em destaque. Você pode usar a câmera ou a galeria." />
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={image ? 'Trocar foto do animal' : 'Adicionar foto do animal, obrigatório'} onPress={pickImage} style={styles.imagePickerBtn}>
                    {image ? <Image source={{ uri: image.uri }} style={styles.previewImage} /> : <Text style={{color: '#999'}}>📸 Adicionar Foto</Text>}
                  </TouchableOpacity>
                  {photoSourceTarget === 'animal' && <PhotoSourceOptions
                    onSelect={source => choosePhoto(source, 'animal')}
                    onCancel={() => setPhotoSourceTarget(null)} />}
                  <View style={styles.modalActions}>
                    <TouchableOpacity style={styles.cancelButton} disabled={isUploadingAnimal} onPress={closeAnimalForm}><Text style={{color: '#999'}}>Voltar</Text></TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.saveButton, isUploadingAnimal && {opacity: 0.6}]} 
                      onPress={saveAnimal}
                      disabled={isUploadingAnimal}
                    >
                      {isUploadingAnimal ? (
                        <ActivityIndicator color={colors.background} />
                      ) : (
                        <Text style={{color:colors.background, fontWeight: 'bold'}}>Salvar no Mapa</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal Resgate */}
      <Modal visible={rescueModalVisible} animationType="fade" transparent={true} onRequestClose={closeRescueForm}>
        <KeyboardAvoidingView style={styles.modalOverlayCenter} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.rescueModal}>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}>
            {eligibilityNeeded ? <EligibilityForm onCancel={closeRescueForm} onCompleted={completeEligibility} /> : <>
            <Text style={styles.modalTitle}>Validar Resgate ❤️</Text>
            <FormNotice allRequired />
            <FormField label="Seu nome completo" required>
            <TextInput placeholder="Seu Nome" placeholderTextColor="#52606D" underlineColorAndroid="transparent" selectionColor={colors.action} value={rescuerName} onChangeText={setRescuerName} editable={!isUploadingRescue} maxLength={120} style={[styles.input, styles.rescueInput]} />
            </FormField>
            <FormField label="WhatsApp com DDD" required help="Informe um número com DDD para contato sobre este resgate.">
            <TextInput placeholder="WhatsApp" placeholderTextColor="#52606D" underlineColorAndroid="transparent" selectionColor={colors.action} value={rescuerContact} onChangeText={setRescuerContact} editable={!isUploadingRescue} maxLength={30} style={[styles.input, styles.rescueInput]} keyboardType="phone-pad" />
            </FormField>
            <FormField label="E-mail" required help="Informe um endereço para contato sobre este resgate.">
              <TextInput placeholder="nome@exemplo.com" placeholderTextColor="#52606D" underlineColorAndroid="transparent"
                selectionColor={colors.action} value={rescuerEmail} onChangeText={setRescuerEmail} editable={!isUploadingRescue}
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" maxLength={254} style={[styles.input, styles.rescueInput]} />
            </FormField>
            <FormField label="CPF" required help="Use o mesmo CPF da sua declaração de maioridade. O documento não é exibido publicamente e a validação não comprova identidade.">
              <TextInput placeholder="000.000.000-00" placeholderTextColor="#52606D" underlineColorAndroid="transparent"
                selectionColor={colors.action} value={rescuerCpf} onChangeText={value => setRescuerCpf(formatCpf(value))} editable={!isUploadingRescue}
                keyboardType="number-pad" maxLength={14} style={[styles.input, styles.rescueInput]} />
            </FormField>
             
            <FieldLabel label="Foto de comprovação do resgate" required help="Registre o animal após o resgate. Evite rostos humanos em destaque na foto." />
            <TouchableOpacity accessibilityRole="button" disabled={isUploadingRescue} accessibilityLabel={rescueImage ? 'Trocar foto do resgate' : 'Adicionar foto do resgate, obrigatório'} onPress={pickRescueImage} style={styles.imagePickerMini}>
              {rescueImage ? <Image source={{ uri: rescueImage.uri }} style={{width:'100%', height:'100%', borderRadius:10}} /> : <Ionicons name="camera" size={30} color="#CCC" />}
            </TouchableOpacity>
            {photoSourceTarget === 'rescue' && <PhotoSourceOptions
              onSelect={source => choosePhoto(source, 'rescue')}
              onCancel={() => setPhotoSourceTarget(null)} />}
            <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel="Confirmo minha responsabilidade pelo resgate e a veracidade dos dados e da foto, obrigatório"
              accessibilityState={{ checked: acceptedResponsibility, disabled: isUploadingRescue }} disabled={isUploadingRescue}
              onPress={() => setAcceptedResponsibility(value => !value)} style={styles.responsibilityCheckbox}>
              <Ionicons name={acceptedResponsibility ? 'checkbox' : 'square-outline'} size={25} color={colors.action} />
              <Text style={styles.responsibilityText}>Confirmo minha responsabilidade pelo resgate e a veracidade dos dados e da foto. *</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.confirmRescueBtn, isUploadingRescue && {opacity: 0.6}]} 
              onPress={handleRescue}
              disabled={isUploadingRescue}
            >
              {isUploadingRescue ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={{color:colors.background, fontWeight:'bold'}}>Confirmar e Ganhar Moedas</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity disabled={isUploadingRescue} onPress={closeRescueForm} style={{marginTop: 15}}><Text style={{textAlign:'center', color:'#52606D'}}>Voltar</Text></TouchableOpacity>
            </>}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  responsibilityCheckbox: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 48, marginBottom: 18 },
  responsibilityText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 },
  rescueInput: { backgroundColor: colors.surface, color: colors.text, borderColor: '#94A3B8', opacity: 1 },
  clearLocationButton: { position: 'absolute', bottom: 110, alignSelf: 'center', flexDirection: 'row', gap: 6,
    backgroundColor: colors.background, borderColor: '#CBD5E1', borderWidth: 1, borderRadius: 20, paddingHorizontal: 16,
    minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1 },
  map: { flex: 1 },
  locationState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: colors.background },
  locationErrorText: { color: colors.text, fontSize: 16, textAlign: 'center', marginBottom: 18 },
  locationRetryButton: { backgroundColor: colors.action, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  locationRetryText: { color: colors.background, fontWeight: 'bold' },
  userMarker: { backgroundColor: colors.primary, padding: 6, borderRadius: 20, borderWidth: 2, borderColor: colors.background },
  userMarkerPremium: { backgroundColor: '#FFD700', borderColor: '#B8860B' },
  petMarker: { padding: 6, borderRadius: 15, borderWidth: 2, borderColor: colors.background },
  filterContainer: { position: 'absolute', top: 60, flexDirection: 'row', alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.95)', padding: 5, borderRadius: 30, elevation: 5, zIndex: 10 },
  filterBtn: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  filterBtnActive: { backgroundColor: colors.primary },
  filterText: { color: colors.text, fontWeight: 'bold' },
  filterTextActive: { color: colors.background },
  addButton: { position: 'absolute', bottom: 40, alignSelf: 'center', paddingHorizontal: 30, paddingVertical: 15, borderRadius: 30, elevation: 5 },
  addButtonText: { color: colors.background, fontWeight: 'bold' },
  drawerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  drawerContent: { backgroundColor: colors.background, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, maxHeight: '75%', elevation: 10 },
  drawerHandle: { width: 40, height: 5, backgroundColor: '#EEE', borderRadius: 10, alignSelf: 'center', marginBottom: 15 },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  drawerTitle: { fontSize: 24, fontWeight: 'bold', color: colors.primary },
  drawerImage: { width: '100%', height: 180, borderRadius: 20, marginBottom: 15, backgroundColor: colors.surface },
  infoRow: { flexDirection: 'row', marginBottom: 15, flexWrap: 'wrap' },
  infoBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginRight: 8, marginBottom: 5 },
  infoBadgeText: { marginLeft: 6, fontWeight: 'bold', color: colors.primary, fontSize: 11 },
  drawerSectionTitle: { fontSize: 16, fontWeight: 'bold', color: colors.primary, marginBottom: 5 },
  drawerDescription: { fontSize: 14, color: colors.text, lineHeight: 20, marginBottom: 20 },
  drawerActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  shareButton: { backgroundColor: colors.success, padding: 14, borderRadius: 15, width: 55, alignItems: 'center' },
  rescueButton: { flex: 1, minWidth: 100, backgroundColor: colors.action, padding: 14, borderRadius: 15, alignItems: 'center' },
  donateButtonNew: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.action, flexDirection: 'row', padding: 14, borderRadius: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 },
  donateButtonText: { color: colors.action, fontWeight: 'bold', marginLeft: 5, fontSize: 14 },
  actionButtonText: { color: colors.background, fontWeight: 'bold', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalKeyboardContainer: { flex: 1 },
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 30, borderTopRightRadius: 30, maxHeight: '90%', overflow: 'hidden' },
  animalFormContent: { paddingHorizontal: 25, paddingTop: 25 },
  rescueModal: { backgroundColor: colors.background, borderRadius: 25, padding: 25, elevation: 10, maxHeight: '95%', flexShrink: 1 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: colors.primary },
  input: { backgroundColor: colors.surface, padding: 15, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#EEE', color: colors.text },
  row: { flexDirection: 'row', marginBottom: 15 },
  tag: { flex: 1, backgroundColor: colors.surface, padding: 14, marginRight: 10, borderRadius: 12, alignItems: 'center' },
  tagSelected: { backgroundColor: colors.primary },
  tagText: { color: colors.text, fontWeight: 'bold' },
  tagTextSelected: { color: colors.background },
  imagePickerBtn: { height: 100, backgroundColor: colors.surface, borderRadius: 15, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: '#CCC', marginBottom: 15 },
  imagePickerMini: { height: 80, backgroundColor: colors.surface, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: '#CCC', marginBottom: 20 },
  previewImage: { width: '100%', height: '100%', borderRadius: 15 },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelButton: { padding: 15, flex: 1, alignItems: 'center' },
  saveButton: { backgroundColor: colors.action, padding: 15, borderRadius: 12, flex: 2, alignItems: 'center' },
  confirmRescueBtn: { backgroundColor: colors.action, padding: 16, borderRadius: 12, alignItems: 'center' },

  // Estilos do Modal de Doação Customizado
  donateCard: { backgroundColor: colors.background, borderRadius: 28, padding: 24, elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
  donateHeader: { alignItems: 'center', marginBottom: 20 },
  heartCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  donateTitle: { fontSize: 20, fontWeight: 'bold', color: colors.primary, textAlign: 'center' },
  donateSubtitle: { fontSize: 13, color: colors.text, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  presetLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 10 },
  presetContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  presetChip: { flex: 1, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: '#E2E8F0', paddingVertical: 10, borderRadius: 12, marginHorizontal: 3, alignItems: 'center' },
  presetChipSelected: { backgroundColor: colors.surface, borderColor: colors.primary },
  presetText: { fontSize: 14, fontWeight: 'bold', color: colors.text },
  presetTextSelected: { color: colors.primary },
  customAmountContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1.5, borderColor: '#CBD5E0', borderRadius: 14, paddingHorizontal: 16, marginBottom: 20, height: 54 },
  currencyPrefix: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginRight: 8 },
  customAmountInput: { flex: 1, fontSize: 18, fontWeight: 'bold', color: colors.text },
  mpButton: { backgroundColor: colors.action, flexDirection: 'row', paddingVertical: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  mpButtonText: { color: colors.background, fontWeight: 'bold', fontSize: 16 },
  closeDonateBtn: { marginTop: 14, paddingVertical: 10, alignItems: 'center' },
  closeDonateText: { color: colors.danger, fontWeight: '600', fontSize: 14 }
});
