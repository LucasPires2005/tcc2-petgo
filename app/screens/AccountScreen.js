import React, { useContext, useState, useCallback, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Modal, 
  TextInput, 
  Alert, 
  FlatList, 
  Image, 
  ScrollView, 
  Platform,
  Linking
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { AuthContext } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

const ONGS_LIST = [
  'ONG Anjos de Quatro Patas - Unidade Centro',
  'ONG Proteção Animal - Unidade Sul',
  'ONG S.O.S Pet - Unidade Senac Nações Unidas'
];

export default function AccountScreen({ navigation }) {
  const { user, logout, updateAccount, changePassword, refreshUserData, redeemReward, buyPremium, deleteAccount } = useContext(AuthContext);
  
  // --- ESTADOS DOS MODAIS ORIGINAIS ---
  const [editModal, setEditModal] = useState(false);
  const [pwdModal, setPwdModal] = useState(false);
  const [rescueModal, setRescueModal] = useState(false);
  const [myRescues, setMyRescues] = useState([]);

  // --- NOVOS ESTADOS PARA LOJINHA E MARKETPLACE ---
  const [couponModal, setCouponModal] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [activeVoucher, setActiveVoucher] = useState(null);

  // --- ESTADO DE PROCESSAMENTO DE PAGAMENTO MERCADO PAGO ---
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // --- ESTADOS DE ENTREGA / RETIRADA ---
  const [deliveryType, setDeliveryType] = useState('ONG'); // 'ONG' ou 'DELIVERY'
  const [selectedOng, setSelectedOng] = useState(ONGS_LIST[0]);
  const [deliveryAddress, setDeliveryAddress] = useState('Av. das Nações Unidas, 14500 - São Paulo/SP');

  // --- ESTADOS DE INPUTS ORIGINAIS ---
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [currPass, setCurrPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const API_BASE_URL = 'https://tcc-2026-1-e-2-petgo.onrender.com';

  useFocusEffect(useCallback(() => { refreshUserData(); }, []));

  useEffect(() => {
    if (user) {
      setNewName(user.name || '');
      setNewEmail(user.email || '');
    }
  }, [user, editModal]);

  // Listener para capturar o retorno do checkout do Mercado Pago
  useEffect(() => {
    const handleOpenURL = (event) => {
      if (event?.url && event.url.includes('status=approved')) {
        Alert.alert(
          "Compra Confirmada! 🎉",
          "Seu pagamento via Mercado Pago foi aprovado com sucesso! Obrigado por apoiar a Loja PetGo."
        );
        refreshUserData();
      }
    };

    const subscription = Linking.addEventListener('url', handleOpenURL);
    return () => subscription.remove();
  }, []);

  // Função utilitária para gerar código hash aleatório 
  const generateUniqueCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'PETGO-';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleUpdate = async () => {
    const success = await updateAccount(newName, newEmail);
    if (success) setEditModal(false);
  };

  const handlePasswordChange = async () => {
    if (!currPass || !newPass || !confirmPwd) {
      return Alert.alert("Atenção", "Preencha todos os campos de senha.");
    }
    if (newPass !== confirmPwd) {
      return Alert.alert("Erro", "A confirmação da nova senha não coincide.");
    }

    const success = await changePassword(currPass, newPass);
    if (success) {
      Alert.alert("Sucesso 🎉", "Sua senha foi alterada com sucesso!");
      setPwdModal(false);
      setCurrPass(''); setNewPass(''); setConfirmPwd('');
    } else {
      Alert.alert("Erro", "A senha atual digitada está incorreta.");
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Excluir Conta",
      "Tem certeza que deseja excluir permanentemente sua conta? Esta ação não pode ser desfeita.",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Excluir Definitivamente", 
          style: "destructive", 
          onPress: async () => {
            const success = await deleteAccount();
            if (success) {
              Alert.alert("Conta Excluída", "Sua conta foi removida com sucesso.");
            }
          } 
        }
      ]
    );
  };

  const storeItems = [
    { id: 's1', name: 'Camiseta PetGo', price: 'R$ 59,90', coins: 500, icon: 'shirt-outline' },
    { id: 's2', name: 'Caneca Voluntário', price: 'R$ 35,00', coins: 300, icon: 'cafe-outline' },
    { id: 's3', name: 'Ecobag Sustentável', price: 'R$ 25,00', coins: 200, icon: 'bag-handle-outline' },
  ];

  const partners = [
    { id: '1', name: 'PetShop Amigo', desc: 'Desconto de R$ 20,00', cost: 100, icon: 'medical' },
    { id: '2', name: 'Vet Clinic', desc: 'Consulta Grátis', cost: 500, icon: 'medkit' },
    { id: '3', name: 'Banho & Tosa PRO', desc: '1 Tosa completa', cost: 250, icon: 'water' },
  ];

  // Abertura da Loja Física (Selecionar Entrega / Retirada)
  const handleBuyProduct = (item) => {
    setSelectedItem(item);
    setProductModal(true);
  };

  // Finalizar Compra de Produto Físico (PIX, Coins ou Mercado Pago)
  const processPhysicalPurchase = async (paymentMethod) => {
    if (paymentMethod === 'MERCADO_PAGO') {
      if (!selectedItem || !selectedItem.price) {
        Alert.alert("Erro", "Produto inválido.");
        return;
      }

      setIsProcessingPayment(true);

      try {
        const numericPrice = parseFloat(
          selectedItem.price.replace(/[^\d,]/g, '').replace(',', '.')
        );

        const response = await fetch(`${API_BASE_URL}/auth/create-preference`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({
            userId: user?.id,
            title: `Loja PetGo - ${selectedItem.name}`,
            price: numericPrice,
            quantity: 1,
            type: 'store_purchase',
            deliveryType: deliveryType,
            deliveryInfo: deliveryType === 'ONG' ? selectedOng : deliveryAddress
          })
        });

        const data = await response.json();

        if (response.ok && (data.init_point || data.sandbox_init_point)) {
          setProductModal(false);
          const checkoutUrl = data.sandbox_init_point || data.init_point;
          await Linking.openURL(checkoutUrl);
        } else {
          Alert.alert("Erro no Mercado Pago", data.message || "Não foi possível gerar a cobrança.");
        }
      } catch (error) {
        Alert.alert("Erro", "Falha de conexão ao processar o pagamento via Mercado Pago.");
      } finally {
        setIsProcessingPayment(false);
      }
      return;
    }

    if (paymentMethod === 'PIX') {
      setProductModal(false);
      Alert.alert(
        "PIX Copia e Cola 📋", 
        `Chave: petgo-pix-loja-oficial-2026\nItem: ${selectedItem.name}\n\nEntrega/Retirada registrada:\n${deliveryType === 'ONG' ? selectedOng : deliveryAddress}`
      );
      return;
    }

    if (user?.coins < selectedItem.coins) {
      return Alert.alert("Saldo Insuficiente", "Resgate mais animais para ganhar moedas!");
    }

    try {
      const res = await fetch(`${API_BASE_URL}/auth/buy-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, cost: selectedItem.coins, productName: selectedItem.name })
      });

      if (res.ok) {
        const uniqueCode = generateUniqueCode();
        setProductModal(false);
        refreshUserData();

        Alert.alert(
          "Pedido Confirmado! 🎉",
          deliveryType === 'ONG'
            ? `Seu produto estará disponível para retirada em:\n${selectedOng}\n\nApresente o código: ${uniqueCode}`
            : `Seu pedido será entregue em:\n${deliveryAddress}\n\nCódigo de Rastreio: PG${Math.floor(100000000 + Math.random() * 900000000)}BR`
        );
      }
    } catch (e) { 
      Alert.alert("Erro", "Conexão falhou ao processar pedido."); 
    }
  };

  // Resgate do Marketplace (Gera QR Code Único)
  const handleRedeem = async (partner) => {
    if (user?.coins < partner.cost) {
      return Alert.alert("Saldo Insuficiente", `Você precisa de ${partner.cost} PetCoins.`);
    }

    Alert.alert(
      "Confirmar Resgate 🎁",
      `Deseja usar ${partner.cost} PetCoins para resgatar "${partner.desc}" em ${partner.name}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Confirmar",
          onPress: async () => {
            const serverCode = await redeemReward(partner.cost);
            const displayCode = serverCode || generateUniqueCode();

            setActiveVoucher({
              partner: partner.name,
              offer: partner.desc,
              code: displayCode,
              time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            });

            setCouponModal(true);
          }
        }
      ]
    );
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
      <SafeAreaView style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false}>
          
          {/* HEADER PERFIL */}
          <View style={styles.profileHeader}>
            <View style={[styles.avatar, user?.is_premium === 1 || user?.plan_tier > 0 ? styles.avatarPremium : null]}>
              <Ionicons name="person" size={55} color="#FFF" />
              <TouchableOpacity style={styles.editBadgeAvatar} onPress={() => setEditModal(true)}>
                 <Ionicons name="pencil" size={14} color="#FFF" />
              </TouchableOpacity>
              {user?.is_premium === 1 || user?.plan_tier > 0 ? (
                <View style={styles.verifiedBadge}><Ionicons name="checkmark-circle" size={22} color="#4A90E2" /></View>
              ) : null}
            </View>

            <View style={styles.userNameRow}>
               <Text style={styles.userName}>{String(user?.name || 'Usuário')}</Text>
               {(user?.is_premium === 1 || user?.plan_tier > 0) && <Text style={{fontSize: 20}}> 💎</Text>}
            </View>
            <Text style={styles.userEmail}>{String(user?.email || '')}</Text>
            
            <View style={styles.memberBadge}>
              <Text style={styles.memberBadgeText}>
                {user?.plan_tier === 3 ? "Guardião 🛡️" : 
                 user?.plan_tier === 2 ? "Protetor 🦸" :
                 user?.plan_tier === 1 ? "Amigo 🤝" :
                 user?.is_premium === 1 ? "Membro PRO 💎" : "Membro Voluntário 🐾"}
              </Text>
            </View>
            
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Ionicons name="cash" size={18} color="#FFD700" />
                <Text style={styles.statText}>{String(user?.coins || 0)} PetCoins</Text>
              </View>

              <View style={[styles.statBox, (user?.is_premium === 1 || user?.plan_tier > 0) ? styles.premiumBadgeBox : null]}>
                <Ionicons name="star" size={18} color={(user?.is_premium === 1 || user?.plan_tier > 0) ? "#B8860B" : "#999"} />
                <Text style={[styles.statText, (user?.is_premium === 1 || user?.plan_tier > 0) ? {color: '#B8860B'} : null]}>
                  {user?.plan_tier > 0 ? 'ASSINANTE' : user?.is_premium === 1 ? 'PREMIUM' : 'BÁSICO'}
                </Text>
              </View>

              <View style={styles.statBox}>
                <Ionicons name="checkmark-done-circle" size={18} color="#2ECC71" />
                <Text style={styles.statText}>
                {myRescues.filter(animal => animal.status === 1).length} Salvos
                </Text>
              </View>
            </View>
          </View>

          {/* CARDS DE PLANO E ASSINATURA */}
          <TouchableOpacity 
            style={[styles.upgradeCard, { backgroundColor: '#8E44AD', marginTop: 15, marginBottom: 5 }]} 
            onPress={() => navigation.navigate('Subscription')}
          >
            <Ionicons name="card" size={24} color="#FFF" />
            <View style={{flex: 1, marginLeft: 15}}>
              <Text style={styles.upgradeTitle}>Planos de Assinatura</Text>
              <Text style={styles.upgradeSubtitle}>Conheça os benefícios e apoie a causa</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FFF" />
          </TouchableOpacity>

          {!user?.is_premium && user?.plan_tier === 0 ? (
            <TouchableOpacity style={styles.upgradeCard} onPress={() => buyPremium()}>
              <Ionicons name="diamond" size={24} color="#FFF" />
              <View style={{flex: 1, marginLeft: 15}}>
                <Text style={styles.upgradeTitle}>Seja um Membro PRO</Text>
                <Text style={styles.upgradeSubtitle}>Destaque e selo exclusivo por 50 moedas</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          {/* MENU CONTA */}
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

          {/* LOJA OFICIAL */}
          <View style={styles.partnersSection}>
            <Text style={styles.sectionTitle}>Loja Oficial PetGo 🛍️</Text>
            {storeItems.map(item => (
              <TouchableOpacity key={item.id} style={styles.partnerCard} onPress={() => handleBuyProduct(item)}>
                <View style={[styles.partnerIconArea, {backgroundColor: '#FFF5E6'}]}><Ionicons name={item.icon} size={24} color="#F39C12" /></View>
                <View style={styles.partnerInfo}>
                  <Text style={styles.partnerName}>{item.name}</Text>
                  <Text style={styles.partnerDesc}>{item.price} ou {item.coins} moedas</Text>
                </View>
                <Ionicons name="cart" size={22} color="#F39C12" />
              </TouchableOpacity>
            ))}
          </View>

          {/* MARKETPLACE */}
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
                <Ionicons name="ticket-outline" size={22} color="#4A90E2" />
              </TouchableOpacity>
            ))}
          </View>

          {/* PARCERIA ONG */}
          <View style={styles.partnersSection}>
            <TouchableOpacity 
              style={[styles.upgradeCard, { backgroundColor: '#27AE60', marginHorizontal: 0, marginTop: 5, marginBottom: 10 }]} 
              onPress={() => Alert.alert(
                'Parceria Institucional 🏢', 
                'Representa uma ONG ou abrigo de animais? Envie um e-mail para parceiros@petgo.com com o seu CNPJ para validarmos e liberarmos o seu painel de gestão exclusivo.'
              )}
            >
              <Ionicons name="business" size={24} color="#FFF" />
              <View style={{flex: 1, marginLeft: 15}}>
                <Text style={styles.upgradeTitle}>Representa uma ONG?</Text>
                <Text style={styles.upgradeSubtitle}>Torne-se parceira e receba apadrinhamentos</Text>
              </View>
              <Ionicons name="mail" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={logout}>
            <Text style={styles.logoutText}>Sair da Conta</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
            <Text style={styles.deleteText}>Excluir Conta</Text>
          </TouchableOpacity>

          <View style={{height: 30}} />
        </ScrollView>

        {/* MODAL 1: EDITAR PERFIL */}
        <Modal visible={editModal} animationType="fade" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Editar Perfil</Text>
              <TextInput style={styles.input} placeholder="Nome" value={newName} onChangeText={setNewName} underlineColorAndroid="transparent" placeholderTextColor="#999" />
              <TextInput style={styles.input} placeholder="E-mail" value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" underlineColorAndroid="transparent" placeholderTextColor="#999" />
              <TouchableOpacity style={styles.btnSave} onPress={handleUpdate}>
                <Text style={styles.btnSaveText}>Salvar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditModal(false)} style={{marginTop: 15}}>
                <Text style={{textAlign: 'center', color: '#666'}}>Voltar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* MODAL 2: MUDAR SENHA */}
        <Modal visible={pwdModal} animationType="fade" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Mudar Senha</Text>
              <TextInput style={styles.input} placeholder="Senha Atual" secureTextEntry value={currPass} onChangeText={setCurrPass} underlineColorAndroid="transparent" placeholderTextColor="#999" />
              <TextInput style={styles.input} placeholder="Nova Senha" secureTextEntry value={newPass} onChangeText={setNewPass} underlineColorAndroid="transparent" placeholderTextColor="#999" />
              <TextInput style={styles.input} placeholder="Confirmar Nova Senha" secureTextEntry value={confirmPwd} onChangeText={setConfirmPwd} underlineColorAndroid="transparent" placeholderTextColor="#999" />
              <TouchableOpacity style={styles.btnSave} onPress={handlePasswordChange}>
                <Text style={styles.btnSaveText}>Atualizar Senha</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPwdModal(false)} style={{marginTop: 15}}>
                <Text style={{textAlign: 'center', color: '#666'}}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* MODAL 3: HISTÓRICO DE RESGATES */}
        <Modal visible={rescueModal} animationType="slide">
          <SafeAreaView style={{flex: 1, backgroundColor: '#FFF'}}>
            <View style={styles.modalListHeader}>
              <TouchableOpacity onPress={() => setRescueModal(false)} style={{padding: 10}}>
                <Ionicons name="close" size={32} color="#333" />
              </TouchableOpacity>
              <Text style={styles.modalTitleHeader}>Histórico de Ações</Text>
              <View style={{width: 50}} />
            </View>
            <FlatList 
              data={myRescues}
              keyExtractor={item => item.id.toString()}
              contentContainerStyle={{padding: 20}}
              renderItem={({item}) => (
                <View style={styles.rescueCard}>
                  <Image source={{ uri: `${API_BASE_URL}${item.image_url}` }} style={styles.cardImage} />
                  <View style={{marginLeft: 15, flex: 1}}>
                    <Text style={styles.cardName}>{String(item.name)}</Text>
                    <Text style={{color: '#666', fontSize: 12}}>{String(item.species)}</Text>
                    <View style={[styles.statusTag, {backgroundColor: item.status === 1 ? '#D1FAE5' : '#FEF3C7'}]}>
                       <Text style={[styles.statusTagText, {color: item.status === 1 ? '#059669' : '#D97706'}]}>
                         {item.status === 1 ? 'Salvo ❤️' : 'Aguardando ⏳'}
                       </Text>
                    </View>
                  </View>
                  {item.status === 1 && item.rescue_image_url ? (
                    <View style={styles.finalHappyBox}>
                       <Image source={{ uri: `${API_BASE_URL}${item.rescue_image_url}` }} style={styles.rescueThumbnail} />
                       <Text style={{fontSize: 8, color: '#4A90E2', fontWeight: 'bold'}}>FINAL FELIZ</Text>
                    </View>
                  ) : null}
                </View>
              )}
            />
          </SafeAreaView>
        </Modal>

        {/* MODAL 4: QR CODE DINÂMICO PARA CUPOM DO MARKETPLACE */}
        <Modal visible={couponModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Voucher Gerado! 🎉</Text>
              <Text style={styles.voucherOffer}>{activeVoucher?.offer}</Text>
              <Text style={styles.voucherPartner}>{activeVoucher?.partner}</Text>

              <View style={styles.qrContainer}>
                <Image
                  source={{
                    uri: `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${activeVoucher?.code}`
                  }}
                  style={{ width: 160, height: 160 }}
                />
              </View>

              <View style={styles.codeBox}>
                <Text style={styles.codeLabel}>CÓDIGO ÚNICO:</Text>
                <Text style={styles.codeText}>{activeVoucher?.code}</Text>
                <Text style={styles.timeText}>Emitido às {activeVoucher?.time}</Text>
              </View>

              <TouchableOpacity style={styles.btnSave} onPress={() => setCouponModal(false)}>
                <Text style={styles.btnSaveText}>Concluído</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* MODAL 5: OPÇÕES DE ENTREGA / RETIRADA (PRODUTOS FÍSICOS) */}
        <Modal visible={productModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Resgate de Produto 📦</Text>
              <Text style={styles.voucherOffer}>{selectedItem?.name}</Text>

              <View style={styles.tabRow}>
                <TouchableOpacity
                  style={[styles.tabButton, deliveryType === 'ONG' && styles.tabButtonActive]}
                  onPress={() => setDeliveryType('ONG')}
                >
                  <Text style={[styles.tabText, deliveryType === 'ONG' && styles.tabTextActive]}>Retirar em ONG</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabButton, deliveryType === 'DELIVERY' && styles.tabButtonActive]}
                  onPress={() => setDeliveryType('DELIVERY')}
                >
                  <Text style={[styles.tabText, deliveryType === 'DELIVERY' && styles.tabTextActive]}>Receber em Casa</Text>
                </TouchableOpacity>
              </View>

              {deliveryType === 'ONG' ? (
                <View style={{ width: '100%', marginBottom: 15 }}>
                  <Text style={styles.fieldLabel}>Escolha o ponto de coleta:</Text>
                  {ONGS_LIST.map((ong) => (
                    <TouchableOpacity
                      key={ong}
                      style={[styles.ongOption, selectedOng === ong && styles.ongOptionActive]}
                      onPress={() => setSelectedOng(ong)}
                    >
                      <Ionicons
                        name={selectedOng === ong ? "radio-button-on" : "radio-button-off"}
                        size={16}
                        color={selectedOng === ong ? "#4A90E2" : "#999"}
                      />
                      <Text style={{ marginLeft: 8, fontSize: 12, color: '#333', flex: 1 }}>{ong}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={{ width: '100%', marginBottom: 15 }}>
                  <Text style={styles.fieldLabel}>Endereço de Entrega:</Text>
                  <TextInput
                    style={[styles.input, { height: 60, textAlignVertical: 'top' }]}
                    value={deliveryAddress}
                    onChangeText={setDeliveryAddress}
                    multiline
                  />
                </View>
              )}

              <TouchableOpacity 
                style={[styles.btnSave, { backgroundColor: '#F39C12', marginBottom: 8 }]} 
                onPress={() => processPhysicalPurchase('COINS')}
              >
                <Text style={styles.btnSaveText}>Pagar com {selectedItem?.coins} Coins</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.btnSave, { backgroundColor: '#009EE3', marginBottom: 8 }]} 
                onPress={() => processPhysicalPurchase('MERCADO_PAGO')}
                disabled={isProcessingPayment}
              >
                <Text style={styles.btnSaveText}>
                  {isProcessingPayment ? "Processando..." : `Pagar com Mercado Pago (${selectedItem?.price})`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.btnSave, { backgroundColor: '#27AE60' }]} 
                onPress={() => processPhysicalPurchase('PIX')}
              >
                <Text style={styles.btnSaveText}>Pagar em PIX ({selectedItem?.price})</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setProductModal(false)} style={{ marginTop: 12 }}>
                <Text style={{ textAlign: 'center', color: '#666' }}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  profileHeader: { alignItems: 'center', paddingVertical: 30, backgroundColor: '#FFF', borderBottomLeftRadius: 35, borderBottomRightRadius: 35, elevation: 5 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#4A90E2', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  avatarPremium: { borderWidth: 4, borderColor: '#FFD700' },
  editBadgeAvatar: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#333', padding: 8, borderRadius: 20, borderWidth: 3, borderColor: '#FFF', zIndex: 999 },
  verifiedBadge: { position: 'absolute', bottom: -2, left: -2, backgroundColor: '#FFF', borderRadius: 15 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15 },
  userName: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  userEmail: { fontSize: 14, color: '#888', marginBottom: 5 },
  memberBadge: { backgroundColor: '#E1F0FF', paddingHorizontal: 15, paddingVertical: 6, borderRadius: 20, marginBottom: 15 },
  memberBadgeText: { color: '#4A90E2', fontWeight: 'bold', fontSize: 13 },
  statsRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-around', paddingHorizontal: 10 },
  statBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', padding: 10, borderRadius: 15, minWidth: '30%', justifyContent: 'center' },
  premiumBadgeBox: { backgroundColor: '#FFF9E6', borderWidth: 1, borderColor: '#FFD700' },
  statText: { marginLeft: 5, fontWeight: 'bold', fontSize: 10, color: '#555' },
  upgradeCard: { margin: 20, backgroundColor: '#4A90E2', borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', elevation: 4 },
  upgradeTitle: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  upgradeSubtitle: { color: '#EEE', fontSize: 11 },
  menu: { paddingHorizontal: 20, marginTop: 10 },
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 18, elevation: 2, marginBottom: 10 },
  iconArea: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  menuText: { flex: 1, fontSize: 15, marginLeft: 15, color: '#333', fontWeight: '500' },
  partnersSection: { paddingHorizontal: 20, marginTop: 15 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 15 },
  partnerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 18, marginBottom: 10, elevation: 3 },
  partnerIconArea: { backgroundColor: '#F0F7FF', padding: 10, borderRadius: 12 },
  partnerInfo: { flex: 1, marginLeft: 15 },
  partnerName: { fontWeight: 'bold', color: '#333' },
  partnerDesc: { fontSize: 12, color: '#666' },
  costBadge: { backgroundColor: '#FFF9E6', paddingHorizontal: 8, borderRadius: 6, marginTop: 4, alignSelf: 'flex-start' },
  costText: { fontSize: 10, color: '#B8860B', fontWeight: 'bold' },
  logoutButton: { marginHorizontal: 20, marginTop: 20, marginBottom: 10, padding: 15, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#FF3B30' },
  logoutText: { color: '#FF3B30', fontWeight: 'bold' },
  deleteButton: { marginHorizontal: 20, marginBottom: 10, padding: 15, borderRadius: 20, alignItems: 'center', backgroundColor: '#FF3B30' },
  deleteText: { color: '#FFF', fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#FFF', padding: 25, borderRadius: 30, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, color: '#333' },
  modalListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, paddingTop: Platform.OS === 'ios' ? 20 : 10 },
  modalTitleHeader: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  input: { 
    width: '100%',
    backgroundColor: '#F0F0F0', 
    padding: 15, 
    borderRadius: 12, 
    marginBottom: 15, 
    color: '#333', 
    fontSize: 15, 
    borderWidth: 1, 
    borderColor: '#DDD' 
  },
  btnSave: { 
    width: '100%', 
    backgroundColor: '#4A90E2', 
    paddingVertical: 14,
    paddingHorizontal: 12, 
    borderRadius: 12, 
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnSaveText: { 
    color: '#FFF', 
    fontWeight: 'bold', 
    textAlign: 'center', 
    fontSize: 13.5,
    lineHeight: 18
  },
  rescueCard: { flexDirection: 'row', backgroundColor: '#FFF', padding: 15, borderRadius: 15, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: '#EEE' },
  cardImage: { width: 65, height: 65, borderRadius: 12, backgroundColor: '#F0F0F0' },
  cardName: { fontWeight: 'bold', fontSize: 16, color: '#333' },
  statusTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 5 },
  statusTagText: { fontSize: 10, fontWeight: 'bold' },
  finalHappyBox: { alignItems: 'center', marginLeft: 10 },
  rescueThumbnail: { width: 50, height: 50, borderRadius: 8, borderWidth: 1, borderColor: '#4A90E2' },
  voucherOffer: { fontSize: 16, fontWeight: 'bold', color: '#2ECC71', textAlign: 'center' },
  voucherPartner: { fontSize: 13, color: '#666', marginBottom: 15, textAlign: 'center' },
  qrContainer: { padding: 10, backgroundColor: '#FFF', borderRadius: 15, borderWidth: 1, borderColor: '#EEE', marginBottom: 15 },
  codeBox: { backgroundColor: '#F8F9FA', padding: 12, borderRadius: 10, width: '100%', alignItems: 'center', marginBottom: 15 },
  codeLabel: { fontSize: 10, color: '#888', fontWeight: 'bold' },
  codeText: { fontSize: 18, fontWeight: 'bold', color: '#2ECC71', marginTop: 2 },
  timeText: { fontSize: 10, color: '#AAA', marginTop: 2 },
  tabRow: { flexDirection: 'row', width: '100%', marginVertical: 15 },
  tabButton: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: '#4A90E2', borderRadius: 10, alignItems: 'center', marginHorizontal: 4 },
  tabButtonActive: { backgroundColor: '#4A90E2' },
  tabText: { color: '#4A90E2', fontWeight: 'bold', fontSize: 12 },
  tabTextActive: { color: '#FFF' },
  fieldLabel: { fontSize: 12, fontWeight: 'bold', color: '#555', marginBottom: 8 },
  ongOption: { flexDirection: 'row', alignItems: 'center', padding: 8, borderWidth: 1, borderColor: '#EEE', borderRadius: 8, marginBottom: 6 },
  ongOptionActive: { borderColor: '#4A90E2', backgroundColor: '#F0F7FF' }
});