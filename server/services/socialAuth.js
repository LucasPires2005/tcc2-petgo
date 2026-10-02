const { issueMobileToken } = require('./mobileSession');
const { normalizeEmail, isValidEmail } = require('./credentialValidation');
const { PROFILE_COLUMNS, profileWithValidity } = require('./subscriptions');
const { prepareEligibility, publicEligibility, persistEligibility, eligibilityFailure } = require('./eligibility');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE_ELIGIBILITY_COLUMNS = 'cpf_hmac, cpf_key_version, status, method';
const PUBLIC_PROFILE_KEYS = [...PROFILE_COLUMNS.split(',').map(key => key.trim()), 'salvos'];

function socialError(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

// Never accept an email, UUID, provider flag or profile asserted by the mobile client.
async function googleIdentity(supabase, req) {
  const header = req.headers?.authorization;
  const match = typeof header === 'string' && /^Bearer ([a-zA-Z0-9._~-]{1,8192})$/i.exec(header);
  if (!match) throw socialError('SOCIAL_CREDENTIAL_INVALID', 'Entre novamente com o Google para continuar.', 401);
  let result;
  try { result = await supabase.auth.getUser(match[1]); }
  catch { throw socialError('SOCIAL_UNAVAILABLE', 'Não foi possível verificar o Google. Tente novamente.', 503); }
  if (result.error) {
    if (result.error.status >= 500 || result.error.name === 'AuthRetryableFetchError') {
      throw socialError('SOCIAL_UNAVAILABLE', 'Não foi possível verificar o Google. Tente novamente.', 503);
    }
    throw socialError('SOCIAL_CREDENTIAL_INVALID', 'Sua sessão Google expirou. Entre novamente.', 401);
  }
  const user = result.data?.user;
  if (!user || !UUID.test(user.id || '') || user.is_anonymous) {
    throw socialError('SOCIAL_CREDENTIAL_INVALID', 'Não foi possível verificar sua identidade Google.', 401);
  }
  if (!Array.isArray(user.identities) || !user.identities.some(identity => identity.provider === 'google')) {
    throw socialError('SOCIAL_PROVIDER_INVALID', 'Esta entrada exige uma conta autenticada com o Google.', 401);
  }
  const email = normalizeEmail(user.email);
  if (!user.email_confirmed_at || !isValidEmail(email)) {
    throw socialError('SOCIAL_EMAIL_UNCONFIRMED', 'Confirme o e-mail da sua conta Google para continuar.', 401);
  }
  return { id: user.id.toLowerCase(), email, metadata: user.user_metadata || {} };
}

async function findProfile(tx, identity) {
  // Serialize concurrent completion calls for the same identity across Render processes.
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`petgo-social:${identity.id}`]);
  const profiles = (await tx.query(`SELECT ${PROFILE_COLUMNS},
    (SELECT COUNT(*)::integer FROM public.animals WHERE "userId" = users.id AND status = 1) AS salvos
    FROM public.users WHERE auth_user_id::text = $1 FOR UPDATE`, [identity.id])).rows;
  if (profiles.length > 1) throw socialError('SOCIAL_UNAVAILABLE', 'Não foi possível verificar a conta. Contate o suporte.', 503);
  if (profiles[0]) return profiles[0];
  const conflict = (await tx.query('SELECT id FROM public.users WHERE LOWER(TRIM(email)) = $1', [identity.email])).rows[0];
  if (conflict) {
    throw socialError('SOCIAL_ACCOUNT_CONFLICT', 'Este e-mail já possui uma conta PetGo. Entre com e-mail e senha; a vinculação automática não está disponível.', 409);
  }
  return null;
}

async function accessState(tx, user) {
  const access = (await tx.query('SELECT banned, version FROM petgo_private.user_access WHERE user_id = $1 FOR UPDATE', [user.id])).rows[0];
  if (access?.banned) throw socialError('ACCOUNT_BANNED', 'Sua conta está banida.', 403);
  const version = access?.version ?? 0;
  if (!Number.isSafeInteger(version) || version < 0) throw socialError('SOCIAL_UNAVAILABLE', 'Não foi possível verificar a sessão.', 503);
  return version;
}

function sessionPayload(user, version) {
  // Explicit whitelist, even if a future SQL query includes private columns.
  const profile = Object.fromEntries(PUBLIC_PROFILE_KEYS.filter(key => key in user).map(key => [key, user[key]]));
  return { ...profileWithValidity(profile), accessToken: issueMobileToken(user.id, version) };
}

function accountName(input, metadata) {
  if (input !== undefined) {
    if (typeof input !== 'string' || input.trim().length < 1 || input.trim().length > 100 || /[\x00-\x1f\x7f]/.test(input)) {
      throw socialError('SOCIAL_NAME_INVALID', 'Informe um nome com até 100 caracteres.', 400);
    }
    return input.trim();
  }
  const name = metadata.full_name || metadata.name;
  // Google metadata supplies only a display name, never authorization or eligibility.
  return typeof name === 'string' && name.trim() && name.trim().length <= 100 && !/[\x00-\x1f\x7f]/.test(name)
    ? name.trim() : 'Usuário PetGo';
}

function failure(res, error) {
  if (error.code?.startsWith('SOCIAL_') || error.code === 'ACCOUNT_BANNED') {
    return res.status(error.status || 503).json({ error: error.message, code: error.code });
  }
  if (['DECLARATION_REQUIRED', 'CPF_INVALID', 'BIRTH_DATE_INVALID', 'UNDERAGE', 'CPF_DECLARATION_MISMATCH', 'ELIGIBILITY_UNAVAILABLE'].includes(error.code)) {
    return eligibilityFailure(res, error);
  }
  if (error.code === '23505') {
    return res.status(409).json({ error: 'Esta conta já está cadastrada. Entre novamente para continuar.', code: 'SOCIAL_ACCOUNT_CONFLICT' });
  }
  // No SDK error, credential, document, database statement or private row in logs/responses.
  return res.status(503).json({ error: 'Não foi possível concluir a entrada Google. Tente novamente.', code: 'SOCIAL_UNAVAILABLE' });
}

function createSocialHandlers({ db, supabase, enabled = () => process.env.SOCIAL_GOOGLE_ENABLED === 'true' }) {
  async function handle(req, res, complete) {
    res.set?.('Cache-Control', 'no-store');
    if (!enabled()) return failure(res, socialError('SOCIAL_DISABLED', 'A entrada Google ainda não está disponível.', 503));
    try {
      const identity = await googleIdentity(supabase, req);
      // Validated before any local profile is inserted. No normal JWT while onboarding is pending.
      const assessment = complete ? prepareEligibility(req.body) : null;
      const name = complete ? accountName(req.body?.name, identity.metadata) : null;
      const payload = await db.transaction(async tx => {
        let user = await findProfile(tx, identity);
        if (!user && !complete) return { requiresOnboarding: true };
        let version = user ? await accessState(tx, user) : 0;
        if (!user) {
          user = (await tx.query(`INSERT INTO public.users
            (name, email, password, coins, is_premium, plan_tier, email_confirmed, auth_user_id)
            VALUES ($1, $2, NULL, 0, 0, 0, true, $3) RETURNING ${PROFILE_COLUMNS}`,
          [name, identity.email, identity.id])).rows[0];
          if (!user) throw socialError('SOCIAL_UNAVAILABLE', 'Não foi possível criar o perfil.', 503);
          // FK to auth.users prevents completion from resurrecting an identity deleted during getUser.
          await tx.query(`INSERT INTO petgo_private.social_accounts (user_id, auth_user_id)
            VALUES ($1, $2)`, [user.id, identity.id]);
          user.salvos = 0;
        }
        const social = (await tx.query('SELECT auth_user_id FROM petgo_private.social_accounts WHERE user_id = $1', [user.id])).rows[0];
        if (social && String(social.auth_user_id).toLowerCase() !== identity.id) {
          throw socialError('SOCIAL_UNAVAILABLE', 'Não foi possível verificar o vínculo da conta.', 503);
        }
        if (complete) await persistEligibility(tx, user.id, assessment);
        else if (social) {
          const declaration = (await tx.query(`SELECT ${PRIVATE_ELIGIBILITY_COLUMNS}
            FROM petgo_private.user_eligibility WHERE user_id = $1`, [user.id])).rows[0];
          if (!publicEligibility(declaration).declaredAdult) return { requiresOnboarding: true };
        }
        // Traditional profiles linked by Supabase UUID keep their legacy eligibility rule.
        return sessionPayload(user, version);
      });
      return res.json(payload);
    } catch (error) { return failure(res, error); }
  }
  return { login: (req, res) => handle(req, res, false), complete: (req, res) => handle(req, res, true) };
}

module.exports = { createSocialHandlers };
