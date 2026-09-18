import { createContext, useContext, useEffect, useState } from 'react';
import { configurationError, supabase } from '../lib/supabase';
import { fetchAdminIdentity } from '../lib/api';

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [verification, setVerification] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    let active = true;
    let receivedEvent = false;
    // Callback síncrono: evita bloquear o mecanismo interno do Supabase Auth.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      receivedEvent = true;
      setSession(nextSession);
      setSessionError('');
      setReady(true);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || receivedEvent) return;
      setSession(data.session);
      if (error) setSessionError('Não foi possível restaurar sua sessão. Entre novamente.');
      setReady(true);
    }).catch(() => {
      if (!active || receivedEvent) return;
      setSessionError('Não foi possível restaurar sua sessão. Entre novamente.');
      setReady(true);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const token = session?.access_token;
  useEffect(() => {
    let active = true;
    setVerification(null);
    if (token) {
      fetchAdminIdentity(token).then((admin) => {
        if (active) setVerification({ token, attempt, admin });
      }).catch((error) => {
        if (active) setVerification({ token, attempt, error: error.message });
      });
    }
    return () => { active = false; };
  }, [token, attempt]);

  const current = verification?.token === token && verification?.attempt === attempt ? verification : null;
  const loading = !ready || Boolean(token && !current);

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
    setSession(null);
    setVerification(null);
  }

  return (
    <AdminAuthContext.Provider value={{
      admin: current?.admin || null, hasSession: Boolean(token), loading,
      error: configurationError || current?.error || sessionError,
      configurationError, signIn, signOut, retry: () => setAttempt((value) => value + 1)
    }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => useContext(AdminAuthContext);
