import React, { useContext, useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform,
  Alert
} from 'react-native';
import { AuthContext } from '../context/AuthContext';

export default function LoginScreen({ navigation }) {
  const { login } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = () => {
    if (!email || !password) {
      return Alert.alert('Atenção', 'Preencha todos os campos para entrar.');
    }

    // Validação do formato de e-mail (exige o @ e domínio válido)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return Alert.alert('E-mail Inválido', 'Por favor, insira um e-mail no formato correto (ex: usuario@email.com).');
    }

    login(email.trim(), password);
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>PetGo 🐾</Text>
        <Text style={styles.subtitle}>Ajude a salvar vidas no mapa</Text>

        <View style={styles.inputContainer}>
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
        </View>

        <TouchableOpacity 
          style={styles.buttonPrimary} 
          onPress={handleLogin}
        >
          <Text style={styles.buttonText}>Entrar</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.buttonSecondary} 
          onPress={() => navigation.navigate('Cadastro')}
        >
          <Text style={styles.buttonSecondaryText}>Não tem conta? Cadastre-se</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  inner: {
    flex: 1,
    padding: 30,
    justifyContent: 'center', // Corrigido para centralizar perfeitamente no meio da tela
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
  buttonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
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
});