import React, { useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';

export default function SubscriptionScreen({ navigation }) {
  const { subscribeToPlan, user } = useContext(AuthContext);

  const plans = [
    {
      tier: 1,
      name: 'Plano Amigo',
      price: 'R$ 19,90',
      period: '/mês',
      color: '#4A90E2', // Azul PetGo
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
      color: '#8E44AD', // Roxo (Destaque)
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
      color: '#F39C12', // Dourado (VIP)
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
      `Deseja prosseguir com a assinatura de ${plan.price}${plan.period}? Em breve, você será redirecionado para o Mercado Pago.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Confirmar Teste', 
          onPress: async () => {
            const success = await subscribeToPlan(plan.tier);
            if (success) {
              navigation.goBack(); // Volta pro perfil após assinar
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