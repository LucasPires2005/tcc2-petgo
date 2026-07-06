import React, { useState, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Modal, ScrollView, SafeAreaView } from 'react-native';
import { AuthContext } from '../context/AuthContext';
// ADIÇÃO: Importando ícones para o Checkbox
import { Ionicons } from '@expo/vector-icons';

export default function RegisterScreen({ navigation }) {
  const { register } = useContext(AuthContext);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // ADIÇÃO: Estados para gerenciar os Termos de Uso
  const [agreed, setAgreed] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password) {
      return Alert.alert('Atenção', 'Preencha todos os campos para criar sua conta.');
    }

    // ADIÇÃO: Validação de aceite dos termos
    if (!agreed) {
      return Alert.alert('Atenção', 'Você precisa ler e concordar com os Termos de Uso para criar uma conta.');
    }

    const success = await register(name, email, password);
    
    if (success) {
      navigation.goBack(); 
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Criar Conta</Text>
      <Text style={styles.subtitle}>Junte-se à nossa comunidade</Text>

      <TextInput 
        placeholder="Nome Completo" 
        placeholderTextColor="#999"
        style={styles.input} 
        onChangeText={setName}
      />
      <TextInput 
        placeholder="E-mail" 
        placeholderTextColor="#999"
        style={styles.input} 
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput 
        placeholder="Senha" 
        placeholderTextColor="#999"
        style={styles.input} 
        secureTextEntry 
        onChangeText={setPassword}
      />

      {/* ADIÇÃO: Componente de Checkbox dos Termos de Uso */}
      <View style={styles.checkboxContainer}>
        <TouchableOpacity onPress={() => setAgreed(!agreed)} style={styles.checkbox}>
          <Ionicons 
            name={agreed ? "checkbox" : "square-outline"} 
            size={24} 
            color={agreed ? "#2ECC71" : "#999"} 
          />
        </TouchableOpacity>
        <Text style={styles.checkboxText}>
          Li e concordo com os{' '}
          <Text style={styles.linkTerms} onPress={() => setTermsVisible(true)}>
            Termos de Uso
          </Text>
        </Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleRegister}>
        <Text style={styles.buttonText}>Cadastrar</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()}>
        <Text style={styles.linkText}>Já tenho conta</Text>
      </TouchableOpacity>

      {/* ADIÇÃO: Modal com o texto dos Termos de Uso */}
      <Modal visible={termsVisible} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF' }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Termos de Uso</Text>
            <TouchableOpacity onPress={() => setTermsVisible(false)}>
              <Ionicons name="close-circle" size={30} color="#333" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.termsContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.termsText}>
              <Text style={styles.termsBold}>1. Objetivo da Plataforma{'\n'}</Text>
              O PetGo é uma ferramenta tecnológica comunitária cujo único objetivo é facilitar o encontro, registro e resgate de animais em situação de vulnerabilidade. A plataforma atua apenas como uma ponte de comunicação entre voluntários.{'\n\n'}
              
              <Text style={styles.termsBold}>2. Responsabilidade do Usuário{'\n'}</Text>
              Ao criar um registro ou validar um resgate, você se compromete a fornecer informações e fotografias reais e precisas. É estritamente proibido o uso da plataforma para realizar falsos alertas, brincadeiras de mau gosto ou qualquer ação que coloque a integridade dos animais ou de outros usuários em risco.{'\n\n'}
              
              <Text style={styles.termsBold}>3. Isenção de Responsabilidade Civil{'\n'}</Text>
              O PetGo não se responsabiliza por interações físicas, resgates mal sucedidos, ou atitudes de terceiros fora do ambiente digital. Todo resgate deve ser feito com cautela e, de preferência, com o apoio de profissionais ou ONGs capacitadas.{'\n\n'}
              
              <Text style={styles.termsBold}>4. Segurança, Rastreabilidade e Punições{'\n'}</Text>
              Visando a proteção da nossa comunidade e dos animais, o PetGo mantém registros (logs) das atividades realizadas na plataforma. O uso de má-fé, falsidade ideológica ou a inserção de dados falsos que resultem em danos aos animais resultará no banimento imediato da conta. O PetGo reserva-se o direito de cooperar integralmente com as autoridades competentes, fornecendo dados de rastreabilidade em caso de denúncias de maus-tratos ou crimes cibernéticos.{'\n\n'}
              
              <Text style={styles.termsBold}>5. Aceite{'\n'}</Text>
              Ao marcar a caixa de seleção e efetuar o cadastro, o usuário declara ter lido, compreendido e concordado expressamente com todos os termos descritos acima.
            </Text>
          </ScrollView>
          <TouchableOpacity style={styles.termsButton} onPress={() => { setAgreed(true); setTermsVisible(false); }}>
            <Text style={styles.termsButtonText}>Concordar e Fechar</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 30, justifyContent: 'center', backgroundColor: '#FFF' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 30 },
  input: {
    backgroundColor: '#F5F5F5',
    padding: 18,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#EEE',
    color: '#333',
  },
  button: {
    backgroundColor: '#2ECC71',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  link: { marginTop: 20, alignItems: 'center' },
  linkText: { color: '#666' },

  // ADIÇÃO: Novos estilos para Checkbox e Modal
  checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 5 },
  checkbox: { marginRight: 10 },
  checkboxText: { fontSize: 14, color: '#666', flex: 1 },
  linkTerms: { color: '#4A90E2', fontWeight: 'bold', textDecorationLine: 'underline' },
  
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderColor: '#EEE' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  termsContent: { padding: 25 },
  termsText: { fontSize: 15, color: '#444', lineHeight: 24, textAlign: 'justify' },
  termsBold: { fontWeight: 'bold', fontSize: 16, color: '#222' },
  termsButton: { backgroundColor: '#4A90E2', padding: 18, margin: 20, borderRadius: 12, alignItems: 'center' },
  termsButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
});