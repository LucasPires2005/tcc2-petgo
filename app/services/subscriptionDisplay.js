export function localDate(iso) {
  const date = new Date(iso);
  if (!iso || !Number.isFinite(date.getTime())) return null;
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}
export function benefit(user, kind, now = Date.now()) {
  const prefix = kind === 'plan' ? 'subscription' : 'premium';
  const end = user?.[`${prefix}_end_date`];
  const start = user?.[`${prefix}_start_date`];
  const date = localDate(end);
  const raw = user?.[`${prefix}_status`];
  const enabled = kind === 'plan' ? Number(user?.plan_tier) > 0 : Number(user?.is_premium) === 1;
  const expired = raw === 'EXPIRED' || (end && new Date(end).getTime() <= now);
  if (expired) return { active: false, canCancel: false, text: 'Expirado', status: 'EXPIRED' };
  if (!enabled) return { active: false, canCancel: false, text: 'Sem assinatura ativa', status: 'INACTIVE' };
  if (!start && !end) return { active: true, canCancel: false, text: 'Benefício antigo — sem vencimento', status: 'LEGACY' };
  if (!date) return { active: false, canCancel: false, text: 'Vigência indisponível. Atualize o perfil.', status: 'UNKNOWN' };
  if (raw === 'CANCELLED' || user?.[`${prefix}_cancelled_at`]) {
    return { active: true, canCancel: false, text: `Cancelado (Acesso até ${date})`, status: 'CANCELLED' };
  }
  return { active: true, canCancel: true, text: `Válido até ${date}`, status: 'ACTIVE' };
}
