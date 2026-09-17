import React, { useContext, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { AuthContext } from '../context/AuthContext';

export default function ResetPasswordScreen({ route, navigation }) {
  const { user, logout, resetPasswordWithToken } = useContext(AuthContext);
  const token = route.params?.token;

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleResetPassword = async () => {
    if (!token) {
      return Alert.alert(
        'Link inválido',
        'Não foi possível identificar sua recuperação de senha. Solicite um novo link.'
      );
    }

    if (!newPassword || !confirmPassword) {
      return Alert.alert(
        'Atenção',
        'Preencha a nova senha e a confirmação de senha.'
      );
    }

    if (newPassword.length < 6) {
      return Alert.alert(
        'Senha fraca',
        'A nova senha deve ter pelo menos 6 caracteres.'
      );
    }

    if (newPassword !== confirmPassword) {
      return Alert.alert(
        'Senhas diferentes',
        'As senhas não coincidem. Tente novamente.'
      );
    }

    setIsLoading(true);
    const success = await resetPasswordWithToken(token, newPassword);
    setIsLoading(false);

    if (success) {
      setNewPassword('');
      setConfirmPassword('');

      Alert.alert(
        'Senha alterada',
        'Sua senha foi redefinida com sucesso. Entre novamente com a nova senha.',
        [
          {
            text: 'Ir para o login',
            onPress: () => {
              if (user) {
                logout();
                return;
              }

              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }]
              });
            }
          }
        ],
        { cancelable: false }
      );
    }
  };

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
        <View style={styles.card}>
          <Text style={styles.logo}>PetGo 🐾</Text>
          <Text style={styles.title}>Redefinir senha</Text>
          <Text style={styles.description}>
            Crie uma nova senha para acessar sua conta.
          </Text>

          {!token && (
            <Text style={styles.warning}>
              Este link é inválido ou expirou. Volte à tela de login e solicite
              uma nova recuperação de senha.
            </Text>
          )}

          <TextInput
            placeholder="Nova senha"
            placeholderTextColor="#999"
            style={styles.input}
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
            editable={!isLoading && !!token}
          />

          <TextInput
            placeholder="Confirmar nova senha"
            placeholderTextColor="#999"
            style={styles.input}
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!isLoading && !!token}
          />

          <TouchableOpacity
            style={[
              styles.button,
              (!token || isLoading) && styles.buttonDisabled
            ]}
            onPress={handleResetPassword}
            disabled={!token || isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? 'Salvando...' : 'Salvar nova senha'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.navigate('Login')}
            disabled={isLoading}
          >
            <Text style={styles.backButtonText}>Voltar ao login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF'
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 30,
    paddingBottom: 48
  },
  card: {
    width: '100%'
  },
  logo: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#4A90E2',
    textAlign: 'center',
    marginBottom: 15
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30
  },
  warning: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFE69C',
    borderWidth: 1,
    borderRadius: 10,
    color: '#664D03',
    fontSize: 14,
    lineHeight: 20,
    padding: 15,
    marginBottom: 20,
    textAlign: 'center'
  },
  input: {
    backgroundColor: '#F5F5F5',
    padding: 18,
    borderRadius: 12,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#EEE',
    color: '#333'
  },
  button: {
    backgroundColor: '#4A90E2',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 5
  },
  buttonDisabled: {
    backgroundColor: '#B0C4E2',
    opacity: 0.7
  },
  buttonText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: 'bold'
  },
  backButton: {
    marginTop: 22,
    alignItems: 'center'
  },
  backButtonText: {
    color: '#4A90E2',
    fontSize: 15,
    fontWeight: '600'
  }
});
