const express = require('express');
const router = express.Router();
const db = require('../db');
const { createClient } = require('@supabase/supabase-js');

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

// ROTA PARA ADICIONAR PETCOINS COM MULTIPLICADOR DO PLANO
router.post('/add-coins', (req, res) => {
  const { userId, baseAmount } = req.body;

  db.get('SELECT coins, plan_tier FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const multiplier = getMultiplier(user.plan_tier);
    const earnedCoins = (baseAmount || 10) * multiplier;
    const newBalance = (user.coins || 0) + earnedCoins;

    db.run('UPDATE users SET coins = ? WHERE id = ?', [newBalance, userId], (err) => {
      if (err) return res.status(500).json({ error: 'Erro ao creditar PetCoins' });

      res.json({
        success: true,
        earnedCoins,
        multiplier,
        newBalance,
        message: `Você ganhou ${earnedCoins} PetCoins! (Multiplicador ${multiplier}x ativado)`
      });
    });
  });
});

router.post('/buy-product', (req, res) => {
  const { userId, cost, productName } = req.body;

  db.get('SELECT coins FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (user.coins < cost) {
      return res.status(400).json({ error: 'Saldo de PetCoins insuficiente' });
    }

    const newBalance = user.coins - cost;

    db.run('UPDATE users SET coins = ? WHERE id = ?', [newBalance, userId], (err) => {
      if (err) return res.status(500).json({ error: 'Erro ao processar compra' });

      res.json({
        success: true,
        newBalance,
        message: `Parabéns! Você adquiriu: ${productName}. Verifique seu e-mail para combinar a entrega.`
      });
    });
  });
});

router.post('/upgrade-pro', (req, res) => {
  const { userId } = req.body;
  const cost = 50;

  db.get('SELECT coins, is_premium FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (user.is_premium === 1) return res.status(400).json({ error: 'Você já é PRO' });
    if (user.coins < cost) return res.status(400).json({ error: 'Saldo insuficiente' });

    const newBalance = user.coins - cost;

    db.run('UPDATE users SET coins = ?, is_premium = 1 WHERE id = ?', [newBalance, userId], () => {
      db.get(
        'SELECT id, name, email, coins, is_premium, plan_tier FROM users WHERE id = ?',
        [userId],
        (err, updated) => res.json({ success: true, user: updated })
      );
    });
  });
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

router.post('/donate', (req, res) => {
  const { userId, amount } = req.body;

  db.get('SELECT coins FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (user.coins < amount) return res.status(400).json({ error: 'Saldo insuficiente' });

    const newBalance = user.coins - amount;

    db.run('UPDATE users SET coins = ? WHERE id = ?', [newBalance, userId], () => {
      res.json({ success: true, newBalance });
    });
  });
});

router.post('/redeem', (req, res) => {
  const { userId, cost } = req.body;

  db.get('SELECT coins FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (user.coins < cost) return res.status(400).json({ error: 'Saldo insuficiente' });

    const newBalance = user.coins - cost;

    db.run('UPDATE users SET coins = ? WHERE id = ?', [newBalance, userId], () => {
      const code = `PET-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      res.json({ success: true, newBalance, couponCode: code });
    });
  });
});

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
       WHERE email = ?`,
      [email]
    );

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Mantém os usuários anteriores à integração funcionando.
    // Contas novas sempre possuirão auth_user_id e usarão Supabase Auth.
    if (!user.auth_user_id) {
      if (user.password !== password) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      return res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        coins: user.coins,
        is_premium: user.is_premium,
        plan_tier: user.plan_tier,
        email_confirmed: user.email_confirmed
      });
    }

    const { error: loginError } = await supabase.auth.signInWithPassword({
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

    const { error: loginError } = await supabase.auth.signInWithPassword({
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
      'SELECT id FROM users WHERE email = ?',
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
      return res.status(400).json({
        error: signUpError?.message || 'Não foi possível criar a conta.'
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
      'SELECT email_confirmed, auth_user_id FROM users WHERE email = ?',
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
      'SELECT auth_user_id FROM users WHERE email = ?',
      [email]
    );

    if (!user || !user.auth_user_id) {
      return res.status(404).json({ error: 'E-mail não encontrado.' });
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: PASSWORD_RESET_REDIRECT_URL
    });

    if (error) {
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
    const { title, price, planTier, userId } = req.body;
    const baseUrl = `https://${req.headers.host}`;

    const preference = new Preference(client);
    const response = await preference.create({
      body: {
        items: [
          {
            id: String(planTier),
            title: title,
            unit_price: Number(price),
            quantity: 1,
            currency_id: 'BRL'
          }
        ],
        external_reference: `${userId}_${planTier}`,
        notification_url: `${baseUrl}/auth/webhook`,
        back_urls: {
          success: `${baseUrl}/auth/payment-success?userId=${userId}&planTier=${planTier}`,
          failure: `${baseUrl}/auth/payment-failure`,
          pending: `${baseUrl}/auth/payment-pending`
        },
        auto_return: 'approved'
      }
    });

    const checkoutUrl = response.sandbox_init_point || response.init_point;
    res.json({ id: response.id, init_point: checkoutUrl });
  } catch (error) {
    console.error('Erro ao gerar pagamento:', error);
    res.status(500).json({ error: 'Falha ao comunicar com o Mercado Pago' });
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
        const extRef = paymentData.external_reference;

        if (extRef) {
          const [userId, planTier] = extRef.split('_');

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
  const { userId, planTier } = req.query;

  if (userId && planTier) {
    db.run(
      'UPDATE users SET plan_tier = ? WHERE id = ?',
      [planTier, userId],
      (err) => {
        if (!err) {
          console.log(
            `\n=======================================\n🚀 RETORNO SUCESSO: Usuário ID ${userId} subiu para o Plano ${planTier}!\n=======================================\n`
          );
        }
      }
    );
  }

  res.send(`
    <html>
      <body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; text-align:center;">
        <div>
          <h1 style="color: #27ae60;">Pagamento Aprovado! 🎉</h1>
          <p>Seu pagamento foi realizado com sucesso, agredemos seu apoio.</p>
          <p>Você já pode fechar esta janela e voltar para o aplicativo <b>PetGo</b>.</p>
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
          <p>Assim que for aprovado, seu plano será liberado no PetGo.</p>
        </div>
      </body>
    </html>
  `);
});

module.exports = router;