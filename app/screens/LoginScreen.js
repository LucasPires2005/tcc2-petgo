import React, { useContext, useState } from 'react';
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
import { AuthContext } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';
import { colors } from '../theme/colors';

export default function LoginScreen({ navigation }) {
  const { login, requestPasswordReset } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [forgotPasswordModalVisible, setForgotPasswordModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      return Alert.alert('Atenção', 'Preencha todos os campos para entrar.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return Alert.alert('E-mail Inválido', 'Por favor, insira um e-mail no formato correto (ex: usuario@email.com).');
    }

    setIsLoading(true);
    await login(email.trim(), password);
    setIsLoading(false);
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
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.inner}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <Image source={require('../assets/LogoPetGo.png')} style={styles.logo}
            resizeMode="contain" accessible accessibilityLabel="PetGo — Conecta, ajuda, transforma" />
          <Text style={styles.subtitle}>Ajude a salvar vidas no mapa</Text>

          <View style={styles.inputContainer}>
            <TextInput 
              placeholder="E-mail" 
              placeholderTextColor={colors.primary}
              style={styles.input} 
              onChangeText={setEmail}
              value={email}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!isLoading}
            />
            <PasswordInput
              placeholder="Senha" 
              placeholderTextColor={colors.primary}
              style={styles.input} 
              onChangeText={setPassword}
              value={password}
              editable={!isLoading}
            />
          </View>

          <TouchableOpacity 
            style={[styles.buttonPrimary, isLoading && styles.buttonDisabled]} 
            onPress={handleLogin}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? 'Entrando...' : 'Entrar'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.buttonForgot}
            onPress={() => setForgotPasswordModalVisible(true)}
            disabled={isLoading}
          >
            <Text style={styles.buttonForgotText}>Esqueci minha senha</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.buttonSecondary}
            onPress={() => navigation.navigate('Cadastro')}
            disabled={isLoading}
          >
            <Text style={styles.buttonSecondaryText}>Não tem conta? Cadastre-se</Text>
          </TouchableOpacity>
        </ScrollView>
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
  inner: {
    flexGrow: 1,
    paddingHorizontal: 30,
    paddingTop: 20,
    paddingBottom: 24,
    justifyContent: 'center',
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
