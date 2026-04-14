const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

// BUSCA GLOBAL - Envia tudo para o App sincronizar
router.get('/', (req, res) => {
  db.all('SELECT * FROM animals ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []); 
  });
});

router.post('/', upload.single('image'), (req, res) => {
  const { name, species, breed, health, latitude, longitude, userId } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  db.run(`INSERT INTO animals (name, species, breed, health, latitude, longitude, image_url, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
  [name || "Sem nome", species, breed, health, latitude, longitude, imageUrl, userId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, ...req.body });
  });
});

router.patch('/:id/rescue', (req, res) => {
  const { id } = req.params;
  const { rescuer_name, rescuer_contact, userId } = req.body;
  db.serialize(() => {
    db.run(`UPDATE animals SET status = 1, rescuer_name = ?, rescuer_contact = ? WHERE id = ?`, 
    [rescuer_name, rescuer_contact, id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      if (userId) db.run(`UPDATE users SET coins = coins + 50 WHERE id = ?`, [userId]);
      res.json({ message: "Resgate confirmado!" });
    });
  });
});

router.get('/user/:userId', (req, res) => {
  db.all('SELECT * FROM animals WHERE userId = ?', [req.params.userId], (err, rows) => res.json(rows || []));
});

module.exports = router;