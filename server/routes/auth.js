const express = require('express');
const router = express.Router();
const db = require('../db');

// Configuração do Mercado Pago (com Preference e Payment)
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });

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
    if (err || !user) return res.status(404).json({ error: "Usuário não encontrado" });

    const multiplier = getMultiplier(user.plan_tier);
    const earnedCoins = (baseAmount || 10) * multiplier;
    const newBalance = (user.coins || 0) + earnedCoins;

    db.run('UPDATE users SET coins = ? WHERE id = ?', [newBalance, userId], (err) => {
      if (err) return res.status(500).json({ error: "Erro ao creditar PetCoins" });
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
    if (err || !user) return res.status(404).json({ error: "Usuário não encontrado" });
    if (user.coins < cost) return res.status(400).json({ error: "Saldo de PetCoins insuficiente" });

    const newBalance = user.coins - cost;
    db.run('UPDATE users SET coins = ? WHERE id = ?', [newBalance, userId], (err) => {
      if (err) return res.status(500).json({ error: "Erro ao processar compra" });
      res.json({ success: true, newBalance, message: `Parabéns! Você adquiriu: ${productName}. Verifique seu e-mail para combinar a entrega.` });
    });
  });
});

router.post('/upgrade-pro', (req, res) => {
  const { userId } = req.body;
  const cost = 50;
  db.get('SELECT coins, is_premium FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: "Usuário não encontrado" });
    if (user.is_premium === 1) return res.status(400).json({ error: "Você já é PRO" });
    if (user.coins < cost) return res.status(400).json({ error: "Saldo insuficiente" });
    const newBalance = user.coins - cost;
    db.run('UPDATE users SET coins = ?, is_premium = 1 WHERE id = ?', [newBalance, userId], () => {
      db.get('SELECT id, name, email, coins, is_premium, plan_tier FROM users WHERE id = ?', [userId], (err, updated) => res.json({ success: true, user: updated }));
    });
  });
});

router.post('/subscribe-plan', (req, res) => {
  const { userId, planTier } = req.body; 
  db.get('SELECT id FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: "Usuário não encontrado" });
    db.run('UPDATE users SET plan_tier = ? WHERE id = ?', [planTier, userId], (err) => {
      if (err) return res.status(500).json({ error: "Erro ao ativar assinatura" });
      db.get('SELECT id, name, email, coins, is_premium, plan_tier FROM users WHERE id = ?', [userId], (err, updatedUser) => {
        res.json({ success: true, message: "Plano ativado com sucesso! 🎉", user: updatedUser });
      });
    });
  });
});

router.post('/donate', (req, res) => {
  const { userId, amount } = req.body;
  db.get('SELECT coins FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: "Usuário não encontrado" });
    if (user.coins < amount) return res.status(400).json({ error: "Saldo insuficiente" });
    const newBalance = user.coins - amount;
    db.run('UPDATE users SET coins = ? WHERE id = ?', [newBalance, userId], () => res.json({ success: true, newBalance }));
  });
});

router.post('/redeem', (req, res) => {
  const { userId, cost } = req.body;
  db.get('SELECT coins FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: "Usuário não encontrado" });
    if (user.coins < cost) return res.status(400).json({ error: "Saldo insuficiente" });
    const newBalance = user.coins - cost;
    db.run('UPDATE users SET coins = ? WHERE id = ?', [newBalance, userId], () => {
      const code = "PET-" + Math.random().toString(36).substr(2, 9).toUpperCase();
      res.json({ success: true, newBalance, couponCode: code });
    });
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT id, name, email, coins, is_premium, plan_tier FROM users WHERE email = ? AND password = ?', [email, password], (err, user) => {
    if (err || !user) return res.status(401).json({ error: "Credenciais inválidas" });
    res.json(user);
  });
});

router.get('/update-status/:id', (req, res) => {
  db.get('SELECT id, name, email, coins, is_premium, plan_tier FROM users WHERE id = ?', [req.params.id], (err, user) => {
    if (user) res.json(user);
    else res.status(404).json({ error: "Não encontrado" });
  });
});

router.put('/update', (req, res) => {
  const { id, name, email } = req.body;
  db.run(`UPDATE users SET name = ?, email = ? WHERE id = ?`, [name, email, id], function(err) {
    if (err) return res.status(400).json({ error: "Este e-mail já está em uso ou é inválido." });
    db.get('SELECT id, name, email, coins, is_premium, plan_tier FROM users WHERE id = ?', [id], (err, user) => res.json(user));
  });
});

router.put('/change-password', (req, res) => {
  const { id, currentPassword, newPassword } = req.body;
  db.get('SELECT * FROM users WHERE id = ? AND password = ?', [id, currentPassword], (err, user) => {
    if (err || !user) return res.status(401).json({ error: "Senha incorreta" });
    db.run('UPDATE users SET password = ? WHERE id = ?', [newPassword, id], () => res.json({ message: "Alterada!" }));
  });
});

router.delete('/delete/:id', (req, res) => {
  db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], () => res.json({ message: "Excluída" }));
});

router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  db.run(`INSERT INTO users (name, email, password) VALUES (?, ?, ?)`, [name, email, password], function (err) {
    if (err) return res.status(400).json({ error: "Este e-mail já está em uso em outra conta." });
    res.json({ id: this.lastID, message: "Criado!" });
  });
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
        auto_return: "approved"
      }
    });

    const checkoutUrl = response.sandbox_init_point || response.init_point;
    res.json({ id: response.id, init_point: checkoutUrl });

  } catch (error) {
    console.error("Erro ao gerar pagamento:", error);
    res.status(500).json({ error: "Falha ao comunicar com o Mercado Pago" });
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
          
          db.run('UPDATE users SET plan_tier = ? WHERE id = ?', [planTier, userId], (err) => {
            if (!err) {
              console.log(`\n=======================================\n🚀 WEBHOOK SUCESSO: Usuário ID ${userId} subiu para o Plano ${planTier}!\n=======================================\n`);
            }
          });
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
    db.run('UPDATE users SET plan_tier = ? WHERE id = ?', [planTier, userId], (err) => {
      if (!err) {
        console.log(`\n=======================================\n🚀 RETORNO SUCESSO: Usuário ID ${userId} subiu para o Plano ${planTier}!\n=======================================\n`);
      }
    });
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