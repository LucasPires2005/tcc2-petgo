import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const apiUrl = import.meta.env.VITE_API_URL?.trim();

function isHttpUrl(value) {
  try { return ['https:', 'http:'].includes(new URL(value).protocol); }
  catch { return false; }
}

export const configurationError = !url || !key || !apiUrl
  ? 'O painel ainda não foi configurado. Preencha as variáveis indicadas em admin/.env.example e reinicie o Vite.'
  : !isHttpUrl(url) || !isHttpUrl(apiUrl)
  ? 'Confira as URLs do Supabase e da API em admin/.env.local; devem começar com https:// ou http://.'
  : key.startsWith('sb_secret_')
  ? 'Use a chave pública publishable no painel. Chaves secretas pertencem apenas ao servidor.'
  : '';

export const supabase = configurationError ? null : createClient(url, key, {
  auth: {
    storageKey: 'petgo-admin-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

export const apiBaseUrl = apiUrl?.replace(/\/+$/, '');
