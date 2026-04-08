const express = require('express');
const router = express.Router();
const db = require('../db');

// Cadastro
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  const query = `INSERT INTO users (name, email, password) VALUES (?, ?, ?)`;
  db.run(query, [name, email, password], function (err) {
    if (err) return res.status(400).json({ error: "E-mail já cadastrado." });
    res.json({ id: this.lastID, message: "Usuário criado!" });
  });
});

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, user) => {
    if (err || !user) return res.status(401).json({ error: "Credenciais inválidas" });
    res.json({ id: user.id, email: user.email, name: user.name });
  });
});

// Atualizar Dados
router.put('/update', (req, res) => {
  const { id, name, email } = req.body;
  db.run(`UPDATE users SET name = ?, email = ? WHERE id = ?`, [name, email, id], function (err) {
    if (err) return res.status(400).json({ error: "Erro ao atualizar." });
    res.json({ message: "Dados atualizados!" });
  });
});

// ALTERAR SENHA (NOVO)
router.put('/change-password', (req, res) => {
  const { id, currentPassword, newPassword } = req.body;
  db.get('SELECT * FROM users WHERE id = ? AND password = ?', [id, currentPassword], (err, user) => {
    if (err || !user) return res.status(401).json({ error: "Senha atual incorreta." });
    db.run('UPDATE users SET password = ? WHERE id = ?', [newPassword, id], function(err) {
      if (err) return res.status(400).json({ error: "Erro ao mudar senha." });
      res.json({ message: "Senha alterada!" });
    });
  });
});

// Excluir Conta
router.delete('/delete/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM users WHERE id = ?`, [id], function (err) {
    if (err) return res.status(400).json({ error: "Erro ao excluir conta." });
    res.json({ message: "Conta excluída." });
  });
});

module.exports = router;