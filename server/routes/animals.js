const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

// BUSCA GLOBAL
router.get('/', (req, res) => {
  db.all('SELECT * FROM animals ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error("Erro no GET /animals:", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []); 
  });
});

router.post('/', upload.single('image'), (req, res) => {
  const { name, species, breed, health, latitude, longitude, userId, urgency } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  // Garante conversão correta para números para o Postgres não recusar
  const parsedLatitude = latitude ? parseFloat(latitude) : null;
  const parsedLongitude = longitude ? parseFloat(longitude) : null;
  const parsedUserId = userId ? parseInt(userId, 10) : null;

  const sql = `INSERT INTO animals (name, species, breed, health, latitude, longitude, image_url, "userId", urgency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  
  const params = [
    name || "Sem nome", 
    species, 
    breed, 
    health, 
    parsedLatitude, 
    parsedLongitude, 
    imageUrl, 
    parsedUserId, 
    urgency || 'Estável'
  ];

  db.run(sql, params, function (err) {
    if (err) {
      console.error("ERRO AO CADASTRAR ANIMAL NO SUPABASE:", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: "Animal cadastrado com sucesso!", ...req.body });
  });
});

// ROTA DE RESGATE CORRIGIDA (VINCULA O USERID AO ANIMAL RESGATADO)
router.patch('/:id/rescue', upload.single('rescue_image'), (req, res) => {
  const { id } = req.params;
  const { rescuer_name, rescuer_contact, userId } = req.body;
  const rescueImageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const parsedUserId = userId ? parseInt(userId, 10) : null;

  db.run(
    `UPDATE animals SET status = 1, rescuer_name = ?, rescuer_contact = ?, rescue_image_url = ?, "userId" = ? WHERE id = ?`, 
    [rescuer_name, rescuer_contact, rescueImageUrl, parsedUserId, id], 
    (err) => {
      if (err) {
        console.error("Erro no PATCH rescue:", err.message);
        return res.status(500).json({ error: err.message });
      }
      
      if (parsedUserId) {
        db.run(`UPDATE users SET coins = coins + 50 WHERE id = ?`, [parsedUserId]);
      }
      res.json({ message: "Resgate confirmado com sucesso!", rescueImageUrl });
    }
  );
});

router.get('/user/:userId', (req, res) => {
  db.all('SELECT * FROM animals WHERE "userId" = ?', [req.params.userId], (err, rows) => {
    if (err) {
      console.error("Erro no GET /user/:userId:", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

module.exports = router;