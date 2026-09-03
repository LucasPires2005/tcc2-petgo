const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

// Configuração do Supabase Client
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Armazena a imagem temporariamente na memória RAM para fazer o upload dos bytes
const upload = multer({ storage: multer.memoryStorage() });

// Função auxiliar para realizar o upload para o bucket 'animals' no Supabase Storage
async function uploadToSupabase(file) {
  if (!file) return null;
  
  const fileExt = file.originalname ? file.originalname.split('.').pop() : 'jpg';
  const fileName = `rescue_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

  const { error } = await supabase.storage
    .from('animals')
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: true
    });

  if (error) {
    console.error('Erro no upload para o Supabase Storage:', error.message);
    throw error;
  }

  const { data: publicUrlData } = supabase.storage
    .from('animals')
    .getPublicUrl(fileName);

  return publicUrlData.publicUrl;
}

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

// CADASTRO DE ANIMAL
router.post('/', upload.single('image'), async (req, res) => {
  const { name, species, breed, health, latitude, longitude, userId, urgency } = req.body;
  
  let imageUrl = null;
  if (req.file) {
    try {
      imageUrl = await uploadToSupabase(req.file);
    } catch (err) {
      return res.status(500).json({ error: "Erro ao salvar imagem no Supabase Storage: " + err.message });
    }
  }

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
    res.json({ message: "Animal cadastrado com sucesso!", ...req.body, image_url: imageUrl });
  });
});

// ROTA DE RESGATE CORRIGIDA (APLICA MULTIPLICADOR DE MOEDAS DO PLAN_TIER DO USUÁRIO)
router.patch('/:id/rescue', upload.single('rescue_image'), async (req, res) => {
  const { id } = req.params;
  const { rescuer_name, rescuer_contact, userId } = req.body;
  
  let rescueImageUrl = null;
  if (req.file) {
    try {
      rescueImageUrl = await uploadToSupabase(req.file);
    } catch (err) {
      return res.status(500).json({ error: "Erro ao salvar imagem de resgate no Supabase Storage: " + err.message });
    }
  }

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
        // Busca o plan_tier do usuário para calcular o multiplicador (1x, 2x ou 3x)
        db.get(`SELECT plan_tier FROM users WHERE id = ?`, [parsedUserId], (errUser, userRow) => {
          let multiplier = 1;
          if (!errUser && userRow && userRow.plan_tier) {
            const tier = parseInt(userRow.plan_tier, 10);
            if (tier === 2) multiplier = 2;
            if (tier === 3) multiplier = 3;
          }
          const baseCoins = 50;
          const earnedCoins = baseCoins * multiplier;

          db.run(`UPDATE users SET coins = COALESCE(coins, 0) + ? WHERE id = ?`, [earnedCoins, parsedUserId], (errCoins) => {
            if (errCoins) {
              console.error("Erro ao creditar moedas do resgate:", errCoins.message);
            }
            return res.json({ 
              message: "Resgate confirmado com sucesso!", 
              rescueImageUrl, 
              earnedCoins, 
              multiplier 
            });
          });
        });
      } else {
        res.json({ message: "Resgate confirmado com sucesso!", rescueImageUrl, earnedCoins: 0, multiplier: 1 });
      }
    }
  );
});

// BUSCA POR USUÁRIO
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