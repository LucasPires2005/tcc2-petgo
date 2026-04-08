import React, { createContext, useState } from 'react';
import { Alert } from 'react-native';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const BASE_URL = 'https://subpeltate-gene-nonpracticed.ngrok-free.dev/auth';

  async function login(email, password) {
    try {
      const response = await fetch(`${BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (response.ok) setUser(data);
      else Alert.alert('Erro', data.error || 'Credenciais inválidas');
    } catch (error) { Alert.alert('Erro', 'Conexão falhou.'); }
  }

  async function register(name, email, password) {
    try {
      const response = await fetch(`${BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (response.ok) {
        Alert.alert('Sucesso', 'Conta criada!');
        return true;
      } else {
        const data = await response.json();
        Alert.alert('Erro', data.error);
        return false;
      }
    } catch (error) { Alert.alert('Erro', 'Servidor offline.'); return false; }
  }

  async function updateAccount(newName, newEmail) {
    try {
      const response = await fetch(`${BASE_URL}/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, name: newName, email: newEmail }),
      });
      if (response.ok) {
        setUser({ ...user, name: newName, email: newEmail });
        Alert.alert('Sucesso', 'Dados atualizados!');
        return true;
      }
    } catch (e) { Alert.alert('Erro', 'Falha ao atualizar'); }
    return false;
  }

  // NOVA FUNÇÃO
  async function changePassword(currentPassword, newPassword) {
    try {
      const response = await fetch(`${BASE_URL}/change-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, currentPassword, newPassword }),
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert('Sucesso', 'Senha alterada!');
        return true;
      } else {
        Alert.alert('Erro', data.error || 'Senha atual incorreta');
        return false;
      }
    } catch (e) { Alert.alert('Erro', 'Falha na conexão'); return false; }
  }

  async function deleteAccount() {
    try {
      const response = await fetch(`${BASE_URL}/delete/${user.id}`, { method: 'DELETE' });
      if (response.ok) {
        setUser(null);
        Alert.alert('Conta Excluída', 'Até logo! 🐾');
      }
    } catch (e) { Alert.alert('Erro', 'Falha ao excluir'); }
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout: () => setUser(null), updateAccount, deleteAccount, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}