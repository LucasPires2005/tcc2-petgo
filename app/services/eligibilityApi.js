import { mobileFetch, API_BASE_URL, captureSessionGuard } from './mobileApi';

// Formatação visual apenas. CPF e maioridade são sempre validados pelo servidor.
export function formatCpf(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  return digits.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

export function formatBirthDate(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8)
    .replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3');
}

export function birthDateToIso(value) {
  if (typeof value !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return null;
  const [day, month, year] = value.split('/').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null;
  return `${value.slice(6)}-${value.slice(3, 5)}-${value.slice(0, 2)}`;
}

export function declarationError(cpf, birthDate, acceptedDeclaration) {
  if (!/^\d{11}$/.test(String(cpf || '').replace(/[.\-]/g, ''))) return 'Informe um CPF com 11 dígitos.';
  if (!birthDateToIso(birthDate)) return 'Informe uma data de nascimento válida no formato DD/MM/AAAA.';
  if (!acceptedDeclaration) return 'Confirme a declaração de maioridade para continuar.';
  return null;
}

async function eligibilityRequest(options) {
  const ensureSession = captureSessionGuard();
  ensureSession();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await mobileFetch(`${API_BASE_URL}/auth/eligibility`, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    ensureSession();
    if (!response.ok) {
      const error = new Error(data.error || 'Não foi possível conferir a declaração. Tente novamente.');
      error.code = data.code;
      throw error;
    }
    if (!data.eligibility || !['PENDING', 'DECLARED_ADULT'].includes(data.eligibility.status)
      || data.eligibility.declaredAdult !== (data.eligibility.status === 'DECLARED_ADULT')) {
      throw new Error('O servidor não confirmou a declaração. Atualize e tente novamente.');
    }
    // Retorno mínimo: nunca espalhar campos internos, HMAC ou documento no contexto.
    return { status: data.eligibility.status, declaredAdult: data.eligibility.declaredAdult, identityVerified: false };
  } catch (error) {
    if (error.name === 'AbortError' || controller.signal.aborted) {
      const timeoutError = new Error('A consulta demorou mais que o esperado. Confira sua conexão e tente novamente.');
      timeoutError.code = 'ELIGIBILITY_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function getEligibility() {
  return eligibilityRequest({ headers: { 'ngrok-skip-browser-warning': 'true' } });
}

export function declareEligibility(cpf, birthDate, acceptedDeclaration) {
  return eligibilityRequest({
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cpf, birthDate, acceptedDeclaration })
  });
}
