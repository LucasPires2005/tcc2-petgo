const { randomUUID } = require('node:crypto');
const { referenceIdentity } = require('./checkout');

const DAY = 86400000;
const PROFILE_COLUMNS = `id, name, email, coins, is_premium, plan_tier, email_confirmed,
  subscription_start_date, subscription_end_date, subscription_status,
  premium_start_date, premium_end_date, premium_status,
  subscription_cancelled_at, premium_cancelled_at`;
const effectiveTierSql = (alias = '') => {
  const p = alias ? `${alias}.` : '';
  return `CASE WHEN (${p}subscription_start_date IS NULL AND ${p}subscription_end_date IS NULL)
    OR ${p}subscription_end_date > statement_timestamp() THEN COALESCE(${p}plan_tier, 0) ELSE 0 END`;
};

function periodState(enabled, start, end, now = Date.now()) {
  if (!enabled) return 'INACTIVE';
  if (start == null && end == null) return 'LEGACY';
  return end != null && Number.isFinite(new Date(end).getTime()) && new Date(end).getTime() > now ? 'ACTIVE' : 'EXPIRED';
}
function profileWithValidity(user, now = Date.now()) {
  if (!user) return user;
  let planStatus = periodState(Number(user.plan_tier) > 0, user.subscription_start_date, user.subscription_end_date, now);
  let premiumStatus = periodState(Number(user.is_premium) === 1, user.premium_start_date, user.premium_end_date, now);
  if (planStatus === 'ACTIVE' && user.subscription_cancelled_at) planStatus = 'CANCELLED';
  if (premiumStatus === 'ACTIVE' && user.premium_cancelled_at) premiumStatus = 'CANCELLED';
  return { ...user,
    plan_tier: ['ACTIVE', 'LEGACY', 'CANCELLED'].includes(planStatus) ? Number(user.plan_tier) : 0,
    is_premium: ['ACTIVE', 'LEGACY', 'CANCELLED'].includes(premiumStatus) ? 1 : 0,
    subscription_start_date: user.subscription_start_date ?? null,
    subscription_end_date: user.subscription_end_date ?? null, subscription_status: planStatus,
    premium_start_date: user.premium_start_date ?? null,
    premium_end_date: user.premium_end_date ?? null, premium_status: premiumStatus };
}

// Reconstrói em ordem de aprovação: notificações fora de ordem não desfazem compras novas.
function projectPeriod(initial, events) {
  let state = { ...initial };
  const ordered = [...events].sort((a, b) => new Date(a.approved_at) - new Date(b.approved_at)
    || a.event_key.localeCompare(b.event_key));
  for (const event of ordered) {
    const approved = new Date(event.approved_at).getTime();
    const previousEnd = state.end == null ? NaN : new Date(state.end).getTime();
    const renew = Number(state.tier) === Number(event.tier) && previousEnd > approved;
    state = { tier: Number(event.tier),
      start: renew && state.start ? new Date(state.start).toISOString() : new Date(approved).toISOString(),
      end: new Date((renew ? previousEnd : approved) + 30 * DAY).toISOString() };
  }
  return state;
}

function businessError(message, status = 400) {
  return Object.assign(new Error(message), { status, code: 'SUBSCRIPTION_INVALID' });
}
function operationKey(source, userId, operationId) {
  if (operationId !== undefined && (typeof operationId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(operationId))) {
    throw businessError('Identificador de operação inválido.');
  }
  return `${source}:${userId}:${operationId || randomUUID()}`;
}

async function activateSubscription(db, { userId, kind, tier, eventKey, approvedAt, coinCost = 0, legacy = false }) {
  if (!['plan', 'premium'].includes(kind) || ![1, 2, 3].includes(Number(tier))
    || (kind === 'premium' && Number(tier) !== 1) || !Number.isFinite(new Date(approvedAt).getTime())) {
    throw businessError('Dados de ativação inválidos.');
  }
  return db.transaction(async tx => {
    const user = (await tx.query(`SELECT ${PROFILE_COLUMNS} FROM public.users WHERE id = $1 FOR UPDATE`, [userId])).rows[0];
    if (!user) throw businessError('Usuário não encontrado.', 404);
    if (eventKey.startsWith('mp:')) {
      const rollout = (await tx.query('SELECT starts_at FROM petgo_private.subscription_rollout WHERE singleton = true', [])).rows[0];
      if (!rollout) throw businessError('Configuração de vigência não disponível.', 503);
      // Reentrega de pagamento anterior à implantação não é uma nova compra.
      if (new Date(approvedAt) < new Date(rollout.starts_at)) {
        return { user: profileWithValidity(user), duplicate: false, historical: true };
      }
    }
    const existing = (await tx.query('SELECT * FROM petgo_private.subscription_events WHERE event_key = $1', [eventKey])).rows[0];
    if (existing) {
      if (String(existing.user_id) !== String(userId) || existing.kind !== kind || Number(existing.tier) !== Number(tier)) {
        throw businessError('Operação já utilizada com outros dados.', 409);
      }
      return { user: profileWithValidity(user), duplicate: true };
    }
    const current = profileWithValidity(user);
    // APKs antigos não enviam chave estável. Não permitir que um toque repetido renove/cobre de novo.
    if (legacy && (kind === 'premium' ? current.is_premium === 1 : current.plan_tier === Number(tier))) {
      throw businessError(kind === 'premium' ? 'Saldo insuficiente.' : 'Para renovar este plano, atualize o aplicativo.');
    }
    if (coinCost && (!Number.isInteger(user.coins) || user.coins < coinCost)) throw businessError('Saldo insuficiente.');
    const prefix = kind === 'plan' ? 'subscription' : 'premium';
    const initial = { tier: kind === 'plan' ? user.plan_tier : user.is_premium,
      start: user[`${prefix}_start_date`] ?? null, end: user[`${prefix}_end_date`] ?? null };
    await tx.query(`INSERT INTO petgo_private.subscription_baselines (user_id, kind, initial_state)
      VALUES ($1, $2, $3::jsonb) ON CONFLICT (user_id, kind) DO NOTHING`, [userId, kind, JSON.stringify(initial)]);
    await tx.query(`INSERT INTO petgo_private.subscription_events (event_key, user_id, kind, tier, approved_at)
      VALUES ($1, $2, $3, $4, $5)`, [eventKey, userId, kind, Number(tier), approvedAt]);
    const baseline = (await tx.query(`SELECT initial_state FROM petgo_private.subscription_baselines WHERE user_id = $1 AND kind = $2`, [userId, kind])).rows[0];
    const events = (await tx.query(`SELECT * FROM petgo_private.subscription_events WHERE user_id = $1 AND kind = $2 ORDER BY approved_at, event_key`, [userId, kind])).rows;
    const next = projectPeriod(baseline.initial_state, events);
    // Só uma NOVA aprovação posterior ao cancelamento reativa a assinatura.
    // Webhooks antigos/duplicados não podem apagar a intenção de cancelar.
    const cancelledAt = user[`${prefix}_cancelled_at`];
    const remainsCancelled = cancelledAt && !events.some(e => new Date(e.approved_at) > new Date(cancelledAt));
    const field = kind === 'plan' ? 'plan_tier' : 'is_premium';
    const updated = (await tx.query(`UPDATE public.users SET ${field} = $1,
      ${prefix}_start_date = $2, ${prefix}_end_date = $3, ${prefix}_status = $4,
      ${prefix}_cancelled_at = $7,
      coins = coins - $5 WHERE id = $6 RETURNING ${PROFILE_COLUMNS}`,
    [next.tier, next.start, next.end, new Date(next.end).getTime() > Date.now()
      ? (remainsCancelled ? 'CANCELLED' : 'ACTIVE') : 'EXPIRED', coinCost, userId,
    remainsCancelled ? cancelledAt : null])).rows[0];
    return { user: profileWithValidity(updated), duplicate: false };
  });
}

async function cancelSubscription(db, userId, kind) {
  if (!['plan', 'premium'].includes(kind)) throw businessError('Informe Plano ou PRO.');
  const prefix = kind === 'plan' ? 'subscription' : 'premium';
  return db.transaction(async tx => {
    const user = (await tx.query(`SELECT ${PROFILE_COLUMNS} FROM public.users WHERE id = $1 FOR UPDATE`, [userId])).rows[0];
    if (!user) throw businessError('Usuário não encontrado.', 404);
    const status = profileWithValidity(user)[`${prefix}_status`];
    if (status === 'LEGACY') throw businessError('Este benefício antigo não tem vencimento. Não será removido; a vigência começa na próxima compra.', 409);
    if (status === 'CANCELLED') return { user: profileWithValidity(user), duplicate: true };
    if (status !== 'ACTIVE') throw businessError('Não há assinatura vigente para cancelar.', 409);
    const updated = (await tx.query(`UPDATE public.users SET ${prefix}_cancelled_at = $1,
      ${prefix}_status = 'CANCELLED' WHERE id = $2 RETURNING ${PROFILE_COLUMNS}`,
    [new Date().toISOString(), userId])).rows[0];
    return { user: profileWithValidity(updated), duplicate: false };
  });
}

async function activatePayment(db, payment) {
  const identity = referenceIdentity(payment.external_reference);
  if (payment.status !== 'approved' || identity?.type !== 'plan') return null;
  if (!payment.id || !payment.date_approved || !Number.isFinite(new Date(payment.date_approved).getTime())) {
    throw businessError('Pagamento sem identificação ou data de aprovação.', 503);
  }
  return activateSubscription(db, { userId: identity.userId, kind: 'plan', tier: Number(identity.planTier),
    eventKey: `mp:${payment.id}`, approvedAt: payment.date_approved });
}

module.exports = { PROFILE_COLUMNS, effectiveTierSql, profileWithValidity, periodState, projectPeriod,
  operationKey, activateSubscription, activatePayment, cancelSubscription };
