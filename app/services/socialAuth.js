import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { API_BASE_URL } from './mobileApi';

export const SOCIAL_CALLBACK = 'petgo://auth/social-callback';
export const GOOGLE_SOCIAL_ENABLED = process.env.EXPO_PUBLIC_GOOGLE_LOGIN_ENABLED === 'true';

// Tokens, CPF e o verifier nunca vão para disco, parâmetros de navegação ou logs.
let generation = 0;
let inFlight = false;
let pendingRegistration = null;
let requestController = null;
let browserOpen = false;

function socialError(message, code) {
  return Object.assign(new Error(message), { code });
}

function ensureCurrent(expected) {
  if (expected !== generation) throw socialError('O acesso com Google foi cancelado.', 'SOCIAL_CANCELLED');
}

export function captureSocialLoginGuard() {
  const expected = generation;
  return () => ensureCurrent(expected);
}

function publicConfiguration() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  if (!/^https:\/\/(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}\/?$/.test(url)
    || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw socialError('O acesso com Google ainda não foi configurado neste aplicativo. Use e-mail e senha.', 'SOCIAL_CONFIGURATION');
  }
  return { url: url.replace(/\/$/, ''), key };
}

export function socialCodeFromCallback(value) {
  // Comparação exata não depende do parser de custom schemes do Android/iOS.
  if (typeof value !== 'string' || value.split('?')[0] !== SOCIAL_CALLBACK || value.includes('#')) {
    throw socialError('O retorno do Google não é válido. Inicie o acesso novamente.', 'SOCIAL_CALLBACK_INVALID');
  }
  const params = new Map();
  try {
    for (const pair of value.slice(SOCIAL_CALLBACK.length + 1).split('&')) {
      const separator = pair.indexOf('=');
      const key = decodeURIComponent((separator < 0 ? pair : pair.slice(0, separator)).replace(/\+/g, ' '));
      const item = decodeURIComponent((separator < 0 ? '' : pair.slice(separator + 1)).replace(/\+/g, ' '));
      params.set(key, [...(params.get(key) || []), item]);
    }
  } catch (_) {
    throw socialError('O retorno do Google não é válido. Inicie o acesso novamente.', 'SOCIAL_CALLBACK_INVALID');
  }
  if (params.has('access_token') || params.has('refresh_token')) {
    throw socialError('O retorno do Google não é válido. Inicie o acesso novamente.', 'SOCIAL_CALLBACK_INVALID');
  }
  if (params.has('error')) {
    throw socialError('O Google não autorizou o acesso. Você pode tentar novamente ou usar e-mail e senha.', 'SOCIAL_PROVIDER_ERROR');
  }
  const codes = params.get('code') || [];
  if (codes.length !== 1 || !codes[0] || codes[0].length > 1024) {
    throw socialError('O retorno do Google não contém uma autorização válida.', 'SOCIAL_CALLBACK_INVALID');
  }
  return codes[0];
}

async function jsonRequest(url, options, expected, fallback) {
  ensureCurrent(expected);
  const controller = new AbortController();
  requestController = controller;
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    ensureCurrent(expected);
    if (!response.ok) {
      // Mensagens do provedor não são expostas; as mensagens do PetGo são amigáveis.
      const error = socialError(url.startsWith(`${API_BASE_URL}/auth/`) ? data.error || fallback : fallback,
        data.code || 'SOCIAL_REQUEST_FAILED');
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    ensureCurrent(expected);
    if (controller.signal.aborted || error.name === 'AbortError') {
      throw socialError('A conexão demorou mais que o esperado. Confira sua internet e tente novamente.', 'SOCIAL_TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (requestController === controller) requestController = null;
  }
}

function petgoResult(data) {
  if (data.requiresOnboarding === true) {
    if (data.accessToken) throw socialError('O servidor retornou uma sessão inesperada. Tente novamente.', 'SOCIAL_RESPONSE_INVALID');
    return { requiresOnboarding: true };
  }
  if (!Number.isInteger(data.id) || data.id < 1 || typeof data.accessToken !== 'string' || !data.accessToken) {
    throw socialError('O servidor não confirmou sua sessão PetGo. Tente novamente.', 'SOCIAL_RESPONSE_INVALID');
  }
  const result = { accessToken: data.accessToken };
  const fields = ['id', 'name', 'email', 'coins', 'is_premium', 'plan_tier', 'email_confirmed', 'salvos',
    'subscription_start_date', 'subscription_end_date', 'subscription_status', 'subscription_cancelled_at',
    'premium_start_date', 'premium_end_date', 'premium_status', 'premium_cancelled_at'];
  for (const field of fields) if (Object.prototype.hasOwnProperty.call(data, field)) result[field] = data[field];
  return result;
}

async function petgoRequest(route, token, body, expected) {
  const data = await jsonRequest(`${API_BASE_URL}/auth/${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  }, expected, 'Não foi possível concluir o acesso com Google. Tente novamente.');
  return petgoResult(data);
}

export function hasPendingSocialRegistration() {
  if (pendingRegistration && pendingRegistration.expiresAt > Date.now()) return true;
  pendingRegistration = null;
  return false;
}

export function cancelSocialLogin() {
  ++generation;
  pendingRegistration = null;
  requestController?.abort();
  if (browserOpen) {
    try { WebBrowser.dismissAuthSession(); } catch (_) { /* O retorno tardio será ignorado. */ }
  }
}

export async function beginGoogleLogin() {
  if (inFlight) throw socialError('Um acesso com Google já está em andamento.', 'SOCIAL_BUSY');
  if (!GOOGLE_SOCIAL_ENABLED) throw socialError('O acesso com Google ainda não está disponível.', 'SOCIAL_DISABLED');
  if (Platform.OS === 'web' || Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo') {
    throw socialError('Para testar o Google, use um APK ou development build do PetGo. No Expo Go, entre com e-mail e senha.', 'SOCIAL_NATIVE_BUILD_REQUIRED');
  }
  const configuration = publicConfiguration();
  const expected = ++generation;
  pendingRegistration = null;
  inFlight = true;
  let request;
  try {
    const redirectUri = AuthSession.makeRedirectUri({ native: SOCIAL_CALLBACK });
    if (redirectUri !== SOCIAL_CALLBACK) throw socialError('O retorno do aplicativo não está configurado.', 'SOCIAL_CONFIGURATION');
    // AuthSession usa expo-crypto nativo: não há fallback para Math.random/plain.
    request = new AuthSession.AuthRequest({ clientId: 'petgo-supabase', redirectUri,
      responseType: AuthSession.ResponseType.Code, usePKCE: true,
      codeChallengeMethod: AuthSession.CodeChallengeMethod.S256 });
    const config = await request.getAuthRequestConfigAsync();
    ensureCurrent(expected);
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(request.codeVerifier || '')
      || !/^[A-Za-z0-9_-]{43}$/.test(config.codeChallenge || '')) {
      throw socialError('Não foi possível preparar o acesso seguro. Tente novamente.', 'SOCIAL_PKCE_INVALID');
    }
    const authorizeUrl = `${configuration.url}/auth/v1/authorize?provider=google`
      + `&redirect_to=${encodeURIComponent(redirectUri)}&code_challenge=${encodeURIComponent(config.codeChallenge)}&code_challenge_method=s256`;
    browserOpen = true;
    // Supabase gerencia o state do Google; PKCE vincula o código ao verifier local.
    const browser = await WebBrowser.openAuthSessionAsync(authorizeUrl, redirectUri);
    browserOpen = false;
    ensureCurrent(expected);
    if (['cancel', 'dismiss'].includes(browser.type)) return { cancelled: true };
    if (browser.type !== 'success') throw socialError('O acesso com Google não foi concluído.', 'SOCIAL_PROVIDER_ERROR');
    const code = socialCodeFromCallback(browser.url);
    const session = await jsonRequest(`${configuration.url}/auth/v1/token?grant_type=pkce`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: configuration.key },
      body: JSON.stringify({ auth_code: code, code_verifier: request.codeVerifier })
    }, expected, 'A autorização do Google expirou ou não pôde ser confirmada. Inicie o acesso novamente.');
    if (typeof session.access_token !== 'string' || !session.access_token
      || !Number.isFinite(session.expires_in) || session.expires_in <= 0) {
      throw socialError('O Google não confirmou uma sessão válida. Tente novamente.', 'SOCIAL_RESPONSE_INVALID');
    }
    const result = await petgoRequest('social-login', session.access_token, {}, expected);
    if (result.requiresOnboarding) {
      pendingRegistration = { token: session.access_token,
        expiresAt: Date.now() + Math.min(session.expires_in * 1000, 10 * 60 * 1000) };
    }
    return result;
  } finally {
    if (request) request.codeVerifier = undefined;
    browserOpen = false;
    inFlight = false;
  }
}

export async function completeSocialRegistration(declaration) {
  if (inFlight) throw socialError('Aguarde a solicitação em andamento.', 'SOCIAL_BUSY');
  if (!hasPendingSocialRegistration()) {
    throw socialError('Seu acesso com Google expirou. Volte ao login e entre com Google novamente.', 'SOCIAL_PENDING_EXPIRED');
  }
  const pending = pendingRegistration;
  const expected = generation;
  inFlight = true;
  try {
    const result = await petgoRequest('social-complete', pending.token, {
      name: declaration.name, cpf: declaration.cpf, birthDate: declaration.birthDate,
      acceptedDeclaration: declaration.acceptedDeclaration
    }, expected);
    ensureCurrent(expected);
    if (result.requiresOnboarding) throw socialError('Sua declaração ainda não foi confirmada. Confira os dados.', 'SOCIAL_RESPONSE_INVALID');
    pendingRegistration = null;
    return result;
  } catch (error) {
    if (error.status === 401) pendingRegistration = null;
    throw error;
  } finally {
    inFlight = false;
  }
}
