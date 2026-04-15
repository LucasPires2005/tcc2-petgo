const express = require('express');
const router = express.Router();
const db = require('../db');

// ... (Login, Register, Update, etc - mantenha como estão)

// ROTA: UPGRADE PARA PRO (Custo: 50 PetCoins)
router.post('/upgrade-pro', (req, res) => {
  const { userId } = req.body;
  const cost = 50;

  db.get('SELECT coins, is_premium FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: "Usuário não encontrado" });
    if (user.is_premium === 1) return res.status(400).json({ error: "Você já é um Membro PRO!" });
    if (user.coins < cost) return res.status(400).json({ error: "Saldo insuficiente! Resgate mais animais para ganhar moedas." });

    const newBalance = user.coins - cost;
    db.run('UPDATE users SET coins = ?, is_premium = 1 WHERE id = ?', [newBalance, userId], (err) => {
      if (err) return res.status(500).json({ error: "Erro ao processar upgrade" });
      db.get('SELECT id, name, email, coins, is_premium FROM users WHERE id = ?', [userId], (err, updatedUser) => {
        res.json({ success: true, user: updatedUser });
      });
    });
  });
});

// ROTA: DOAR MOEDAS PARA UM RESGATE
router.post('/donate', (req, res) => {
  const { userId, amount } = req.body;
  db.get('SELECT coins FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: "Usuário não encontrado" });
    if (user.coins < amount) return res.status(400).json({ error: "Saldo insuficiente" });

    const newBalance = user.coins - amount;
    db.run('UPDATE users SET coins = ? WHERE id = ?', [newBalance, userId], (err) => {
      if (err) return res.status(500).json({ error: "Erro ao processar doação" });
      res.json({ success: true, newBalance });
    });
  });
});

// MANTENHA AS OUTRAS ROTAS (REDEEM, LOGIN, ETC) ABAIXO...
router.post('/redeem', (req, res) => {
  const { userId, cost } = req.body;
  db.get('SELECT coins FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: "Usuário não encontrado" });
    if (user.coins < cost) return res.status(400).json({ error: "Saldo de PetCoins insuficiente!" });
    const newBalance = user.coins - cost;
    db.run('UPDATE users SET coins = ? WHERE id = ?', [newBalance, userId], (updateErr) => {
      if (updateErr) return res.status(500).json({ error: "Erro ao processar resgate" });
      const couponCode = "PET-" + Math.random().toString(36).substr(2, 9).toUpperCase();
      res.json({ success: true, newBalance, couponCode });
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
    else res.status(404).json({ error: "Usuário não encontrado" });
  });
});

router.put('/update', (req, res) => {
  const { id, name, email } = req.body;
  db.run(`UPDATE users SET name = ?, email = ? WHERE id = ?`, [name, email, id], function (err) {
    if (err) return res.status(400).json({ error: "Erro ao atualizar." });
    db.get('SELECT id, name, email, coins, is_premium FROM users WHERE id = ?', [id], (err, user) => {
      res.json(user);
    });
  });
});

router.put('/change-password', (req, res) => {
  const { id, currentPassword, newPassword } = req.body;
  db.get('SELECT * FROM users WHERE id = ? AND password = ?', [id, currentPassword], (err, user) => {
    if (err || !user) return res.status(401).json({ error: "Senha atual incorreta." });
    db.run('UPDATE users SET password = ? WHERE id = ?', [newPassword, id], () => res.json({ message: "Senha alterada!" }));
  });
});

router.delete('/delete/:id', (req, res) => {
  db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], () => res.json({ message: "Conta excluída." }));
});

router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  db.run(`INSERT INTO users (name, email, password) VALUES (?, ?, ?)`, [name, email, password], function (err) {
    if (err) return res.status(400).json({ error: "E-mail já cadastrado." });
    res.json({ id: this.lastID, message: "Usuário criado!" });
  });
});

module.exports = router;