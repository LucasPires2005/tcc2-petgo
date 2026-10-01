function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// Validação de formato, não de existência do domínio ou da caixa postal.
// Aceita endereços convencionais e domínios internacionalizados em punycode.
function isValidEmail(email) {
  if (typeof email !== 'string' || email.length > 254) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.')
    || local.includes('..') || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(local)) return false;
  const labels = domain.split('.');
  return domain.length <= 253 && labels.length >= 2
    && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
    && /^(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/i.test(labels[labels.length - 1]);
}

function isValidNewPassword(value) {
  return typeof value === 'string' && value.length >= 6;
}

module.exports = { normalizeEmail, isValidEmail, isValidNewPassword };
