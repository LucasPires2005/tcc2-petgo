import React, { createContext, useState } from 'react';
import { Alert } from 'react-native';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const BASE_URL = 'https://subpeltate-gene-nonpracticed.ngrok-free.dev/auth';

  // Função de Login Real
  async function login(email, password) {
    try {
      const response = await fetch(`${BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data); // Salva o usuário (id, email, name) no estado
      } else {
        Alert.alert('Erro no Login', data.error || 'Credenciais inválidas');
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível conectar ao servidor.');
    }
  }

  // Função de Cadastro Real
  async function register(name, email, password) {
    try {
      const response = await fetch(`${BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert('Sucesso', 'Conta criada! Agora faça seu login.');
        return true; // Para avisar a tela de cadastro que deu certo
      } else {
        Alert.alert('Erro', data.error || 'Falha ao cadastrar');
        return false;
      }
    } catch (error) {
      Alert.alert('Erro', 'Servidor offline.');
      return false;
    }
  }

  function logout() {
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}