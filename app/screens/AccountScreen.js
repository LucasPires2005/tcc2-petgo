import React, { useContext, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, FlatList, Image } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function AccountScreen() {
  const { user, logout, updateAccount, deleteAccount, changePassword } = useContext(AuthContext);
  
  const [editModal, setEditModal] = useState(false);
  const [pwdModal, setPwdModal] = useState(false);
  const [rescueModal, setRescueModal] = useState(false);

  const [newName, setNewName] = useState(user?.name || '');
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [currPass, setCurrPass] = useState(''); // Variável correta
  const [newPass, setNewPass] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [myRescues, setMyRescues] = useState([]);

  const API_BASE_URL = 'https://subpeltate-gene-nonpracticed.ngrok-free.dev';

  const handleUpdate = async () => {
    if (await updateAccount(newName, newEmail)) setEditModal(false);
  };

  const handlePasswordChange = async () => {
    if (newPass !== confirmPwd) return Alert.alert("Erro", "As senhas não coincidem.");
    const success = await changePassword(currPass, newPass);
    if (success) {
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
        {/* Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={50} color="#FFF" />
            <TouchableOpacity style={styles.editBadge} onPress={() => setEditModal(true)}>
               <Ionicons name="pencil" size={14} color="#FFF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.userName}>{user?.name || 'Usuário'}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          <View style={styles.badgeContainer}><Text style={styles.badgeText}>Membro Voluntário 🐾</Text></View>
        </View>

        {/* Menu */}
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
          
          <TouchableOpacity style={styles.logoutButton} onPress={logout}>
            <Ionicons name="log-out-outline" size={20} color="#FF3B30" style={{marginRight: 10}} />
            <Text style={styles.logoutText}>Sair da Conta</Text>
          </TouchableOpacity>
        </View>

        {/* Modal Contribuições - TOPO CORRIGIDO */}
        <Modal visible={rescueModal} animationType="slide">
          <View style={{flex: 1, backgroundColor: '#FFF', paddingTop: 60}}> 
            <View style={styles.modalHeaderList}>
               <TouchableOpacity onPress={() => setRescueModal(false)} style={{padding: 10}}>
                 <Ionicons name="close" size={28} color="#333" />
               </TouchableOpacity>
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
            <TextInput style={styles.input} placeholder="Nome" value={newName} onChangeText={setNewName} />
            <TextInput style={styles.input} placeholder="E-mail" value={newEmail} onChangeText={setNewEmail} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => setEditModal(false)}><Text>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={handleUpdate}><Text style={{color: '#FFF'}}>Salvar</Text></TouchableOpacity>
            </View>
          </View></View>
        </Modal>

        {/* Modal Senha - NOMES CORRIGIDOS */}
        <Modal visible={pwdModal} animationType="fade" transparent>
          <View style={styles.modalOverlay}><View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Mudar Senha</Text>
            <TextInput style={styles.input} placeholder="Senha Atual" secureTextEntry value={currPass} onChangeText={setCurrPass} />
            <TextInput style={styles.input} placeholder="Nova Senha" secureTextEntry value={newPass} onChangeText={setNewPass} />
            <TextInput style={styles.input} placeholder="Confirmar" secureTextEntry value={confirmPwd} onChangeText={setConfirmPwd} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={() => setPwdModal(false)}><Text>Cancelar</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnSave]} onPress={handlePasswordChange}><Text style={{color: '#FFF'}}>Atualizar</Text></TouchableOpacity>
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
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#4A90E2', justifyContent: 'center', alignItems: 'center', marginBottom: 15, position: 'relative' },
  editBadge: { position: 'absolute', bottom: 5, right: 5, backgroundColor: '#333', padding: 8, borderRadius: 20, borderWidth: 3, borderColor: '#FFF' },
  userName: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  userEmail: { fontSize: 14, color: '#888', marginTop: 2 },
  badgeContainer: { backgroundColor: '#E1F0FF', paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20, marginTop: 12 },
  badgeText: { color: '#4A90E2', fontSize: 12, fontWeight: 'bold' },
  menu: { padding: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 20, marginBottom: 12, elevation: 2 },
  iconArea: { width: 45, height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  menuText: { flex: 1, fontSize: 16, marginLeft: 15, color: '#444', fontWeight: '500' },
  logoutButton: { marginTop: 10, flexDirection: 'row', backgroundColor: '#FFF', padding: 18, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderColor: '#FF3B30', borderWidth: 1 },
  logoutText: { color: '#FF3B30', fontWeight: 'bold', fontSize: 16 },
  modalHeaderList: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  modalHeaderTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  rescueCard: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 20, marginBottom: 15, padding: 12, elevation: 3 },
  cardImage: { width: 80, height: 80, borderRadius: 15, backgroundColor: '#F0F0F0' },
  cardInfo: { flex: 1, marginLeft: 15, justifyContent: 'center' },
  cardName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  cardDetail: { fontSize: 13, color: '#888', marginVertical: 4 },
  statusTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', marginTop: 100, padding: 40 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 20, lineHeight: 22 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#FFF', padding: 25, borderRadius: 30 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { backgroundColor: '#F5F5F5', padding: 15, borderRadius: 15, marginBottom: 15 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  btn: { flex: 0.48, padding: 15, borderRadius: 15, alignItems: 'center' },
  btnCancel: { backgroundColor: '#EEE' },
  btnSave: { backgroundColor: '#4A90E2' }
});