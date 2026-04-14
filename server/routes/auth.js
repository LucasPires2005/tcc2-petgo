const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  db.run(`INSERT INTO users (name, email, password) VALUES (?, ?, ?)`, [name, email, password], function (err) {
    if (err) return res.status(400).json({ error: "E-mail já cadastrado." });
    res.json({ id: this.lastID, message: "Usuário criado!" });
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT id, name, email, coins, is_premium FROM users WHERE email = ? AND password = ?', [email, password], (err, user) => {
    if (err || !user) return res.status(401).json({ error: "Credenciais inválidas" });
    res.json(user);
  });
});

// Rota para o App atualizar o saldo em tempo real
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

module.exports = router;