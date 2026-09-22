const express = require('express');
const router = express.Router();
const db = require('../db');
const { createClient } = require('@supabase/supabase-js');
const { issueMobileToken, getMobileAccess } = require('../services/mobileSession');
const { createRequireMobileUser, bindMobileIdentity } = require('../middleware/requireMobileUser');
const { normalizeCheckout, referenceIdentity, publicBaseUrl } = require('../services/checkout');

const publicPaths = new Set(['/login', '/register', '/resend-confirmation', '/request-password-reset', '/reset-password', '/webhook', '/payment-success', '/payment-failure', '/payment-pending']);
const requireMobileUser = createRequireMobileUser({ db });
router.use((req, res, next) => {
  if (publicPaths.has(req.path.replace(/\/$/, '').toLowerCase())) return next();
  return requireMobileUser(req, res, () => bindMobileIdentity(req, res, next));
});
// Parâmetros só estão disponíveis depois de selecionar a rota.
router.param('id', (req, res, next, id) => {
  if (!req.mobileUser || String(req.mobileUser.id) !== id) return res.status(403).json({ error: 'Acesso a outra conta não permitido.' });
  next();
});

// Configuração do Supabase Auth
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error('SUPABASE_URL e SUPABASE_SECRET_KEY precisam estar configuradas no Render.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const EMAIL_CONFIRMATION_REDIRECT_URL = 'petgo://auth/callback';
const PASSWORD_RESET_REDIRECT_URL = 'petgo://auth/reset-password';

// Helpers para utilizar o adaptador atual do banco com async/await
function getOne(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function logSupabaseAuthError(context, error) {
  console.error(context, {
    message: error?.message,
    code: error?.code,
    status: error?.status
  });
}

// Configuração do Mercado Pago (com Preference e Payment)
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN
});

// HELPER: Calcula o multiplicador de PetCoins com base no plano do usuário
function getMultiplier(planTier) {
  if (planTier === 3) return 3; // Plano Guardião
  if (planTier === 2) return 2; // Plano Protetor
  return 1;                     // Plano Amigo / Gratuito
}

// ==========================================
// ROTAS DO APLICATIVO
// ==========================================

// PetCoins são unidades inteiras. Limite compatível com INTEGER do PostgreSQL.
const MAX_COINS = 2147483647;
function validCoins(value) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_COINS;
}

// A condição e a alteração são executadas juntas no banco, sem saldo calculado no cliente.
async function debitCoins(userId, amount, upgrade = false) {
  return getOne(
    `UPDATE users SET coins = coins - ?${upgrade ? ', is_premium = 1' : ''}
     WHERE id = ? AND coins >= ? AND coins <= ?
     ${upgrade ? 'AND COALESCE(is_premium, 0) <> 1' : ''}
     RETURNING id, name, email, coins, is_premium, plan_tier`,
    [amount, userId, amount, MAX_COINS]
  );
}

router.post('/add-coins', async (req, res) => {
  const { userId, baseAmount = 10 } = req.body;
  if (!validCoins(baseAmount)) return res.status(400).json({ error: 'Informe uma quantidade inteira e positiva de PetCoins.' });
  try {
    const user = await getOne(
      `UPDATE users SET coins = COALESCE(coins, 0) + ? * CASE plan_tier WHEN 3 THEN 3 WHEN 2 THEN 2 ELSE 1 END
       WHERE id = ? AND COALESCE(coins, 0) >= 0
       AND COALESCE(coins, 0) <= ? - ?::bigint * CASE plan_tier WHEN 3 THEN 3 WHEN 2 THEN 2 ELSE 1 END
       RETURNING coins, plan_tier`, [baseAmount, userId, MAX_COINS, baseAmount]);
    if (!user) return res.status(400).json({ error: 'Não foi possível creditar: conta ou saldo inválido, ou limite excedido.' });
    const multiplier = getMultiplier(user.plan_tier);
    const earnedCoins = baseAmount * multiplier;
    res.json({ success: true, earnedCoins, multiplier, newBalance: user.coins,
      message: `Você ganhou ${earnedCoins} PetCoins! (Multiplicador ${multiplier}x ativado)` });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao creditar PetCoins' });
  }
});

router.post('/buy-product', async (req, res) => {
  const { userId, cost, productName } = req.body;
  if (!validCoins(cost)) return res.status(400).json({ error: 'Informe um custo inteiro e positivo de PetCoins.' });
  try {
    const user = await debitCoins(userId, cost);
    if (!user) return res.status(400).json({ error: 'Saldo de PetCoins insuficiente ou inválido.' });
    res.json({ success: true, newBalance: user.coins,
      message: `Parabéns! Você adquiriu: ${productName}. Verifique seu e-mail para combinar a entrega.` });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao processar compra' });
  }
});

router.post('/upgrade-pro', async (req, res) => {
  try {
    const user = await debitCoins(req.body.userId, 50, true);
    if (!user) return res.status(400).json({ error: 'Saldo insuficiente ou conta já PRO.' });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao ativar PRO.' });
  }
});

router.post('/subscribe-plan', (req, res) => {
  const { userId, planTier } = req.body;

  db.get('SELECT id FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Usuário não encontrado' });

    db.run('UPDATE users SET plan_tier = ? WHERE id = ?', [planTier, userId], (err) => {
      if (err) return res.status(500).json({ error: 'Erro ao ativar assinatura' });

      db.get(
        'SELECT id, name, email, coins, is_premium, plan_tier FROM users WHERE id = ?',
        [userId],
        (err, updatedUser) => {
          res.json({
            success: true,
            message: 'Plano ativado com sucesso! 🎉',
            user: updatedUser
          });
        }
      );
    });
  });
});

for (const [path, field] of [['/donate', 'amount'], ['/redeem', 'cost']]) {
  router.post(path, async (req, res) => {
    const amount = req.body[field];
    if (!validCoins(amount)) return res.status(400).json({ error: 'Informe uma quantidade inteira e positiva de PetCoins.' });
    try {
      const user = await debitCoins(req.body.userId, amount);
      if (!user) return res.status(400).json({ error: 'Saldo insuficiente ou inválido.' });
      const payload = { success: true, newBalance: user.coins };
      if (path === '/redeem') payload.couponCode = `PET-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      res.json(payload);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao movimentar PetCoins.' });
    }
  });
}

// ==========================================
// LOGIN COM SUPABASE AUTH
// ==========================================

router.post('/login', async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  const { password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const user = await getOne(
      `SELECT id, name, email, password, coins, is_premium, plan_tier,
              email_confirmed, auth_user_id
       FROM users
       WHERE LOWER(TRIM(email)) = ?`,
      [email]
    );

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const access = await getMobileAccess(db, user.id);
    if (access?.banned) return res.status(403).json({ error: 'Sua conta está banida.', code: 'ACCOUNT_BANNED' });
    if (!access) return res.status(401).json({ error: 'Credenciais inválidas' });

    // Mantém os usuários anteriores à integração funcionando.
    // Contas novas sempre possuirão auth_user_id e usarão Supabase Auth.
    if (!user.auth_user_id) {
      if (user.password !== password) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      return res.json({
        accessToken: issueMobileToken(user.id, access.version),
        id: user.id,
        name: user.name,
        email: user.email,
        coins: user.coins,
        is_premium: user.is_premium,
        plan_tier: user.plan_tier,
        email_confirmed: user.email_confirmed
      });
    }

    const loginClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: loginError } = await loginClient.auth.signInWithPassword({
      email,
      password
    });

    if (loginError) {
      const isUnconfirmed = loginError.message.toLowerCase().includes('confirm');

      return res.status(401).json({
        error: isUnconfirmed
          ? 'Confirme seu e-mail antes de entrar no PetGo.'
          : 'Credenciais inválidas'
      });
    }

    await runQuery(
      'UPDATE users SET email_confirmed = true WHERE id = ?',
      [user.id]
    );

    res.json({
      accessToken: issueMobileToken(user.id, access.version),
      id: user.id,
      name: user.name,
      email: user.email,
      coins: user.coins,
      is_premium: user.is_premium,
      plan_tier: user.plan_tier,
      email_confirmed: true
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro ao realizar login.' });
  }
});

router.get('/update-status/:id', (req, res) => {
  db.get(
    'SELECT id, name, email, coins, is_premium, plan_tier, email_confirmed FROM users WHERE id = ?',
    [req.params.id],
    (err, user) => {
      if (user) res.json(user);
      else res.status(404).json({ error: 'Não encontrado' });
    }
  );
});

router.put('/update', async (req, res) => {
  const { id, name } = req.body;
  const email = req.body.email?.trim().toLowerCase();

  if (!id || !name || !email) {
    return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
  }

  try {
    const currentUser = await getOne(
      'SELECT id, email, auth_user_id FROM users WHERE id = ?',
      [id]
    );

    if (!currentUser) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    // Para contas novas, mantém o e-mail do Supabase sincronizado.
    if (currentUser.auth_user_id && currentUser.email !== email) {
      const { error: supabaseError } = await supabase.auth.admin.updateUserById(
        currentUser.auth_user_id,
        { email }
      );

      if (supabaseError) {
        return res.status(400).json({
          error: 'Não foi possível atualizar o e-mail no Supabase.'
        });
      }
    }

    await runQuery(
      'UPDATE users SET name = ?, email = ? WHERE id = ?',
      [name, email, id]
    );

    const updatedUser = await getOne(
      `SELECT id, name, email, coins, is_premium, plan_tier, email_confirmed
       FROM users
       WHERE id = ?`,
      [id]
    );

    res.json(updatedUser);
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(400).json({
      error: 'Este e-mail já está em uso ou é inválido.'
    });
  }
});

router.put('/change-password', async (req, res) => {
  const { id, currentPassword, newPassword } = req.body;

  if (!id || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      error: 'A nova senha deve ter pelo menos 6 caracteres.'
    });
  }

  try {
    const user = await getOne(
      'SELECT id, email, password, auth_user_id FROM users WHERE id = ?',
      [id]
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    // Usuário antigo: mantém exatamente o fluxo existente.
    if (!user.auth_user_id) {
      if (user.password !== currentPassword) {
        return res.status(401).json({ error: 'Senha incorreta' });
      }

      await runQuery(
        'UPDATE users SET password = ? WHERE id = ?',
        [newPassword, id]
      );

      return res.json({ message: 'Alterada!' });
    }

    const passwordClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: loginError } = await passwordClient.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    });

    if (loginError) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.auth_user_id,
      { password: newPassword }
    );

    if (updateError) {
      return res.status(500).json({
        error: 'Não foi possível alterar a senha no Supabase.'
      });
    }

    await runQuery(
      'UPDATE users SET password = ? WHERE id = ?',
      [newPassword, id]
    );

    res.json({ message: 'Alterada!' });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({ error: 'Erro ao alterar senha.' });
  }
});

router.delete('/delete/:id', async (req, res) => {
  try {
    const user = await getOne(
      'SELECT auth_user_id FROM users WHERE id = ?',
      [req.params.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (user.auth_user_id) {
      const { error: supabaseError } = await supabase.auth.admin.deleteUser(
        user.auth_user_id
      );

      if (supabaseError) {
        return res.status(500).json({
          error: 'Não foi possível excluir a autenticação do usuário.'
        });
      }
    }

    await runQuery('DELETE FROM users WHERE id = ?', [req.params.id]);

    res.json({ message: 'Excluída' });
  } catch (error) {
    console.error('Erro ao excluir conta:', error);
    res.status(500).json({ error: 'Erro ao excluir conta.' });
  }
});

// ==========================================
// CADASTRO COM CONFIRMAÇÃO DE E-MAIL
// ==========================================

router.post('/register', async (req, res) => {
  const { name, password } = req.body;
  const email = req.body.email?.trim().toLowerCase();

  if (!name || !email || !password) {
    return res.status(400).json({
      error: 'Nome, e-mail e senha são obrigatórios.'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      error: 'A senha deve ter pelo menos 6 caracteres.'
    });
  }

  try {
    const existingUser = await getOne(
      'SELECT id FROM users WHERE LOWER(TRIM(email)) = ?',
      [email]
    );

    if (existingUser) {
      return res.status(400).json({
        error: 'Este e-mail já está em uso em outra conta.'
      });
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: EMAIL_CONFIRMATION_REDIRECT_URL,
        data: {
          name
        }
      }
    });

    if (signUpError || !data.user) {
      logSupabaseAuthError('Erro do Supabase no cadastro:', signUpError);

      const emailDeliveryFailed = signUpError?.message
        ?.toLowerCase()
        .includes('sending confirmation email');

      return res.status(emailDeliveryFailed ? 502 : 400).json({
        error: emailDeliveryFailed
          ? 'Não foi possível enviar o e-mail de confirmação. Tente novamente em alguns minutos.'
          : signUpError?.message || 'Não foi possível criar a conta.',
        code: emailDeliveryFailed ? 'CONFIRMATION_EMAIL_FAILED' : 'SIGNUP_FAILED'
      });
    }

    if (data.user.identities && data.user.identities.length === 0) {
      return res.status(400).json({
        error: 'Este e-mail já está em uso em outra conta.'
      });
    }

    try {
      await runQuery(
        `INSERT INTO users (
          name,
          email,
          password,
          email_confirmed,
          auth_user_id
        ) VALUES (?, ?, ?, ?, ?)`,
        [name, email, password, false, data.user.id]
      );
    } catch (databaseError) {
      await supabase.auth.admin.deleteUser(data.user.id);

      console.error('Erro ao salvar usuário local:', databaseError);

      return res.status(500).json({
        error: 'Não foi possível finalizar o cadastro.'
      });
    }

    res.status(201).json({
      message: 'Conta criada! Verifique seu e-mail para ativá-la.',
      requiresEmailConfirmation: true
    });
  } catch (error) {
    console.error('Erro no cadastro:', error);
    res.status(500).json({ error: 'Erro ao criar a conta.' });
  }
});

// ==========================================
// REENVIO DE CONFIRMAÇÃO DE E-MAIL
// ==========================================

router.post('/resend-confirmation', async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ error: 'Informe seu e-mail.' });
  }

  try {
    const user = await getOne(
      'SELECT email_confirmed, auth_user_id FROM users WHERE LOWER(TRIM(email)) = ?',
      [email]
    );

    if (!user || !user.auth_user_id) {
      return res.status(404).json({ error: 'Conta não encontrada.' });
    }

    if (user.email_confirmed) {
      return res.status(400).json({
        error: 'Este e-mail já foi confirmado.'
      });
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: EMAIL_CONFIRMATION_REDIRECT_URL
      }
    });

    if (error) {
      logSupabaseAuthError('Erro do Supabase ao reenviar confirmação:', error);
      return res.status(400).json({
        error: 'Não foi possível reenviar o e-mail de confirmação.'
      });
    }

    res.json({
      message: 'E-mail de confirmação reenviado com sucesso.'
    });
  } catch (error) {
    console.error('Erro ao reenviar confirmação:', error);
    res.status(500).json({
      error: 'Erro ao reenviar e-mail de confirmação.'
    });
  }
});

// ==========================================
// SOLICITAÇÃO DE RECUPERAÇÃO DE SENHA
// ==========================================

router.post('/request-password-reset', async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();

  if (!email) {
    return res.status(400).json({ error: 'Informe seu e-mail.' });
  }

  try {
    const user = await getOne(
      `SELECT auth_user_id
       FROM users
       WHERE LOWER(TRIM(email)) = ?`,
      [email]
    );

    if (!user || !user.auth_user_id) {
      return res.status(404).json({ error: 'E-mail não encontrado.' });
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: PASSWORD_RESET_REDIRECT_URL
    });

    if (error) {
      logSupabaseAuthError('Erro do Supabase ao enviar recuperação:', error);
      return res.status(400).json({
        error: 'Não foi possível enviar o e-mail de recuperação.'
      });
    }

    res.json({
      message: 'E-mail de recuperação enviado com sucesso.'
    });
  } catch (error) {
    console.error('Erro ao solicitar recuperação de senha:', error);
    res.status(500).json({
      error: 'Erro ao solicitar recuperação de senha.'
    });
  }
});

// ==========================================
// NOVA SENHA APÓS O LINK DE RECUPERAÇÃO
// ==========================================

router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({
      error: 'Token e nova senha são obrigatórios.'
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      error: 'A nova senha deve ter pelo menos 6 caracteres.'
    });
  }

  try {
    const {
      data: { user: supabaseUser },
      error: tokenError
    } = await supabase.auth.getUser(token);

    if (tokenError || !supabaseUser) {
      return res.status(401).json({
        error: 'Link inválido ou expirado. Solicite uma nova recuperação.'
      });
    }

    const localUser = await getOne(
      'SELECT id, email, auth_user_id FROM users WHERE auth_user_id = ?',
      [supabaseUser.id]
    );

    if (!localUser) {
      return res.status(404).json({
        error: 'Usuário não encontrado no PetGo.'
      });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      supabaseUser.id,
      { password: newPassword }
    );

    if (updateError) {
      return res.status(500).json({
        error: 'Não foi possível redefinir a senha.'
      });
    }

    await runQuery(
      'UPDATE users SET password = ?, email_confirmed = true WHERE id = ?',
      [newPassword, localUser.id]
    );

    res.json({
      message: 'Sua senha foi redefinida com sucesso.'
    });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    res.status(500).json({
      error: 'Erro ao redefinir senha.'
    });
  }
});

// ==========================================
// INTEGRACAO MERCADO PAGO + WEBHOOK
// ==========================================

router.post('/create-preference', async (req, res) => {
  try {
    const intent = normalizeCheckout(req.body, req.mobileUser.id);
    const baseUrl = publicBaseUrl(process.env);

    const preference = new Preference(client);
    const response = await preference.create({
      body: {
        items: [
          {
            id: intent.metadata.type === 'plan' ? String(intent.metadata.plan_tier) : intent.metadata.type,
            title: intent.metadata.title,
            unit_price: intent.metadata.amount_cents / 100,
            quantity: 1,
            currency_id: 'BRL'
          }
        ],
        external_reference: intent.reference,
        metadata: intent.metadata,
        notification_url: `${baseUrl}/auth/webhook`,
        back_urls: {
          success: `${baseUrl}/auth/payment-success`,
          failure: `${baseUrl}/auth/payment-failure`,
          pending: `${baseUrl}/auth/payment-pending`
        },
        auto_return: 'approved'
      }
    });

    const checkoutUrl = response.sandbox_init_point || response.init_point;
    res.json({ id: response.id, init_point: checkoutUrl });
  } catch (error) {
    if (error.code === 'CHECKOUT_INVALID') return res.status(400).json({ error: error.message });
    console.error('Erro ao gerar pagamento:', { status: error.status, code: error.code });
    res.status(500).json({ error: 'Falha ao comunicar com o Mercado Pago' });
  }
});

// A preferência no provedor preserva a intenção mesmo após reiniciar o backend.
// A consulta é autenticada e nunca aceita status de pagamento declarado pelo celular.
router.get('/checkout-status', async (req, res) => {
  const preferenceId = req.query.preferenceId;
  if (typeof preferenceId !== 'string' || !/^[a-zA-Z0-9-]{1,150}$/.test(preferenceId)) {
    return res.status(400).json({ error: 'Identificador de checkout inválido.' });
  }
  try {
    const preference = await new Preference(client).get({ preferenceId });
    const meta = preference.metadata;
    const identity = referenceIdentity(preference.external_reference);
    if (!meta || !identity || meta.petgo_version !== 1
      || String(meta.user_id) !== String(req.mobileUser.id) || identity.userId !== String(req.mobileUser.id)) {
      return res.status(403).json({ error: 'Checkout não disponível para esta conta.' });
    }
    if (identity.type !== meta.type || !Number.isSafeInteger(meta.amount_cents) || meta.amount_cents <= 0
      || (identity.type === 'plan' && Number(identity.planTier) !== meta.plan_tier)) {
      return res.status(409).json({ error: 'Dados do checkout inconsistentes.' });
    }
    const search = await new Payment(client).search({ options: {
      external_reference: preference.external_reference, sort: 'date_created', criteria: 'desc', limit: 50
    } });
    const matching = (search.results || []).filter(payment =>
      payment.external_reference === preference.external_reference
      && payment.currency_id === 'BRL'
      && Math.round(Number(payment.transaction_amount) * 100) === meta.amount_cents
      && new Date(payment.date_created).getTime() >= new Date(preference.date_created).getTime());
    const payment = matching.find(item => item.status === 'approved') || matching[0];
    const status = payment?.status || 'pending';
    if (status === 'approved' && identity.type === 'plan') {
      await runQuery('UPDATE users SET plan_tier = ? WHERE id = ?', [identity.planTier, identity.userId]);
    }
    res.json({ preferenceId, status, type: meta.type, title: meta.title,
      deliveryType: meta.delivery_type, deliveryInfo: meta.delivery_info,
      paymentId: payment?.id ? String(payment.id) : null });
  } catch (error) {
    console.error('Erro ao consultar checkout:', { status: error.status, code: error.code });
    res.status(503).json({ error: 'Não foi possível consultar o pagamento. Tente novamente.' });
  }
});

router.post('/webhook', async (req, res) => {
  const paymentId = req.query['data.id'] || (req.body.data && req.body.data.id);
  const type = req.query.type || req.body.type;

  if (type === 'payment' && paymentId) {
    try {
      const payment = new Payment(client);
      const paymentData = await payment.get({ id: paymentId });

      if (paymentData.status === 'approved') {
        const identity = referenceIdentity(paymentData.external_reference);

        if (identity?.type === 'plan') {
          const { userId, planTier } = identity;

          db.run(
            'UPDATE users SET plan_tier = ? WHERE id = ?',
            [planTier, userId],
            (err) => {
              if (!err) {
                console.log(
                  `\n=======================================\n🚀 WEBHOOK SUCESSO: Usuário ID ${userId} subiu para o Plano ${planTier}!\n=======================================\n`
                );
              }
            }
          );
        }
      }
    } catch (err) {
      console.error('Erro no Webhook:', err);
    }
  }

  res.sendStatus(200);
});

// ==========================================
// ROTAS ADICIONADAS DE RETORNO DO CHECKOUT
// ==========================================

router.get('/payment-success', (req, res) => {
  // Retorno de navegador não autentica pagamento. Webhook/consulta autenticada
  // confirmam com o provedor; parâmetros da URL não autorizam escrita.

  res.send(`
    <html>
      <body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; text-align:center;">
        <div>
          <h1 style="color: #27ae60;">Retorno ao PetGo</h1>
          <p>Volte ao aplicativo para consultar a confirmação do pagamento e os dados de retirada ou entrega.</p>
          <p>No Expo Go, use o seletor de aplicativos do celular. O PetGo verifica o pagamento ao voltar.</p>
          <p><a href="petgo://checkout/return">Abrir PetGo instalado</a></p>
        </div>
      </body>
    </html>
  `);
});

router.get('/payment-failure', (req, res) => {
  res.send(`
    <html>
      <body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; text-align:center;">
        <div>
          <h1 style="color: #e74c3c;">Pagamento Não Concluído ❌</h1>
          <p>Houve um problema ao processar seu pagamento.</p>
          <p>Por favor, volte ao aplicativo e tente novamente.</p>
        </div>
      </body>
    </html>
  `);
});

router.get('/payment-pending', (req, res) => {
  res.send(`
    <html>
      <body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; text-align:center;">
        <div>
          <h1 style="color: #f39c12;">Pagamento Pendente ⏳</h1>
          <p>Seu pagamento está aguardando confirmação.</p>
          <p>Volte ao PetGo para acompanhar a confirmação. No Expo Go, use o seletor de aplicativos.</p>
        </div>
      </body>
    </html>
  `);
});

module.exports = router;
