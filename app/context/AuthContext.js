import React, { createContext, useState } from 'react';
import { Alert } from 'react-native';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [animals, setAnimals] = useState([]);
  const BASE_URL = 'https://tcc-2026-1-e-2-petgo.onrender.com';

  async function fetchAnimals() {
    try {
      const res = await fetch(`${BASE_URL}/animals`, { headers: { 'ngrok-skip-browser-warning': 'true' } });
      const data = await res.json();
      setAnimals(Array.isArray(data) ? data : []);
    } catch (e) { console.log("Erro de sincronização"); }
  }

  async function refreshUserData() {
    if (!user) return;
    try {
      const res = await fetch(`${BASE_URL}/auth/update-status/${user.id}`, { headers: { 'ngrok-skip-browser-warning': 'true' } });
      const data = await res.json();
      if (res.ok) setUser(data);
    } catch (e) { console.log("Erro nas moedas"); }
  }

  async function buyPremium() {
    try {
      const response = await fetch(`${BASE_URL}/auth/upgrade-pro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await response.json();
      if (response.ok) {
        setUser(data.user);
        Alert.alert("Parabéns! 💎", "Você agora é um Membro PRO!");
        return true;
      }
      return false;
    } catch (e) { return false; }
  }

  // ADIÇÃO: Função para o usuário assinar um dos novos planos
  async function subscribeToPlan(planTier) {
    try {
      const response = await fetch(`${BASE_URL}/auth/subscribe-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, planTier }),
      });
      const data = await response.json();
      if (response.ok) {
        setUser(data.user);
        Alert.alert("Sucesso! 🎉", data.message);
        return true;
      }
      return false;
    } catch (e) { 
      Alert.alert("Erro", "Falha ao processar assinatura.");
      return false; 
    }
  }

  async function donateCoins(amount) {
    try {
      const response = await fetch(`${BASE_URL}/auth/donate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, amount }),
      });
      const data = await response.json();
      if (response.ok) {
        setUser({ ...user, coins: data.newBalance });
        return true;
      }
      return false;
    } catch (e) { return false; }
  }

  async function redeemReward(cost) {
    try {
      const response = await fetch(`${BASE_URL}/auth/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, cost }),
      });
      const data = await response.json();
      if (response.ok) {
        setUser({ ...user, coins: data.newBalance });
        return data.couponCode;
      }
      return null;
    } catch (e) { return null; }
  }

  async function login(email, password) {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      const data = await res.json();
      if (res.ok) { 
        setUser(data); 
        fetchAnimals(); 
      } else { 
        Alert.alert('Erro', data.error || 'E-mail ou senha incorretos'); 
      }
    } catch (error) { Alert.alert('Erro', 'Conexão falhou.'); }
  }

  // ADIÇÃO: Cadastro com aviso de e-mail já existente
  async function register(name, email, password) {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: cleanEmail, password }),
      });
      const data = await response.json();
      if (response.ok) { 
        Alert.alert('Sucesso 🎉', 'Conta criada!'); 
        return true; 
      } else { 
        Alert.alert('Erro no Cadastro', data.error || 'Falha ao criar conta.');
        return false; 
      }
    } catch (error) { 
      Alert.alert('Erro', 'Falha na conexão.');
      return false; 
    }
  }

  async function updateAccount(newName, newEmail) {
    const cleanEmail = newEmail.trim().toLowerCase();
    try {
      const res = await fetch(`${BASE_URL}/auth/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, name: newName, email: cleanEmail }),
      });
      const data = await res.json();
      if (res.ok) { 
        setUser(data); 
        Alert.alert("Sucesso", "Perfil atualizado com sucesso!");
        return true; 
      } else {
        Alert.alert("Erro ao Atualizar", data.error || "Falha ao atualizar perfil.");
        return false;
      }
    } catch (e) { 
      Alert.alert("Erro", "Falha na conexão com o servidor.");
      return false; 
    }
  }

  async function changePassword(currentPassword, newPassword) {
    try {
      const res = await fetch(`${BASE_URL}/auth/change-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, currentPassword, newPassword }),
      });
      return res.ok;
    } catch (e) { return false; }
  }

  return (
    <AuthContext.Provider value={{ 
      user, setUser, animals, fetchAnimals, refreshUserData, 
      login, register, updateAccount, changePassword, redeemReward, 
      buyPremium, donateCoins, subscribeToPlan, // <-- ADICIONADO AQUI
      logout: () => setUser(null)
    }}>
      {children}
    </AuthContext.Provider>
  );
}