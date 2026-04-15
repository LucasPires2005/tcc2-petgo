import React, { useContext, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, FlatList, Image, ScrollView, Platform } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { AuthContext } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function AccountScreen() {
  const { user, logout, updateAccount, changePassword, refreshUserData, redeemReward, buyPremium } = useContext(AuthContext);
  
  const [editModal, setEditModal] = useState(false);
  const [pwdModal, setPwdModal] = useState(false);
  const [rescueModal, setRescueModal] = useState(false);
  const [myRescues, setMyRescues] = useState([]);

  const [newName, setNewName] = useState(user?.name || '');
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [currPass, setCurrPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const API_BASE_URL = 'https://subpeltate-gene-nonpracticed.ngrok-free.dev';

  useFocusEffect(useCallback(() => { refreshUserData(); }, []));

  const partners = [
    { id: '1', name: 'PetShop Amigo', desc: 'Desconto de R$ 20,00', cost: 100, icon: 'medical' },
    { id: '2', name: 'Vet Clinic', desc: 'Consulta Grátis', cost: 500, icon: 'medkit' },
    { id: '3', name: 'Banho & Tosa PRO', desc: '1 Tosa completa', cost: 250, icon: 'water' },
  ];

  const handleRedeem = async (partner) => {
    if (user?.coins < partner.cost) return Alert.alert("Saldo Insuficiente", `Você precisa de ${partner.cost} PetCoins.`);
    Alert.alert("Confirmar Resgate", `Trocar ${partner.cost} PetCoins por "${partner.desc}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Resgatar", onPress: async () => {
        const code = await redeemReward(partner.cost);
        if (code) Alert.alert("Sucesso! 🎉", `Código: ${code}`);
      }}
    ]);
  };

  const loadMyRescues = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/animals/user/${user.id}`, { headers: { 'ngrok-skip-browser-warning': 'true' } });
      const data = await res.json();
      setMyRescues(Array.isArray(data) ? data : []);
      setRescueModal(true);
    } catch (e) { Alert.alert("Erro", "Falha ao carregar lista"); }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          <View style={styles.profileHeader}>
            {/* AVATAR COM LÁPIS E VERIFICADO */}
            <View style={[styles.avatar, user?.is_premium ? styles.avatarPremium : null]}>
              <Ionicons name="person" size={55} color="#FFF" />
              <TouchableOpacity style={styles.editBadgeAvatar} onPress={() => setEditModal(true)}>
                 <Ionicons name="pencil" size={14} color="#FFF" />
              </TouchableOpacity>
              {user?.is_premium ? (
                <View style={styles.verifiedBadge}><Ionicons name="checkmark-circle" size={22} color="#4A90E2" /></View>
              ) : null}
            </View>

            <Text style={styles.userName}>{user?.name || 'Usuário'}</Text>
            <Text style={styles.userEmail}>{user?.email || ''}</Text>
            
            {/* BADGE TIPO DE MEMBRO (IGUAL AO SEU PRINT) */}
            <View style={styles.memberBadge}>
              <Text style={styles.memberBadgeText}>
                {user?.is_premium ? "Membro PRO 💎" : "Membro Voluntário 🐾"}
              </Text>
            </View>
            
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Ionicons name="cash" size={18} color="#FFD700" />
                <Text style={styles.statText}>{user?.coins || 0} PetCoins</Text>
              </View>
              <View style={[styles.statBox, user?.is_premium ? styles.premiumBadgeBox : null]}>
                <Ionicons name="star" size={18} color={user?.is_premium ? "#B8860B" : "#999"} />
                <Text style={[styles.statText, user?.is_premium ? {color: '#B8860B'} : null]}>
                  {user?.is_premium ? 'PREMIUM' : 'BÁSICO'}
                </Text>
              </View>
            </View>
          </View>

          {!user?.is_premium ? (
            <TouchableOpacity style={styles.upgradeCard} onPress={() => buyPremium()}>
              <Ionicons name="diamond" size={24} color="#FFF" />
              <View style={{flex: 1, marginLeft: 15}}>
                <Text style={styles.upgradeTitle}>Seja um Membro PRO</Text>
                <Text style={styles.upgradeSubtitle}>Ganhe selo de destaque por 50 moedas</Text>
              </View>
            </TouchableOpacity>
          ) : null}

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

          <View style={styles.partnersSection}>
            <Text style={styles.sectionTitle}>Marketplace 🎁</Text>
            {partners.map(p => (
              <TouchableOpacity key={p.id} style={styles.partnerCard} onPress={() => handleRedeem(p)}>
                <View style={styles.partnerIconArea}><Ionicons name={p.icon} size={24} color="#4A90E2" /></View>
                <View style={styles.partnerInfo}>
                  <Text style={styles.partnerName}>{p.name}</Text>
                  <Text style={styles.partnerDesc}>{p.desc}</Text>
                  <View style={styles.costBadge}><Text style={styles.costText}>{p.cost} PetCoins</Text></View>
                </View>
                <Ionicons name="cart-outline" size={20} color="#4A90E2" />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={logout}>
            <Text style={styles.logoutText}>Sair da Conta</Text>
          </TouchableOpacity>
          <View style={{height: 30}} />
        </ScrollView>

        {/* MODAL CONTRIBUIÇÕES - HEADER AJUSTADO */}
        <Modal visible={rescueModal} animationType="slide">
          <SafeAreaView style={{flex: 1, backgroundColor: '#FFF'}}>
            <View style={styles.modalListHeader}>
              <TouchableOpacity onPress={() => setRescueModal(false)} style={{padding: 20}}>
                <Ionicons name="close" size={32} color="#333" />
              </TouchableOpacity>
              <Text style={styles.modalTitleHeader}>Minhas Contribuições</Text>
              <View style={{width: 60}} />
            </View>
            <FlatList 
              data={myRescues}
              keyExtractor={item => item.id.toString()}
              contentContainerStyle={{padding: 20}}
              renderItem={({item}) => (
                <View style={styles.rescueCard}>
                  <Image source={{ uri: `${API_BASE_URL}${item.image_url}` }} style={styles.cardImage} />
                  <View style={{marginLeft: 15, flex: 1}}>
                    <Text style={styles.cardName}>{item.name}</Text>
                    <Text style={{color: '#666', fontSize: 13}}>{item.species}</Text>
                    <View style={[styles.statusTag, {backgroundColor: item.status === 1 ? '#D1FAE5' : '#FEF3C7'}]}>
                       <Text style={[styles.statusTagText, {color: item.status === 1 ? '#059669' : '#D97706'}]}>
                         {item.status === 1 ? 'Resgatado ✅' : 'Aguardando ⏳'}
                       </Text>
                    </View>
                  </View>
                </View>
              )}
            />
          </SafeAreaView>
        </Modal>

        {/* MODAL EDITAR PERFIL */}
        <Modal visible={editModal} animationType="fade" transparent>
          <View style={styles.modalOverlay}><View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Editar Perfil</Text>
            <TextInput style={styles.input} placeholder="Nome" value={newName} onChangeText={setNewName} placeholderTextColor="#999" />
            <TextInput style={styles.input} placeholder="E-mail" value={newEmail} onChangeText={setNewEmail} placeholderTextColor="#999" />
            <TouchableOpacity style={styles.btnSave} onPress={async () => { if(await updateAccount(newName, newEmail)) setEditModal(false); }}><Text style={{color:'#FFF', fontWeight: 'bold'}}>Salvar</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setEditModal(false)} style={{marginTop: 15}}><Text style={{textAlign: 'center', color: '#999'}}>Voltar</Text></TouchableOpacity>
          </View></View>
        </Modal>

        {/* MODAL SENHA */}
        <Modal visible={pwdModal} animationType="fade" transparent>
          <View style={styles.modalOverlay}><View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Mudar Senha</Text>
            <TextInput style={styles.input} placeholder="Senha Atual" secureTextEntry value={currPass} onChangeText={setCurrPass} placeholderTextColor="#999" />
            <TextInput style={styles.input} placeholder="Nova Senha" secureTextEntry value={newPass} onChangeText={setNewPass} placeholderTextColor="#999" />
            <TextInput style={styles.input} placeholder="Confirmar" secureTextEntry value={confirmPwd} onChangeText={setConfirmPwd} placeholderTextColor="#999" />
            <TouchableOpacity style={styles.btnSave} onPress={async () => {
              if (newPass !== confirmPwd) return Alert.alert("Erro", "Senhas não coincidem");
              if (await changePassword(currPass, newPass)) { setPwdModal(false); setCurrPass(''); setNewPass(''); setConfirmPwd(''); }
            }}><Text style={{color:'#FFF', fontWeight: 'bold'}}>Atualizar</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setPwdModal(false)} style={{marginTop: 15}}><Text style={{textAlign: 'center', color: '#999'}}>Cancelar</Text></TouchableOpacity>
          </View></View>
        </Modal>

      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  profileHeader: { alignItems: 'center', paddingVertical: 30, backgroundColor: '#FFF', borderBottomLeftRadius: 35, borderBottomRightRadius: 35, elevation: 5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#4A90E2', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  avatarPremium: { borderWidth: 4, borderColor: '#FFD700' },
  editBadgeAvatar: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#333', padding: 8, borderRadius: 20, borderWidth: 3, borderColor: '#FFF', zIndex: 10 },
  verifiedBadge: { position: 'absolute', bottom: -2, left: -2, backgroundColor: '#FFF', borderRadius: 15 },
  userName: { fontSize: 24, fontWeight: 'bold', color: '#333', marginTop: 15 },
  userEmail: { fontSize: 15, color: '#888', marginBottom: 10 },
  
  // Estilo Membro Voluntário
  memberBadge: { backgroundColor: '#E1F0FF', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, marginBottom: 20 },
  memberBadgeText: { color: '#4A90E2', fontWeight: 'bold', fontSize: 14 },

  statsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-around', paddingHorizontal: 20 },
  statBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', padding: 12, borderRadius: 15, minWidth: '40%', justifyContent: 'center' },
  premiumBadgeBox: { backgroundColor: '#FFF9E6', borderWidth: 1, borderColor: '#FFD700' },
  statText: { marginLeft: 8, fontWeight: 'bold', fontSize: 13, color: '#555' },
  
  upgradeCard: { margin: 20, backgroundColor: '#4A90E2', borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', elevation: 4 },
  upgradeTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  upgradeSubtitle: { color: '#EEE', fontSize: 11 },
  
  menu: { paddingHorizontal: 20, marginTop: 10 },
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 18, elevation: 2, marginBottom: 12 },
  iconArea: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  menuText: { flex: 1, fontSize: 16, marginLeft: 15, color: '#333', fontWeight: '500' },
  
  partnersSection: { padding: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 15 },
  partnerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 18, marginBottom: 12, elevation: 3 },
  partnerIconArea: { backgroundColor: '#F0F7FF', padding: 10, borderRadius: 12 },
  partnerInfo: { flex: 1, marginLeft: 15 },
  partnerName: { fontWeight: 'bold', color: '#333' },
  partnerDesc: { fontSize: 12, color: '#666' },
  costBadge: { backgroundColor: '#FFF9E6', paddingHorizontal: 8, borderRadius: 6, marginTop: 4, alignSelf: 'flex-start' },
  costText: { fontSize: 10, color: '#B8860B', fontWeight: 'bold' },
  
  logoutButton: { margin: 20, padding: 18, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#FF3B30' },
  logoutText: { color: '#FF3B30', fontWeight: 'bold' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#FFF', padding: 25, borderRadius: 30 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  modalTitleHeader: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  modalListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#EEE' },
  input: { backgroundColor: '#F5F5F5', padding: 15, borderRadius: 15, marginBottom: 15, color: '#333' },
  btnSave: { backgroundColor: '#4A90E2', padding: 15, borderRadius: 15, alignItems: 'center' },
  
  rescueCard: { flexDirection: 'row', backgroundColor: '#FFF', padding: 15, borderRadius: 20, marginBottom: 15, alignItems: 'center', borderWidth: 1, borderColor: '#F0F0F0', elevation: 2 },
  cardImage: { width: 75, height: 75, borderRadius: 15, backgroundColor: '#F8F9FA' },
  cardName: { fontWeight: 'bold', fontSize: 17, color: '#333' },
  statusTag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginTop: 6 },
  statusTagText: { fontSize: 11, fontWeight: 'bold' }
});