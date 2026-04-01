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

// MUITO IMPORTANTE: Essa linha tem que existir!
module.exports = router;