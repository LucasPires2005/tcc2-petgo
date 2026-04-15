import React, { createContext, useState } from 'react';
import { Alert } from 'react-native';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [animals, setAnimals] = useState([]);
  const BASE_URL = 'https://subpeltate-gene-nonpracticed.ngrok-free.dev';

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

  // FUNÇÃO: VIRAR MEMBRO PRO
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
        Alert.alert("Parabéns! 💎", "Você agora é um Membro PRO! Seu perfil ganhou destaque e novos recursos.");
        return true;
      } else {
        Alert.alert("Erro", data.error);
        return false;
      }
    } catch (e) { return false; }
  }

  // FUNÇÃO: DOAR PETCOINS
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

  // ... (Login, Register, Redeem - mantenha como já estavam no seu arquivo anterior)
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
      } else {
        Alert.alert("Saldo Insuficiente", data.error || "Erro ao processar resgate.");
        return null;
      }
    } catch (e) { Alert.alert("Erro", "Falha na conexão."); return null; }
  }

  async function login(email, password) {
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) { setUser(data); fetchAnimals(); }
      else { Alert.alert('Erro', data.error || 'Falha no login'); }
    } catch (error) { Alert.alert('Erro', 'Conexão falhou.'); }
  }

  async function register(name, email, password) {
    try {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json();
      if (response.ok) { Alert.alert('Sucesso', 'Conta criada!'); return true; }
      else { Alert.alert('Erro', data.error); return false; }
    } catch (error) { return false; }
  }

  async function updateAccount(newName, newEmail) {
    try {
      const res = await fetch(`${BASE_URL}/auth/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, name: newName, email: newEmail }),
      });
      const data = await res.json();
      if (res.ok) { setUser(data); Alert.alert("Sucesso", "Perfil atualizado!"); return true; }
    } catch (e) { return false; }
  }

  async function changePassword(currentPassword, newPassword) {
    try {
      const res = await fetch(`${BASE_URL}/auth/change-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, currentPassword, newPassword }),
      });
      if (res.ok) { Alert.alert('Sucesso', 'Senha alterada!'); return true; }
      else { Alert.alert('Erro', 'Senha atual incorreta'); return false; }
    } catch (e) { return false; }
  }

  return (
    <AuthContext.Provider value={{ 
      user, setUser, animals, fetchAnimals, refreshUserData, 
      login, register, updateAccount, changePassword, redeemReward, 
      buyPremium, donateCoins, // Adicionados ao Provider
      logout: () => setUser(null)
    }}>
      {children}
    </AuthContext.Provider>
  );
}