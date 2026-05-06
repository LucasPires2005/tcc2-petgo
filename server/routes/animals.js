const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

// BUSCA GLOBAL
router.get('/', (req, res) => {
  db.all('SELECT * FROM animals ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []); 
  });
});

router.post('/', upload.single('image'), (req, res) => {
  // AJUSTE: Adicionado 'urgency' na desestruturação do corpo da requisição
  const { name, species, breed, health, latitude, longitude, userId, urgency } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  // AJUSTE: Adicionado a coluna 'urgency' e mais um '?' no final do comando SQL
  db.run(`INSERT INTO animals (name, species, breed, health, latitude, longitude, image_url, userId, urgency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
  [
    name || "Sem nome", 
    species, 
    breed, 
    health, 
    latitude, 
    longitude, 
    imageUrl, 
    userId, 
    urgency || 'Estável' // Garante que se vier vazio, salve como 'Estável'
  ], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, ...req.body });
  });
});

// NOVO: ROTA DE RESGATE ATUALIZADA (ACEITA FOTO DA PROVA)
router.patch('/:id/rescue', upload.single('rescue_image'), (req, res) => {
  const { id } = req.params;
  const { rescuer_name, rescuer_contact, userId } = req.body;
  
  // Pega o caminho da foto que o usuário acabou de tirar
  const rescueImageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  db.serialize(() => {
    // NOVO: Salvando rescue_image_url no banco
    db.run(
      `UPDATE animals SET status = 1, rescuer_name = ?, rescuer_contact = ?, rescue_image_url = ? WHERE id = ?`, 
      [rescuer_name, rescuer_contact, rescueImageUrl, id], 
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (userId) {
          db.run(`UPDATE users SET coins = coins + 50 WHERE id = ?`, [userId]);
        }
        res.json({ message: "Resgate confirmado com sucesso!", rescueImageUrl });
      }
    );
  });
});

router.get('/user/:userId', (req, res) => {
  db.all('SELECT * FROM animals WHERE userId = ?', [req.params.userId], (err, rows) => res.json(rows || []));
});

module.exports = router;