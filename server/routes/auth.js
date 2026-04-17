const express = require('express');
const router = express.Router();
const db = require('../db');

// ROTA: COMPRA DE PRODUTOS DA LOJA (Coins)
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

// ... (Mantenha Login, Register, Update Status, Upgrade PRO e Donate como estavam)

router.post('/upgrade-pro', (req, res) => {
  const { userId } = req.body;
  const cost = 50;
  db.get('SELECT coins, is_premium FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: "Usuário não encontrado" });
    if (user.is_premium === 1) return res.status(400).json({ error: "Você já é PRO" });
    if (user.coins < cost) return res.status(400).json({ error: "Saldo insuficiente" });
    const newBalance = user.coins - cost;
    db.run('UPDATE users SET coins = ?, is_premium = 1 WHERE id = ?', [newBalance, userId], () => {
      db.get('SELECT id, name, email, coins, is_premium FROM users WHERE id = ?', [userId], (err, updated) => res.json({ success: true, user: updated }));
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
  db.get('SELECT id, name, email, coins, is_premium FROM users WHERE email = ? AND password = ?', [email, password], (err, user) => {
    if (err || !user) return res.status(401).json({ error: "Credenciais inválidas" });
    res.json(user);
  });
});

router.get('/update-status/:id', (req, res) => {
  db.get('SELECT id, name, email, coins, is_premium FROM users WHERE id = ?', [req.params.id], (err, user) => {
    if (user) res.json(user);
    else res.status(404).json({ error: "Não encontrado" });
  });
});

router.put('/update', (req, res) => {
  const { id, name, email } = req.body;
  db.run(`UPDATE users SET name = ?, email = ? WHERE id = ?`, [name, email, id], () => {
    db.get('SELECT id, name, email, coins, is_premium FROM users WHERE id = ?', [id], (err, user) => res.json(user));
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
    if (err) return res.status(400).json({ error: "E-mail cadastrado" });
    res.json({ id: this.lastID, message: "Criado!" });
  });
});

module.exports = router;