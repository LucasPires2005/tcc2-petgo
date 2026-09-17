import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function RegisterScreen({ navigation }) {
  const { register, resendConfirmationEmail } = useContext(AuthContext);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  
  // NOVOS: Estados para confirmação de e-mail
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const handleRegister = async () => {
    if (!name || !email || !password || !confirmPassword) {
      return Alert.alert('Atenção', 'Preencha todos os campos para criar sua conta.');
    }

    // Validação do formato de e-mail via Expressão Regular (Regex)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return Alert.alert('E-mail Inválido', 'Por favor, informe um endereço de e-mail válido (ex: nome@dominio.com).');
    }

    // NOVO: Validação de senhas iguais
    if (password !== confirmPassword) {
      return Alert.alert('Senhas Diferentes', 'As senhas não coincidem. Tente novamente.');
    }

    // NOVO: Validação de comprimento mínimo de senha
    if (password.length < 6) {
      return Alert.alert('Senha Fraca', 'A senha deve ter pelo menos 6 caracteres.');
    }

    if (!agreed) {
      return Alert.alert('Atenção', 'Você precisa ler e concordar com os Termos de Uso para criar uma conta.');
    }

    setIsLoading(true);
    const success = await register(name, email.trim(), password);
    setIsLoading(false);

    if (success) {
      // NOVO: Após sucesso no registro, mostra tela de confirmação de e-mail
      setRegisteredEmail(email);
      setEmailSent(true);
      setName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    }
  };

  // NOVO: Função para reenviar e-mail de confirmação
  const handleResendEmail = async () => {
    setIsLoading(true);
    await resendConfirmationEmail(registeredEmail);
    setIsLoading(false);
  };

  // NOVO: Tela de confirmação de e-mail
  if (emailSent) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.confirmationBox}>
            <Text style={styles.confirmationTitle}>✉️ Confirme seu E-mail</Text>
            <Text style={styles.confirmationText}>
              Enviamos um link de confirmação para:
            </Text>
            <Text style={styles.emailDisplay}>{registeredEmail}</Text>
            <Text style={styles.confirmationText}>
              Clique no link recebido para ativar sua conta e começar a usar o PetGo!
            </Text>

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleResendEmail}
              disabled={isLoading}
            >
              <Text style={styles.buttonText}>
                {isLoading ? 'Reenviando...' : 'Reenviar E-mail'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.link}
              onPress={() => {
                setEmailSent(false);
                setRegisteredEmail('');
              }}
            >
              <Text style={styles.linkText}>Voltar ao cadastro</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Tela de cadastro normal (mantém TUDO que estava antes)
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Criar Conta</Text>
        <Text style={styles.subtitle}>Junte-se à nossa comunidade</Text>

        <TextInput
          placeholder="Nome Completo"
          placeholderTextColor="#999"
          style={styles.input}
          onChangeText={setName}
          value={name}
          editable={!isLoading}
        />
        <TextInput
          placeholder="E-mail"
          placeholderTextColor="#999"
          style={styles.input}
          onChangeText={setEmail}
          value={email}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!isLoading}
        />
        <TextInput
          placeholder="Senha (mín. 6 caracteres)"
          placeholderTextColor="#999"
          style={styles.input}
          secureTextEntry
          onChangeText={setPassword}
          value={password}
          editable={!isLoading}
        />
        {/* RECUPERADO: Campo de confirmar senha */}
        <TextInput
          placeholder="Confirmar Senha"
          placeholderTextColor="#999"
          style={styles.input}
          secureTextEntry
          onChangeText={setConfirmPassword}
          value={confirmPassword}
          editable={!isLoading}
        />

        {/* RECUPERADO: Checkbox de Termos */}
        <View style={styles.checkboxContainer}>
          <TouchableOpacity
            onPress={() => setAgreed(!agreed)}
            style={styles.checkbox}
            disabled={isLoading}
          >
            <Ionicons
              name={agreed ? "checkbox" : "square-outline"}
              size={24}
              color={agreed ? "#2ECC71" : "#999"}
            />
          </TouchableOpacity>
          <Text style={styles.checkboxText}>
            Li e concordo com os{' '}
            <Text
              style={styles.linkTerms}
              onPress={() => setTermsVisible(true)}
            >
              Termos de Uso
            </Text>
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? 'Criando conta...' : 'Cadastrar'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.link}
          onPress={() => navigation.goBack()}
          disabled={isLoading}
        >
          <Text style={styles.linkText}>Já tenho conta</Text>
        </TouchableOpacity>

        {/* Modal de Termos */}
        <Modal
          visible={termsVisible}
          animationType="slide"
          onRequestClose={() => setTermsVisible(false)}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF' }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Termos de Uso</Text>
              <TouchableOpacity onPress={() => setTermsVisible(false)}>
                <Ionicons name="close-circle" size={30} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={styles.termsContent}
              showsVerticalScrollIndicator={false}
            >
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
              <TouchableOpacity
                style={styles.termsButton}
                onPress={() => {
                  setAgreed(true);
                  setTermsVisible(false);
                }}
              >
                <Text style={styles.termsButtonText}>Concordar e Fechar</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 30,
    paddingBottom: 48,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
  },
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
  buttonDisabled: {
    backgroundColor: '#A8D5BA',
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  link: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: '#666',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 5,
  },
  checkbox: {
    marginRight: 10,
  },
  checkboxText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  linkTerms: {
    color: '#4A90E2',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderColor: '#EEE',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  termsContent: {
    padding: 25,
    paddingBottom: 48,
  },
  termsText: {
    fontSize: 15,
    color: '#444',
    lineHeight: 24,
    textAlign: 'justify',
  },
  termsBold: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#222',
  },
  termsButton: {
    backgroundColor: '#4A90E2',
    padding: 18,
    marginTop: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  termsButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  // NOVOS: Estilos para confirmação de e-mail
  confirmationBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmationTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4A90E2',
    textAlign: 'center',
    marginBottom: 20,
  },
  confirmationText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: 24,
  },
  emailDisplay: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2C3E50',
    textAlign: 'center',
    marginBottom: 20,
    backgroundColor: '#F0F0F0',
    padding: 15,
    borderRadius: 8,
  },
});
