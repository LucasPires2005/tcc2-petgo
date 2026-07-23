import React, { useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';

export default function SubscriptionScreen({ navigation }) {
  // Adicionamos o subscribeToPlan de volta aqui para liberar a assinatura
  const { subscribeToPlan, user } = useContext(AuthContext);
  const API_BASE_URL = 'https://subpeltate-gene-nonpracticed.ngrok-free.dev';

  const plans = [
    {
      tier: 1,
      name: 'Plano Amigo',
      price: 'R$ 19,90',
      period: '/mês',
      color: '#4A90E2',
      icon: 'paw',
      benefits: [
        'Multiplicador 1x PetCoins',
        'Apadrinhamento de 1 animal',
        'Impacto: Ração mensal',
        'Acompanhamento de status'
      ]
    },
    {
      tier: 2,
      name: 'Plano Protetor',
      price: 'R$ 39,90',
      period: '/mês',
      color: '#8E44AD',
      icon: 'shield-checkmark',
      benefits: [
        'Multiplicador 2x PetCoins',
        '1 animal + atualizações semanais',
        'Impacto: Ração + Vacina',
        'Selo Protetor no Perfil'
      ]
    },
    {
      tier: 3,
      name: 'Plano Guardião',
      price: 'R$ 79,90',
      period: '/mês',
      color: '#F39C12',
      icon: 'diamond',
      benefits: [
        'Multiplicador 3x PetCoins',
        'Contato direto com a ONG',
        'Impacto: Ração + Vacina + Consulta',
        'Selo Guardião VIP no Perfil'
      ]
    }
  ];

  const handleSubscribe = (plan) => {
    Alert.alert(
      `Assinar ${plan.name}`,
      `Deseja ser redirecionado para o ambiente de pagamentos para finalizar a assinatura de ${plan.price}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Ir para Pagamento', 
          onPress: async () => {
            try {
              const cleanPrice = plan.price.replace('R$ ', '').replace(',', '.');

              const response = await fetch(`${API_BASE_URL}/auth/create-preference`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: plan.name,
                  price: cleanPrice,
                  planTier: plan.tier,
                  userId: user.id
                })
              });
              
              const data = await response.json();

              if (data.init_point) {
                // 1. Abre a tela do Mercado Pago para a demonstração
                console.log("LINK DO SANDBOX:", data.init_point);
                Linking.openURL(data.init_point);

                // 2. Controla o fluxo da sua apresentação manualmente com o delay!
                setTimeout(() => {
                  Alert.alert(
                    'Confirmação de Assinatura',
                    'A janela do Mercado Pago foi aberta. Após a simulação, confirme abaixo para ativar seus benefícios.',
                    [
                      { text: 'Ainda não concluí', style: 'cancel' },
                      {
                        text: 'Já Paguei! 💎',
                        onPress: async () => {
                          // Aqui nós disparamos a atualização direto no banco para a banca ver!
                          const success = await subscribeToPlan(plan.tier);
                          if (success) {
                            navigation.goBack();
                          }
                        }
                      }
                    ]
                  );
                }, 1500);

              } else {
                Alert.alert('Erro', 'Não foi possível gerar o link de pagamento.');
              }

            } catch (error) {
              Alert.alert('Erro', 'Falha na conexão com o servidor.');
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Planos de Assinatura</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.introSection}>
          <Text style={styles.introTitle}>Seja o Herói que eles precisam 🐾</Text>
          <Text style={styles.introDesc}>
            Escolha o plano que melhor se adapta a você e amplie seu impacto no resgate e cuidado de animais abandonados.
          </Text>
        </View>

        {plans.map((plan) => {
          const isCurrentPlan = user?.plan_tier === plan.tier;

          return (
            <View key={plan.tier} style={[styles.card, { borderColor: plan.color, borderWidth: isCurrentPlan ? 3 : 0 }]}>
              {isCurrentPlan && (
                <View style={[styles.currentBadge, { backgroundColor: plan.color }]}>
                  <Text style={styles.currentBadgeText}>SEU PLANO ATUAL</Text>
                </View>
              )}

              <View style={[styles.cardHeader, { backgroundColor: plan.color }]}>
                <Ionicons name={plan.icon} size={32} color="#FFF" />
                <View style={{ marginLeft: 15 }}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planPrice}>
                    {plan.price}<Text style={styles.planPeriod}>{plan.period}</Text>
                  </Text>
                </View>
              </View>

              <View style={styles.cardBody}>
                {plan.benefits.map((benefit, index) => (
                  <View key={index} style={styles.benefitRow}>
                    <Ionicons name="checkmark-circle" size={20} color={plan.color} />
                    <Text style={styles.benefitText}>{benefit}</Text>
                  </View>
                ))}

                <TouchableOpacity 
                  style={[
                    styles.subscribeBtn, 
                    { backgroundColor: isCurrentPlan ? '#CCC' : plan.color }
                  ]}
                  disabled={isCurrentPlan}
                  onPress={() => handleSubscribe(plan)}
                >
                  <Text style={styles.subscribeBtnText}>
                    {isCurrentPlan ? 'Plano Ativo' : `Assinar ${plan.name}`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: '#FFF', elevation: 2 },
  backButton: { padding: 5 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  scrollContent: { padding: 20 },
  introSection: { marginBottom: 25, alignItems: 'center' },
  introTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', textAlign: 'center', marginBottom: 10 },
  introDesc: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22 },
  
  card: { backgroundColor: '#FFF', borderRadius: 20, marginBottom: 25, elevation: 4, overflow: 'hidden' },
  currentBadge: { paddingVertical: 5, alignItems: 'center', justifyContent: 'center' },
  currentBadgeText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  planName: { fontSize: 20, fontWeight: 'bold', color: '#FFF' },
  planPrice: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginTop: 5 },
  planPeriod: { fontSize: 14, fontWeight: 'normal' },
  
  cardBody: { padding: 20 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  benefitText: { marginLeft: 10, fontSize: 15, color: '#444', flex: 1 },
  
  subscribeBtn: { padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  subscribeBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});