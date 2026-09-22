import React, { createContext, useState, useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { performActivation } from '../services/subscriptionApi';
import { mobileFetch, setMobileSession, onMobileSessionInvalid, API_BASE_URL } from '../services/mobileApi';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [animals, setAnimals] = useState([]);
  const BASE_URL = API_BASE_URL;
  const profileVersion = useRef(0);
  const refreshRef = useRef(null);
  refreshRef.current = refreshUserData;
  useEffect(() => {
    if (!user?.id) return;
    const timer = setInterval(() => { if (AppState.currentState === 'active') refreshRef.current(); }, 60000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') refreshRef.current(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [user?.id]);
  useEffect(() => onMobileSessionInvalid((message) => {
    setUser(null); setAnimals([]);
    Alert.alert('Acesso ao PetGo', message);
  }), []);
  useEffect(() => { if (!user) setMobileSession(null); }, [user]);

  async function fetchAnimals() {
    try {
      const res = await mobileFetch(`${BASE_URL}/animals`, { headers: { 'ngrok-skip-browser-warning': 'true' } });
      const data = await res.json();
      setAnimals(Array.isArray(data) ? data : []);
    } catch (e) { console.log("Erro de sincronização"); }
  }

  async function refreshUserData() {
    if (!user) return;
    const version = ++profileVersion.current;
    try {
      const res = await mobileFetch(`${BASE_URL}/auth/update-status/${user.id}`, { headers: { 'ngrok-skip-browser-warning': 'true' } });
      const data = await res.json();
      if (res.ok && version === profileVersion.current) setUser(data);
    } catch (e) { console.log("Erro nas moedas"); }
  }

  // ADIÇÃO: Credita PetCoins aplicando o multiplicador do plano do usuário
  async function awardCoins(baseAmount = 10) {
    if (!user) return false;
    try {
      const response = await mobileFetch(`${BASE_URL}/auth/add-coins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, baseAmount }),
      });
      const data = await response.json();
      if (response.ok) {
        setUser({ ...user, coins: data.newBalance });
        Alert.alert("PetCoins Recebidas! 🪙", data.message);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  async function buyPremium() {
    if (!user) return false;
    ++profileVersion.current;
    try {
      const { response, data } = await performActivation(user.id, 'upgrade-pro');
      if (response.ok) {
        ++profileVersion.current;
        setUser(data.user);
        Alert.alert("Parabéns! 💎", "Você agora é um Membro PRO!");
        return true;
      }
      // A invalidação de sessão já exibe seu próprio aviso no mobileApi.
      if (!['SESSION_INVALID', 'ACCOUNT_BANNED'].includes(data.code)) {
        Alert.alert(
          'Não foi possível ativar o PRO',
          data.error || 'Verifique se você possui as 50 PetCoins necessárias e tente novamente.'
        );
      }
      return false;
    } catch (e) {
      Alert.alert('Falha ao ativar o PRO', `${e.message || 'Não foi possível concluir a solicitação.'} Confira sua conexão e tente novamente.`);
      return false;
    }
  }

  async function subscribeToPlan(planTier) {
    if (!user) return false;
    ++profileVersion.current;
    try {
      const { response, data } = await performActivation(user.id, 'subscribe-plan', { planTier });
      if (response.ok) {
        ++profileVersion.current;
        setUser(data.user);
        Alert.alert("Sucesso! 🎉", data.message);
        return true;
      }
      if (!['SESSION_INVALID', 'ACCOUNT_BANNED'].includes(data.code)) Alert.alert('Erro', data.error || 'Falha ao processar assinatura.');
      return false;
    } catch (e) { 
      Alert.alert("Erro", e.message || "Falha ao processar assinatura.");
      return false; 
    }
  }

  async function cancelSubscription(kind) {
    if (!user) return false;
    ++profileVersion.current;
    try {
      const response = await mobileFetch(`${BASE_URL}/auth/cancel-subscription`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind })
      });
      const data = await response.json();
      if (!response.ok) {
        if (!['SESSION_INVALID', 'ACCOUNT_BANNED'].includes(data.code)) Alert.alert('Não foi possível cancelar', data.error || 'Tente novamente.');
        return false;
      }
      ++profileVersion.current;
      setUser(data.user);
      Alert.alert('Assinatura cancelada', 'Seu acesso continua até a data de vencimento exibida.');
      return true;
    } catch (error) {
      Alert.alert('Falha na conexão', 'Atualize o perfil para conferir o cancelamento ou tente novamente.');
      return false;
    }
  }

  async function donateCoins(amount) {
    try {
      const response = await mobileFetch(`${BASE_URL}/auth/donate`, {
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
      const response = await mobileFetch(`${BASE_URL}/auth/redeem`, {
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
        const { accessToken, ...profile } = data;
        if (!accessToken) {
          Alert.alert('Atualização necessária', 'O servidor ainda não disponibilizou a sessão segura.');
          return;
        }
        setMobileSession(accessToken);
        setUser(profile);
        fetchAnimals(); 
      } else { 
        Alert.alert('Erro', data.error || 'E-mail ou senha incorretos'); 
      }
    } catch (error) { Alert.alert('Erro', 'Conexão falhou.'); }
  }

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
        Alert.alert('Sucesso 🎉', 'Conta criada! Verifique seu e-mail para ativar a conta.'); 
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

  // NOVA FUNÇÃO: Enviar link de confirmação de e-mail
  async function resendConfirmationEmail(email) {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const response = await fetch(`${BASE_URL}/auth/resend-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert('E-mail Reenviado ✉️', 'Verifique sua caixa de entrada ou spam.');
        return true;
      } else {
        Alert.alert('Erro', data.error || 'Falha ao reenviar e-mail.');
        return false;
      }
    } catch (error) {
      Alert.alert('Erro', 'Falha na conexão.');
      return false;
    }
  }

  // NOVA FUNÇÃO: Solicitar recuperação de senha
  async function requestPasswordReset(email) {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const response = await fetch(`${BASE_URL}/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert(
          'Solicitação recebida ✉️',
          data.message || 'Se o e-mail estiver cadastrado, você receberá o link de recuperação.'
        );
        return true;
      } else {
        Alert.alert('Erro', data.error || 'E-mail não encontrado.');
        return false;
      }
    } catch (error) {
      Alert.alert('Erro', 'Falha na conexão.');
      return false;
    }
  }

  // NOVA FUNÇÃO: Confirmar novo token de senha (após clicar no link do e-mail)
  async function resetPasswordWithToken(token, newPassword) {
    try {
      const response = await fetch(`${BASE_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await response.json();
      if (response.ok) {
        return true;
      } else {
        Alert.alert('Erro', data.error || 'Token inválido ou expirado.');
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
      const res = await mobileFetch(`${BASE_URL}/auth/update`, {
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
      const res = await mobileFetch(`${BASE_URL}/auth/change-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, currentPassword, newPassword }),
      });
      return res.ok;
    } catch (e) { return false; }
  }

  async function deleteAccount() {
    if (!user) return false;
    try {
      const response = await mobileFetch(`${BASE_URL}/auth/delete/${user.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        setUser(null);
        return true;
      } else {
        Alert.alert('Erro', 'Não foi possível excluir a conta. Tente novamente.');
        return false;
      }
    } catch (e) {
      Alert.alert('Erro', 'Falha na conexão com o servidor.');
      return false;
    }
  }

  return (
    <AuthContext.Provider value={{ 
      user, setUser, animals, fetchAnimals, refreshUserData, 
      login, register, updateAccount, changePassword, redeemReward, 
      buyPremium, donateCoins, subscribeToPlan, cancelSubscription, deleteAccount, awardCoins,
      resendConfirmationEmail, requestPasswordReset, resetPasswordWithToken,
      logout: () => { setMobileSession(null); setUser(null); setAnimals([]); }
    }}>
      {children}
    </AuthContext.Provider>
  );
}
