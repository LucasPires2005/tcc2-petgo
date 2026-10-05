import React, { useContext, useEffect, useRef, useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform,
  Alert,
  Modal,
  ScrollView,
  Image
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { SafeAreaView as ScreenSafeAreaView } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';
import FormField, { FormNotice } from '../components/FormField';
import { colors } from '../theme/colors';
import { GOOGLE_SOCIAL_ENABLED, cancelSocialLogin } from '../services/socialAuth';

export default function LoginScreen({ navigation }) {
  const headerHeight = useHeaderHeight();
  const { login, requestPasswordReset, loginWithGoogle } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [forgotPasswordModalVisible, setForgotPasswordModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const loginLock = useRef(false);
  const active = useRef(true);
  const socialHandoff = useRef(false);
  useEffect(() => {
    active.current = true;
    const blur = navigation.addListener('blur', () => { if (!socialHandoff.current) cancelSocialLogin(); });
    const focus = navigation.addListener('focus', () => { socialHandoff.current = false; });
    return () => { active.current = false; cancelSocialLogin(); blur(); focus(); };
  }, [navigation]);
  const authBusy = isLoading || isGoogleLoading;

  const handleLogin = async () => {
    if (loginLock.current) return;
    if (!email || !password) {
      return Alert.alert('Atenção', 'Preencha todos os campos para entrar.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return Alert.alert('E-mail Inválido', 'Por favor, insira um e-mail no formato correto (ex: usuario@email.com).');
    }

    loginLock.current = true;
    setIsLoading(true);
    try { await login(email.trim(), password); }
    finally { loginLock.current = false; if (active.current) setIsLoading(false); }
  };

  const handleGoogleLogin = async () => {
    if (loginLock.current) return;
    loginLock.current = true;
    setIsGoogleLoading(true);
    try {
      const result = await loginWithGoogle();
      if (active.current && result.requiresOnboarding) {
        socialHandoff.current = true;
        navigation.navigate('SocialOnboarding');
      }
    } catch (error) {
      if (active.current && error.code !== 'SOCIAL_CANCELLED') {
        Alert.alert('Acesso com Google', error.message || 'Não foi possível entrar. Tente novamente.');
      }
    } finally {
      loginLock.current = false;
      if (active.current) setIsGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!resetEmail.trim()) {
      return Alert.alert('Atenção', 'Digite seu e-mail para recuperar a senha.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(resetEmail.trim())) {
      return Alert.alert('E-mail Inválido', 'Por favor, insira um e-mail no formato correto.');
    }

    setIsResettingPassword(true);
    const success = await requestPasswordReset(resetEmail.trim());
    setIsResettingPassword(false);

    if (success) {
      setResetEmail('');
      setForgotPasswordModalVisible(false);
    }
  };

  return (
    <>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
        style={styles.container}
      >
        <ScreenSafeAreaView edges={['bottom']} style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <Image source={require('../assets/LogoPetGo.png')} style={styles.logo}
            resizeMode="contain" accessible accessibilityLabel="PetGo — Conecta, ajuda, transforma" />
          <Text style={styles.subtitle}>Ajude a salvar vidas no mapa</Text>

          <View style={styles.inputContainer}>
            <FormNotice allRequired />
            <FormField label="E-mail" required help="Informe o e-mail usado ao criar sua conta.">
              <TextInput
                placeholder="E-mail"
                placeholderTextColor={colors.primary}
                style={styles.input}
                onChangeText={setEmail}
                value={email}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!authBusy}
              />
            </FormField>
            <FormField label="Senha" required help="Use o botão de olho para conferir a senha digitada.">
              <PasswordInput
                placeholder="Senha"
                placeholderTextColor={colors.primary}
                style={styles.input}
                onChangeText={setPassword}
                value={password}
                editable={!authBusy}
              />
            </FormField>
          </View>

          <TouchableOpacity 
            style={[styles.buttonPrimary, authBusy && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={authBusy}
          >
            <Text style={styles.buttonText}>
              {isLoading ? 'Entrando...' : 'Entrar'}
            </Text>
          </TouchableOpacity>

          {GOOGLE_SOCIAL_ENABLED && <TouchableOpacity
            accessibilityRole="button" accessibilityLabel="Continuar com Google"
            accessibilityState={{ disabled: authBusy, busy: isGoogleLoading }}
            style={[styles.buttonGoogle, authBusy && styles.buttonDisabled]}
            disabled={authBusy} onPress={handleGoogleLogin}>
            <Text style={styles.buttonGoogleText}>{isGoogleLoading ? 'Conectando ao Google...' : 'Continuar com Google'}</Text>
          </TouchableOpacity>}

          <TouchableOpacity 
            style={styles.buttonForgot}
            onPress={() => setForgotPasswordModalVisible(true)}
            disabled={authBusy}
          >
            <Text style={styles.buttonForgotText}>Esqueci minha senha</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.buttonSecondary}
            onPress={() => navigation.navigate('Cadastro')}
            disabled={authBusy}
          >
            <Text style={styles.buttonSecondaryText}>Não tem conta? Cadastre-se</Text>
          </TouchableOpacity>
        </ScrollView>
        </ScreenSafeAreaView>
      </KeyboardAvoidingView>

      {/* Modal de "Esqueci Senha" */}
      <Modal
        visible={forgotPasswordModalVisible}
        animationType="slide"
        transparent={true}
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setForgotPasswordModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboardView}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ScrollView
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalTitle}>🔑 Recuperar Senha</Text>
                <Text style={styles.modalDescription}>
                  Digite seu e-mail para receber um link de recuperação de senha.
                </Text>

                <FormNotice allRequired />
                <FormField label="E-mail da conta" required help="Enviaremos o link de recuperação para este endereço. Confira também a caixa de spam.">
                  <TextInput
                    placeholder="Seu e-mail"
                    placeholderTextColor={colors.primary}
                    style={styles.input}
                    onChangeText={setResetEmail}
                    value={resetEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    editable={!isResettingPassword}
                  />
                </FormField>

                <TouchableOpacity
                  style={[styles.buttonPrimary, isResettingPassword && styles.buttonDisabled]}
                  onPress={handleForgotPassword}
                  disabled={isResettingPassword}
                >
                  <Text style={styles.buttonText}>
                    {isResettingPassword ? 'Enviando...' : 'Enviar Link de Recuperação'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.buttonSecondary}
                  onPress={() => {
                    setForgotPasswordModalVisible(false);
                    setResetEmail('');
                  }}
                  disabled={isResettingPassword}
                >
                  <Text style={[styles.buttonSecondaryText, styles.cancelText]}>Cancelar</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
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
  inner: {
    flexGrow: 1,
    flexShrink: 0,
    paddingHorizontal: 30,
    paddingTop: 20,
    paddingBottom: 48,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  logo: {
    width: 160,
    height: 160,
    maxWidth: '100%',
    flexShrink: 0,
    alignSelf: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: colors.surface,
    color: colors.text,
  },
  buttonPrimary: {
    backgroundColor: colors.action,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonGoogle: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  buttonGoogleText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonText: {
    color: colors.background,
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonForgot: {
    marginTop: 15,
    alignItems: 'center',
  },
  buttonForgotText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  buttonSecondary: {
    marginTop: 20,
    alignItems: 'center',
  },
  buttonSecondaryText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalKeyboardView: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingHorizontal: 30,
    paddingTop: 30,
  },
  modalScrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 15,
  },
  modalDescription: {
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 20,
  },
  cancelText: {
    color: colors.danger,
  },
});
