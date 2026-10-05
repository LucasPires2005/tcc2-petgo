import { colors } from '../theme/colors';
import React, { useState, useContext, useEffect, useRef } from 'react';
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
import { useHeaderHeight } from '@react-navigation/elements';
import { SafeAreaView as ScreenSafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';
import FormField, { FormNotice } from '../components/FormField';
import { Ionicons } from '@expo/vector-icons';
import EligibilityFields from '../components/EligibilityFields';
import { birthDateToIso, declarationError } from '../services/eligibilityApi';

export default function RegisterScreen({ navigation }) {
  const headerHeight = useHeaderHeight();
  const { register, resendConfirmationEmail } = useContext(AuthContext);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [acceptedDeclaration, setAcceptedDeclaration] = useState(false);
  const registerLock = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    const unsubscribe = navigation.addListener('blur', () => {
      setCpf(''); setBirthDate(''); setAcceptedDeclaration(false);
    });
    return () => { active.current = false; unsubscribe(); };
  }, [navigation]);
  
  // NOVOS: Estados para confirmação de e-mail
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const handleRegister = async () => {
    if (registerLock.current) return;
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

    const eligibilityError = declarationError(cpf, birthDate, acceptedDeclaration);
    if (eligibilityError) return Alert.alert('Confira sua declaração', eligibilityError);

    registerLock.current = true;
    setIsLoading(true);
    try {
      const success = await register(name, email.trim(), password, {
        cpf, birthDate: birthDateToIso(birthDate), acceptedDeclaration
      });
      if (!active.current) return;
      if (success) {
        // Após sucesso, mantém o fluxo existente de confirmação de e-mail.
        setRegisteredEmail(email);
        setEmailSent(true);
        setName('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setCpf(''); setBirthDate(''); setAcceptedDeclaration(false);
      }
    } finally {
      registerLock.current = false;
      if (active.current) setIsLoading(false);
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
        keyboardVerticalOffset={headerHeight}
        style={styles.container}
      >
        <ScreenSafeAreaView edges={['bottom']} style={styles.container}>
        <ScrollView
          style={styles.scrollView}
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
        </ScreenSafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  // Tela de cadastro normal (mantém TUDO que estava antes)
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
      style={styles.container}
    >
      <ScreenSafeAreaView edges={['bottom']} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Criar Conta</Text>
        <Text style={styles.subtitle}>Junte-se à nossa comunidade</Text>
        <FormNotice allRequired />

        <FormField label="Nome completo" required>
          <TextInput
            placeholder="Nome Completo"
            placeholderTextColor="#999"
            style={styles.input}
            onChangeText={setName}
            value={name}
            editable={!isLoading}
          />
        </FormField>
        <FormField label="E-mail" required help="Use um endereço ao qual você tenha acesso. Será necessário confirmar o link enviado por e-mail.">
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
        </FormField>
        <FormField label="Senha" required help="Use pelo menos 6 caracteres. O botão de olho permite conferir o que foi digitado.">
          <PasswordInput
            placeholder="Senha (mín. 6 caracteres)"
            placeholderTextColor="#999"
            style={styles.input}
            onChangeText={setPassword}
            value={password}
            editable={!isLoading}
          />
        </FormField>
        {/* RECUPERADO: Campo de confirmar senha */}
        <FormField label="Confirmar senha" required help="Digite novamente a mesma senha.">
          <PasswordInput
            placeholder="Confirmar Senha"
            placeholderTextColor="#999"
            style={styles.input}
            onChangeText={setConfirmPassword}
            value={confirmPassword}
            editable={!isLoading}
          />
        </FormField>

        <EligibilityFields cpf={cpf} setCpf={setCpf} birthDate={birthDate} setBirthDate={setBirthDate}
          accepted={acceptedDeclaration} setAccepted={setAcceptedDeclaration} disabled={isLoading} />

        {/* RECUPERADO: Checkbox de Termos */}
        <View style={styles.checkboxContainer}>
          <TouchableOpacity
            accessibilityRole="checkbox"
            accessibilityLabel="Li e concordo com os Termos de Uso, obrigatório"
            accessibilityState={{ checked: agreed, disabled: isLoading }}
            onPress={() => setAgreed(!agreed)}
            style={styles.checkbox}
            disabled={isLoading}
          >
            <Ionicons
              name={agreed ? "checkbox" : "square-outline"}
              size={24}
              color={agreed ? colors.success : "#999"}
            />
          </TouchableOpacity>
          <Text style={styles.checkboxText}>
            Li e concordo com os{' '}
            <Text
              style={styles.linkTerms}
              onPress={() => setTermsVisible(true)}
            >
              Termos de Uso *
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
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Termos de Uso</Text>
              <TouchableOpacity onPress={() => setTermsVisible(false)}>
                <Ionicons name="close-circle" size={30} color={colors.text} />
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
      </ScreenSafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    flexShrink: 0,
    padding: 30,
    paddingBottom: 48,
    justifyContent: 'flex-start',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: colors.primary,
    marginBottom: 30,
  },
  input: {
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 12,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#EEE',
    color: colors.text,
  },
  button: {
    backgroundColor: colors.success,
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
    color: colors.background,
    fontSize: 18,
    fontWeight: 'bold',
  },
  link: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: colors.text,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 5,
  },
  checkbox: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  checkboxText: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  linkTerms: {
    color: colors.primary,
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
    color: colors.primary,
  },
  termsContent: {
    padding: 25,
    paddingBottom: 48,
  },
  termsText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 24,
    textAlign: 'justify',
  },
  termsBold: {
    fontWeight: 'bold',
    fontSize: 16,
    color: colors.text,
  },
  termsButton: {
    backgroundColor: colors.action,
    padding: 18,
    marginTop: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  termsButtonText: {
    color: colors.background,
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
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 20,
  },
  confirmationText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: 24,
  },
  emailDisplay: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 20,
    backgroundColor: colors.surface,
    padding: 15,
    borderRadius: 8,
  },
});
