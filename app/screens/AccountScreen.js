import React, { useContext, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, FlatList, Image, ScrollView, Platform } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { AuthContext } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function AccountScreen() {
  const { user, logout, updateAccount, changePassword, refreshUserData } = useContext(AuthContext);
  
  // Estados de Controle
  const [editModal, setEditModal] = useState(false);
  const [pwdModal, setPwdModal] = useState(false);
  const [rescueModal, setRescueModal] = useState(false);
  const [myRescues, setMyRescues] = useState([]);

  // Estados de Input (Placeholder fixo)
  const [newName, setNewName] = useState(user?.name || '');
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [currPass, setCurrPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const API_BASE_URL = 'https://subpeltate-gene-nonpracticed.ngrok-free.dev';

  // Sincroniza moedas sempre que você volta para esta aba
  useFocusEffect(
    useCallback(() => {
      refreshUserData();
    }, [])
  );

  const partners = [
    { id: '1', name: 'PetShop Amigo', desc: '20% OFF em Rações', icon: 'medical' },
    { id: '2', name: 'Vet Clinic', desc: 'Check-up gratuito', icon: 'medkit' },
    { id: '3', name: 'Dog Walker PRO', desc: '1ª aula grátis', icon: 'paw' },
  ];

  const handleUpdate = async () => {
    if (await updateAccount(newName, newEmail)) setEditModal(false);
  };

  const handlePasswordChange = async () => {
    if (newPass !== confirmPwd) return Alert.alert("Erro", "As novas senhas não coincidem.");
    if (await changePassword(currPass, newPass)) {
      setPwdModal(false); 
      setCurrPass(''); setNewPass(''); setConfirmPwd('');
    }
  };

  const loadMyRescues = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/animals/user/${user.id}`);
      const data = await res.json();
      setMyRescues(data);
      setRescueModal(true);
    } catch (e) { Alert.alert("Erro", "Falha ao carregar lista"); }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          {/* Header com Gamificação */}
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={50} color="#FFF" />
              <TouchableOpacity style={styles.editBadge} onPress={() => setEditModal(true)}>
                 <Ionicons name="pencil" size={14} color="#FFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.userName}>{user?.name || 'Usuário'}</Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
            
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Ionicons name="cash" size={18} color="#FFD700" />
                <Text style={styles.statText}>{user?.coins || 0} PetCoins</Text>
              </View>
              <View style={[styles.statBox, user?.is_premium && styles.premiumBox]}>
                <Ionicons name="ribbon" size={18} color={user?.is_premium ? "#4A90E2" : "#999"} />
                <Text style={[styles.statText, user?.is_premium && {color: '#4A90E2'}]}>
                  {user?.is_premium ? 'Membro PRO' : 'Membro Básico'}
                </Text>
              </View>
            </View>
          </View>

          {/* Menu de Opções */}
          <View style={styles.menu}>
            <TouchableOpacity style={styles.menuItem} onPress={loadMyRescues}>
              <View style={[styles.iconArea, {backgroundColor: '#E1F0FF'}]}><Ionicons name="heart" size={22} color="#4A90E2" /></View>
              <Text style={styles.menuText}>Minhas Contribuições</Text>
              <Ionicons name="chevron-forward" size={18} color="#CCC" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => setEditModal(true)}>
               <View style={[styles.iconArea, {backgroundColor: '#F0F0F0'}]}><Ionicons name="person-outline" size={22} color="#666" /></View>
              <Text style={styles.menuText}>Editar Perfil</Text>
              <Ionicons name="chevron-forward" size={18} color="#CCC" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => setPwdModal(true)}>
              <View style={[styles.iconArea, {backgroundColor: '#F0F0F0'}]}><Ionicons name="lock-closed-outline" size={22} color="#666" /></View>
              <Text style={styles.menuText}>Segurança e Senha</Text>
              <Ionicons name="chevron-forward" size={18} color="#CCC" />
            </TouchableOpacity>
          </View>

          {/* Benefícios (Monetização TCC) */}
          <View style={styles.partnersSection}>
            <Text style={styles.sectionTitle}>Benefícios de Voluntário 🐾</Text>
            {partners.map(p => (
              <View key={p.id} style={styles.partnerCard}>
                <View style={styles.partnerIconArea}><Ionicons name={p.icon} size={24} color="#4A90E2" /></View>
                <View style={styles.partnerInfo}>
                  <Text style={styles.partnerName}>{p.name}</Text>
                  <Text style={styles.partnerDesc}>{p.desc}</Text>
                </View>
                <TouchableOpacity style={styles.partnerBtn}><Text style={styles.partnerBtnText}>Ver</Text></TouchableOpacity>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={logout}>
            <Ionicons name="log-out-outline" size={20} color="#FF3B30" style={{marginRight: 10}} />
            <Text style={styles.logoutText}>Sair da Conta</Text>
          </TouchableOpacity>
          
          <View style={{height: 30}} />
        </ScrollView>

        {/* Modal Contribuições */}
        <Modal visible={rescueModal} animationType="slide">
          <View style={{flex: 1, backgroundColor: '#FFF', paddingTop: Platform.OS === 'ios' ? 60 : 20}}> 
            <View style={styles.modalHeaderList}>
               <TouchableOpacity onPress={() => setRescueModal(false)} style={{padding: 10}}><Ionicons name="close" size={28} color="#333" /></TouchableOpacity>
               <Text style={styles.modalHeaderTitle}>Minhas Contribuições</Text>
               <View style={{width: 45}} /> 
            </View>
            <FlatList 
              data={myRescues}
              keyExtractor={item => item.id.toString()}
              contentContainerStyle={{padding: 20}}
              renderItem={({item}) => (
                <View style={styles.rescueCard}>
                  <Image source={item.image_url ? { uri: `${API_BASE_URL}${item.image_url}` } : null} style={styles.cardImage} />
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{item.name}</Text>
                    <Text style={styles.cardDetail}>{item.species} • {item.breed}</Text>
                    <View style={[styles.statusTag, {backgroundColor: item.status === 1 ? '#D1FAE5' : '#FEE2E2'}]}>
                       <Text style={[styles.statusText, {color: item.status === 1 ? '#059669' : '#DC2626'}]}>{item.status === 1 ? 'Resgatado ✅' : 'Aguardando ⏳'}</Text>
                    </View>
                  </View>
                </View>
              )}
              ListEmptyComponent={<View style={styles.emptyContainer}><Text style={styles.emptyText}>Nada por aqui ainda...</Text></View>}
            />
          </View>
        </Modal>

        {/* Modal Editar Perfil */}
        <Modal visible={editModal} animationType="fade" transparent>
          <View style={styles.modalOverlay}><View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Editar Perfil</Text>
            <TextInput style={styles.input} placeholder="Nome" placeholderTextColor="#999" value={newName} onChangeText={setNewName} />
            <TextInput style={styles.input} placeholder="E-mail" placeholderTextColor="#999" value={newEmail} onChangeText={setNewEmail} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => setEditModal(false)}><Text style={{color: '#999'}}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={handleUpdate}><Text style={{color:'#FFF', fontWeight: 'bold'}}>Salvar</Text></TouchableOpacity>
            </View>
          </View></View>
        </Modal>

        {/* Modal Senha */}
        <Modal visible={pwdModal} animationType="fade" transparent>
          <View style={styles.modalOverlay}><View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Mudar Senha</Text>
            <TextInput style={styles.input} placeholder="Senha Atual" placeholderTextColor="#999" secureTextEntry value={currPass} onChangeText={setCurrPass} />
            <TextInput style={styles.input} placeholder="Nova Senha" placeholderTextColor="#999" secureTextEntry value={newPass} onChangeText={setNewPass} />
            <TextInput style={styles.input} placeholder="Confirmar" placeholderTextColor="#999" secureTextEntry value={confirmPwd} onChangeText={setConfirmPwd} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => setPwdModal(false)}><Text style={{color: '#999'}}>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={handlePasswordChange}><Text style={{color:'#FFF', fontWeight: 'bold'}}>Atualizar</Text></TouchableOpacity>
            </View>
          </View></View>
        </Modal>

      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  profileHeader: { alignItems: 'center', padding: 30, backgroundColor: '#FFF', borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 4 },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#4A90E2', justifyContent: 'center', alignItems: 'center', marginBottom: 15, position: 'relative' },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#333', padding: 8, borderRadius: 20, borderWidth: 3, borderColor: '#FFF' },
  userName: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  userEmail: { fontSize: 14, color: '#888', marginTop: 2 },
  statsRow: { flexDirection: 'row', marginTop: 20, width: '100%', justifyContent: 'space-around' },
  statBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#EEE' },
  premiumBox: { backgroundColor: '#E1F0FF', borderColor: '#4A90E2' },
  statText: { marginLeft: 8, fontWeight: 'bold', color: '#555', fontSize: 12 },
  menu: { padding: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 15, marginBottom: 10, elevation: 2 },
  iconArea: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  menuText: { flex: 1, fontSize: 16, marginLeft: 15, color: '#444', fontWeight: '500' },
  partnersSection: { paddingHorizontal: 20, marginTop: 10 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 15 },
  partnerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 15, marginBottom: 10, elevation: 2 },
  partnerIconArea: { backgroundColor: '#F0F7FF', padding: 10, borderRadius: 12 },
  partnerInfo: { flex: 1, marginLeft: 15 },
  partnerName: { fontWeight: 'bold', color: '#333' },
  partnerDesc: { fontSize: 12, color: '#666' },
  partnerBtn: { backgroundColor: '#4A90E2', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 10 },
  partnerBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  logoutButton: { marginTop: 10, marginHorizontal: 20, flexDirection: 'row', backgroundColor: '#FFF', padding: 18, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderColor: '#FF3B30', borderWidth: 1 },
  logoutText: { color: '#FF3B30', fontWeight: 'bold' },
  modalHeaderList: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  modalHeaderTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  rescueCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 20, marginBottom: 15, padding: 12, elevation: 3 },
  cardImage: { width: 80, height: 80, borderRadius: 15, backgroundColor: '#F0F0F0' },
  cardInfo: { flex: 1, marginLeft: 15, justifyContent: 'center' },
  cardName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  cardDetail: { fontSize: 13, color: '#888' },
  statusTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 5 },
  statusText: { fontSize: 11, fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyText: { color: '#999' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#FFF', padding: 25, borderRadius: 30 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#333' },
  input: { backgroundColor: '#F5F5F5', padding: 15, borderRadius: 15, marginBottom: 15, color: '#333' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  btn: { flex: 0.48, padding: 15, borderRadius: 15, alignItems: 'center' },
  btnCancel: { backgroundColor: '#EEE' },
  btnSave: { backgroundColor: '#4A90E2' }
});