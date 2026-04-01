const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Garante que a pasta 'uploads' exista para não dar erro no Multer
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuração de armazenamento das fotos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); 
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// ROTA: Criar novo animal (com logs de erro detalhados)
router.post('/', upload.single('image'), (req, res) => {
  const { name, species, breed, health, latitude, longitude } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  // Log para você ver no terminal do VS Code o que está chegando
  console.log("📥 Tentando salvar animal:", { name, species, imageUrl });

  const query = `
    INSERT INTO animals (name, species, breed, health, latitude, longitude, image_url) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  const params = [
    name || "Sem nome", 
    species, 
    breed, 
    health, 
    parseFloat(latitude), 
    parseFloat(longitude), 
    imageUrl
  ];

  db.run(query, params, function (err) {
    if (err) {
      // ESTE LOG É A CHAVE: Ele vai te dizer se a coluna 'image_url' não existe
      console.error("❌ ERRO NO SQLITE:", err.message);
      return res.status(500).json({ error: err.message });
    }
    
    console.log("✅ Animal salvo com sucesso! ID:", this.lastID);
    res.json({ id: this.lastID, imageUrl, ...req.body });
  });
});

// ROTA: Listar animais perdidos (status 0)
router.get('/', (req, res) => {
  db.all('SELECT * FROM animals WHERE status = 0', [], (err, rows) => {
    if (err) {
      console.error("❌ ERRO AO BUSCAR:", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

// ROTA: Resgatar animal (PATCH)
router.patch('/:id/rescue', (req, res) => {
  const { id } = req.params;
  const { rescuer_name, rescuer_contact } = req.body;
  const query = `UPDATE animals SET status = 1, rescuer_name = ?, rescuer_contact = ? WHERE id = ?`;

  db.run(query, [rescuer_name, rescuer_contact, id], function (err) {
    if (err) {
      console.error("❌ ERRO NO RESGATE:", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: "Animal resgatado com sucesso! ❤️" });
  });
});

// ROTA: Listar animais já resgatados
router.get('/rescued', (req, res) => {
  db.all('SELECT * FROM animals WHERE status = 1', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

module.exports = router;