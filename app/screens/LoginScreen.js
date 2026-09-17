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
  ScrollView
} from 'react-native';
import { AuthContext } from '../context/AuthContext';

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
          <Text style={styles.logo}>PetGo 🐾</Text>
          <Text style={styles.subtitle}>Ajude a salvar vidas no mapa</Text>

          <View style={styles.inputContainer}>
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
              placeholder="Senha" 
              placeholderTextColor="#999"
              style={styles.input} 
              secureTextEntry 
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
                  placeholderTextColor="#999"
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
                  <Text style={styles.buttonSecondaryText}>Cancelar</Text>
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
    backgroundColor: '#FFF',
  },
  inner: {
    flexGrow: 1,
    padding: 30,
    paddingBottom: 48,
    justifyContent: 'center',
    alignItems: 'stretch',
  },
  logo: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#4A90E2',
    textAlign: 'center',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#F5F5F5',
    padding: 18,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#EEE',
    color: '#333',
  },
  buttonPrimary: {
    backgroundColor: '#4A90E2',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
  },
  buttonDisabled: {
    backgroundColor: '#B0C4E2',
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonForgot: {
    marginTop: 15,
    alignItems: 'center',
  },
  buttonForgotText: {
    color: '#E74C3C',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonSecondary: {
    marginTop: 20,
    alignItems: 'center',
  },
  buttonSecondaryText: {
    color: '#4A90E2',
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
    backgroundColor: '#FFF',
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
    color: '#4A90E2',
    textAlign: 'center',
    marginBottom: 15,
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 25,
    lineHeight: 20,
  },
});
