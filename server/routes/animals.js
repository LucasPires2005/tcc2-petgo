const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

router.post('/', upload.single('image'), (req, res) => {
  const { name, species, breed, health, latitude, longitude, userId } = req.body; // userId aqui
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  const query = `INSERT INTO animals (name, species, breed, health, latitude, longitude, image_url, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(query, [name || "Sem nome", species, breed, health, latitude, longitude, imageUrl, userId], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, imageUrl, ...req.body });
  });
});

// ROTA MEUS RESGATES (NOVA)
router.get('/user/:userId', (req, res) => {
  const { userId } = req.params;
  db.all('SELECT * FROM animals WHERE userId = ?', [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

router.get('/', (req, res) => {
  db.all('SELECT * FROM animals WHERE status = 0', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

router.patch('/:id/rescue', (req, res) => {
  const { id } = req.params;
  const { rescuer_name, rescuer_contact } = req.body;
  db.run(`UPDATE animals SET status = 1, rescuer_name = ?, rescuer_contact = ? WHERE id = ?`, [rescuer_name, rescuer_contact, id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Resgatado!" });
  });
});

router.get('/rescued', (req, res) => {
  db.all('SELECT * FROM animals WHERE status = 1', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

module.exports = router;