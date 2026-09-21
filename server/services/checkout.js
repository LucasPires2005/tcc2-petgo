const { randomBytes } = require('node:crypto');

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = 'CHECKOUT_INVALID';
  throw error;
}

function normalizeCheckout(body, userId) {
  const type = body.type === undefined && body.planTier !== undefined ? 'plan' : body.type;
  if (!['plan', 'store_purchase', 'donation'].includes(type)) invalid('Tipo de checkout inválido.');
  if (!['number', 'string'].includes(typeof body.price) || !String(body.price).trim()) invalid('Valor inválido.');
  const price = Number(body.price);
  const cents = Math.round(price * 100);
  if (!Number.isFinite(price) || price <= 0 || cents <= 0 || cents > 100000000 || Math.abs(price * 100 - cents) > 0.00001) {
    invalid('Informe um valor positivo com até duas casas decimais.');
  }
  if (body.quantity !== undefined && body.quantity !== 1) invalid('Quantidade inválida.');
  const planTier = Number(body.planTier);
  if (type === 'plan' && (!['number', 'string'].includes(typeof body.planTier) || ![1, 2, 3].includes(planTier))) invalid('Plano inválido.');
  if (type !== 'plan' && body.planTier !== undefined) invalid('Este pagamento não pode alterar planos.');
  if (body.title !== undefined && (typeof body.title !== 'string' || body.title.trim().length > 150)) invalid('Título inválido.');
  const title = body.title?.trim() || (type === 'plan' ? `Plano PetGo ${planTier}` : 'Apoio PetGo');
  // Clientes anteriores sem dados de entrega continuam aceitos; campos parciais são rejeitados.
  let deliveryType = null;
  let deliveryInfo = null;
  if (body.deliveryType !== undefined || body.deliveryInfo !== undefined) {
    if (type !== 'store_purchase' || !['ONG', 'DELIVERY'].includes(body.deliveryType)
      || typeof body.deliveryInfo !== 'string' || !body.deliveryInfo.trim() || body.deliveryInfo.trim().length > 300) {
      invalid('Informe uma opção de retirada/entrega e seu endereço ou unidade.');
    }
    deliveryType = body.deliveryType;
    deliveryInfo = body.deliveryInfo.trim();
  }
  const reference = body.type === undefined
    ? `${userId}_${planTier}` // Compatibilidade com planos do APK anterior.
    : `petgo:${userId}:${type}:${type === 'plan' ? planTier : 0}:${randomBytes(12).toString('hex')}`;
  return { reference, metadata: { petgo_version: 1, user_id: String(userId), type, title,
    amount_cents: cents, plan_tier: type === 'plan' ? planTier : null,
    delivery_type: deliveryType, delivery_info: deliveryInfo } };
}

function referenceIdentity(reference) {
  if (typeof reference !== 'string') return null;
  const legacy = /^([1-9]\d*)_([123])$/.exec(reference);
  if (legacy) return { userId: legacy[1], type: 'plan', planTier: legacy[2], legacy: true };
  const current = /^petgo:([1-9]\d*):(plan|store_purchase|donation):([0-3]):[a-f0-9]{24}$/.exec(reference);
  if (!current || (current[2] === 'plan' ? current[3] === '0' : current[3] !== '0')) return null;
  return { userId: current[1], type: current[2], planTier: current[3], legacy: false };
}

function publicBaseUrl(env) {
  const value = (env.PUBLIC_API_URL || 'https://tcc-2026-1-e-2-petgo.onrender.com').replace(/\/$/, '');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('PUBLIC_API_URL precisa ser uma URL HTTPS pública.');
  }
  return value;
}

module.exports = { normalizeCheckout, referenceIdentity, publicBaseUrl };
