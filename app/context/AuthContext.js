import React, { createContext, useState } from 'react';
import { Alert } from 'react-native';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [animals, setAnimals] = useState([]);
  
  const BASE_URL = 'https://subpeltate-gene-nonpracticed.ngrok-free.dev';

  // BUSCA GLOBAL DE ANIMAIS
  async function fetchAnimals() {
    try {
      const res = await fetch(`${BASE_URL}/animals`, { headers: { 'ngrok-skip-browser-warning': 'true' } });
      const data = await res.json();
      setAnimals(Array.isArray(data) ? data : []);
    } catch (e) { console.log("Erro de sincronização"); }
  }

  // ATUALIZA MOEDAS E STATUS
  async function refreshUserData() {
    if (!user) return;
    try {
      const res = await fetch(`${BASE_URL}/auth/update-status/${user.id}`, { headers: { 'ngrok-skip-browser-warning': 'true' } });
      const data = await res.json();
      if (res.ok) setUser(data);
    } catch (e) { console.log("Erro nas moedas"); }
  }

  // LOGIN
  async function login(email, password) {
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) { 
        setUser(data); 
        fetchAnimals(); 
      } else {
        Alert.alert('Erro', data.error || 'Falha no login');
      }
    } catch (error) { Alert.alert('Erro', 'Conexão falhou.'); }
  }

  // CADASTRO (O QUE ESTAVA FALTANDO!)
  async function register(name, email, password) {
    try {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        Alert.alert('Sucesso', 'Conta criada com sucesso! Agora faça seu login.');
        return true; // Retorna true para a tela saber que deu certo
      } else {
        Alert.alert('Erro', data.error || 'Não foi possível cadastrar');
        return false;
      }
    } catch (error) {
      Alert.alert('Erro', 'Servidor offline ou erro de rede.');
      return false;
    }
  }

  // ATUALIZAR CONTA
  async function updateAccount(newName, newEmail) {
    try {
      const res = await fetch(`${BASE_URL}/auth/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, name: newName, email: newEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data);
        Alert.alert("Sucesso", "Perfil atualizado!");
        return true;
      }
    } catch (e) { return false; }
  }

  // MUDAR SENHA
  async function changePassword(currentPassword, newPassword) {
    try {
      const res = await fetch(`${BASE_URL}/auth/change-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, currentPassword, newPassword }),
      });
      if (res.ok) { 
        Alert.alert('Sucesso', 'Senha alterada!'); 
        return true; 
      } else { 
        Alert.alert('Erro', 'Senha atual incorreta'); 
        return false; 
      }
    } catch (e) { return false; }
  }

  return (
    <AuthContext.Provider value={{ 
      user, setUser, animals, fetchAnimals, refreshUserData, 
      login, register, updateAccount, changePassword,
      logout: () => setUser(null)
    }}>
      {children}
    </AuthContext.Provider>
  );
}