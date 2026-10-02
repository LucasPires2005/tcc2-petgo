const crypto = require('node:crypto');

const CPF_KEY_VERSION = 'v1';
const ELIGIBILITY_STATUS = 'DECLARED_ADULT';
const ELIGIBILITY_METHOD = 'LOCAL_DECLARATION';
const calendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
});

function normalizeCpf(value) {
  if (typeof value !== 'string' || value.length > 32) return null;
  const input = value.trim();
  if (/^[0-9]{11}$/.test(input)) return input;
  if (/^[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}$/.test(input)) {
    return input.replace(/[.-]/g, '');
  }
  return null;
}

// Confere formato e dígitos, NÃO existência na Receita nem titularidade.
function isValidCpf(value) {
  const cpf = normalizeCpf(value);
  if (!cpf || /^([0-9])\1{10}$/.test(cpf)) return false;
  for (const length of [9, 10]) {
    let sum = 0;
    for (let index = 0; index < length; index++) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = sum % 11;
    const digit = remainder < 2 ? 0 : 11 - remainder;
    if (digit !== Number(cpf[length])) return false;
  }
  return true;
}

function parseBirthDate(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1] ? { year, month, day } : null;
}

function todayInBrasilia(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
  const parts = calendar.formatToParts(now);
  const get = type => Number(parts.find(part => part.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

// `now` é relógio do servidor; a injeção existe para testes, não para o payload.
// Nascidos em 29/02 completam idade em 01/03 nos anos não bissextos nesta regra.
function calculateAge(birthDate, now = new Date()) {
  const birth = parseBirthDate(birthDate);
  const today = todayInBrasilia(now);
  if (!birth || !today) return null;
  if (birth.year > today.year || (birth.year === today.year && (birth.month > today.month
    || (birth.month === today.month && birth.day > today.day)))) return null;
  const beforeBirthday = today.month < birth.month || (today.month === birth.month && today.day < birth.day);
  return today.year - birth.year - (beforeBirthday ? 1 : 0);
}

function isAdult(birthDate, now = new Date()) {
  const age = calculateAge(birthDate, now);
  return age !== null && age >= 18;
}

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

function cpfHmacKey() {
  // Leitura tardia: importar o módulo NÃO exige configuração nem muda o startup.
  const secret = process.env.CPF_HMAC_SECRET;
  if (typeof secret !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(secret)) {
    throw failure('CPF_HMAC_NOT_CONFIGURED', 'Configure CPF_HMAC_SECRET com uma chave Base64 de pelo menos 32 bytes.');
  }
  const bytes = Buffer.from(secret, 'base64');
  if (bytes.length < 32 || bytes.toString('base64') !== secret) {
    throw failure('CPF_HMAC_NOT_CONFIGURED', 'Configure CPF_HMAC_SECRET com uma chave Base64 de pelo menos 32 bytes.');
  }
  return bytes;
}

function createCpfHmac(value) {
  if (!isValidCpf(value)) throw failure('CPF_INVALID', 'CPF inválido. Confira os números informados.');
  return crypto.createHmac('sha256', cpfHmacKey())
    .update(`petgo:cpf:${CPF_KEY_VERSION}:${normalizeCpf(value)}`, 'utf8').digest('hex');
}

// Hash/versão vêm do banco privado, nunca de um campo de aprovação do cliente.
function matchesCpfHmac(value, storedHmac, keyVersion = CPF_KEY_VERSION) {
  if (keyVersion !== CPF_KEY_VERSION || !isValidCpf(value)
    || typeof storedHmac !== 'string' || !/^[0-9a-f]{64}$/.test(storedHmac)) return false;
  return crypto.timingSafeEqual(Buffer.from(createCpfHmac(value), 'hex'), Buffer.from(storedHmac, 'hex'));
}

// Resultado INTERNO do backend: cpfHmac não deve ser serializado em uma rota.
// Não persiste nada e não transforma uma declaração em verificação de identidade.
function assessEligibility(input, now = new Date()) {
  if (!todayInBrasilia(now)) throw failure('ELIGIBILITY_CLOCK_INVALID', 'Relógio do servidor inválido.');
  const cpf = input?.cpf;
  const birthDate = input?.birthDate;
  if (!isValidCpf(cpf)) return { eligible: false, code: 'CPF_INVALID', error: 'CPF inválido. Confira os números informados.' };
  const age = calculateAge(birthDate, now);
  if (age === null) return { eligible: false, code: 'BIRTH_DATE_INVALID', error: 'Data de nascimento inválida.' };
  if (age < 18) return { eligible: false, code: 'UNDERAGE', error: 'É necessário ter 18 anos ou mais para continuar.' };
  return {
    eligible: true, status: ELIGIBILITY_STATUS, method: ELIGIBILITY_METHOD,
    identityVerified: false, cpfHmac: createCpfHmac(cpf), cpfKeyVersion: CPF_KEY_VERSION,
    assessedAt: now.toISOString()
  };
}

module.exports = {
  CPF_KEY_VERSION, ELIGIBILITY_STATUS, ELIGIBILITY_METHOD,
  normalizeCpf, isValidCpf, parseBirthDate, calculateAge, isAdult,
  createCpfHmac, matchesCpfHmac, assessEligibility
};
