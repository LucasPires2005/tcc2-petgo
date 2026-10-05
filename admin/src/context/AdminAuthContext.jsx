import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { configurationError, supabase } from '../lib/supabase';
import { fetchAdminIdentity } from '../lib/api';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [verification, setVerification] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [sessionError, setSessionError] = useState('');
  const currentSession = useRef(null);
  const currentAttempt = useRef(0);
  const verificationRequest = useRef(null);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    let active = true;
    let receivedEvent = false;
    const restoreTimeout = setTimeout(() => {
      if (!active || receivedEvent) return;
      setSessionError('Não foi possível restaurar sua sessão. Entre novamente.');
      setReady(true);
    }, 15000);
    function restoreSession(nextSession) {
      clearTimeout(restoreTimeout);
      if (currentSession.current?.user?.id !== nextSession?.user?.id || !nextSession?.access_token) {
        verificationRequest.current?.abort();
        setVerification(null);
      }
      currentSession.current = nextSession;
      setSession(nextSession);
      setSessionError('');
      setReady(true);
    }
    // Callback síncrono: evita bloquear o mecanismo interno do Supabase Auth.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      receivedEvent = true;
      restoreSession(nextSession);
    });
    Promise.resolve().then(() => supabase.auth.getSession()).then(({ data, error }) => {
      if (!active || receivedEvent) return;
      if (error) throw error;
      restoreSession(data.session);
    }).catch(() => {
      if (!active || receivedEvent) return;
      clearTimeout(restoreTimeout);
      setSessionError('Não foi possível restaurar sua sessão. Entre novamente.');
      setReady(true);
    });
    return () => { active = false; clearTimeout(restoreTimeout); subscription.unsubscribe(); };
  }, []);

  const token = session?.access_token;
  const userId = session?.user?.id;
  useEffect(() => {
    if (!token) { setVerification(null); return; }
    if (!userId) {
      setVerification({ token, userId, attempt, error: 'Sessão inválida. Entre novamente.' });
      return;
    }
    const controller = new AbortController();
    verificationRequest.current = controller;
    // A permissão já verificada permanece em memória durante a renovação do
    // token da mesma conta. Navegar entre rotas não inicia esta consulta.
    async function verifyAccess() {
      let result;
      try {
        const admin = await fetchAdminIdentity(token, controller.signal);
        if (admin?.id !== userId) throw new Error('O servidor não retornou uma autorização válida.');
        result = { admin };
      } catch (error) {
        result = { error: error?.message || 'Não foi possível verificar o acesso administrativo. Tente novamente.' };
      } finally {
        if (!controller.signal.aborted && currentSession.current?.access_token === token
            && currentSession.current?.user?.id === userId && currentAttempt.current === attempt) {
          setVerification({ token, userId, attempt, ...result });
        }
        if (verificationRequest.current === controller) verificationRequest.current = null;
      }
    }
    verifyAccess();
    return () => {
      controller.abort();
      if (verificationRequest.current === controller) verificationRequest.current = null;
    };
  }, [token, userId, attempt]);

  const current = token && verification?.userId === userId && verification?.attempt === attempt ? verification : null;
  const loading = !ready || Boolean(token && !current);
  const invalidateAccess = useCallback((message) => {
    // Uma resposta atrasada da sessão anterior não pode bloquear a conta atual.
    if (!token || currentSession.current?.access_token !== token
        || currentSession.current?.user?.id !== userId || currentAttempt.current !== attempt) return;
    verificationRequest.current?.abort();
    setVerification({ token, userId, attempt, error: message || 'Seu acesso administrativo não está disponível.' });
  }, [token, userId, attempt]);

  const retry = useCallback(() => {
    currentAttempt.current += 1;
    verificationRequest.current?.abort();
    setAttempt(currentAttempt.current);
  }, []);

  async function signIn(email, password) {
    if (!supabase) throw new Error(configurationError);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      throw new Error(error.code === 'email_not_confirmed'
        ? 'Confirme seu e-mail antes de entrar.'
        : error.status === 429 ? 'Muitas tentativas. Aguarde antes de tentar novamente.'
        : 'Não foi possível entrar. Confira o e-mail, a senha e sua conexão.');
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw new Error('Não foi possível sair. Tente novamente.');
    verificationRequest.current?.abort();
    currentSession.current = null;
    setSession(null);
    setVerification(null);
  }

  return (
    <AdminAuthContext.Provider value={{
      admin: current?.admin || null, hasSession: Boolean(token), loading, accessToken: token,
      error: configurationError || current?.error || sessionError,
      configurationError, signIn, signOut, retry,
      invalidateAccess
    }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => useContext(AdminAuthContext);
