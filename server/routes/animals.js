const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { moderateImage } = require('../services/imageModeration');
const { createRequireMobileUser, bindAnimalActor } = require('../middleware/requireMobileUser');
router.use(createRequireMobileUser({ db }));

// Configuração do Supabase Client
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Armazena a imagem temporariamente na memória RAM para fazer o upload dos bytes
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      return callback(new Error('Formato de imagem não permitido.'));
    }

    callback(null, true);
  }
});

async function validateUploadedImage(file, res) {
  try {
    const moderation = await moderateImage(file);

    if (!moderation.allowed) {
      res.status(422).json({
        error: moderation.reason,
        code: 'IMAGE_REJECTED'
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error('Erro na moderação de imagem:', error.message);
    res.status(503).json({
      error: 'Não foi possível verificar a segurança da imagem. Tente novamente.',
      code: 'MODERATION_UNAVAILABLE'
    });
    return false;
  }
}

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
router.post('/', upload.single('image'), bindAnimalActor, async (req, res) => {
  const { name, species, breed, health, latitude, longitude, userId, urgency } = req.body;

  if (!(await validateUploadedImage(req.file, res))) return;
  
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

// Status do animal e recompensa são confirmados na mesma conexão/transação.
router.patch('/:id/rescue', upload.single('rescue_image'), bindAnimalActor, async (req, res) => {
  const { id } = req.params;
  const { rescuer_name, rescuer_contact } = req.body;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    return res.status(400).json({ error: 'Identificador de animal inválido.' });
  }
  if (!(await validateUploadedImage(req.file, res))) return;
  try {
    const result = await db.transaction(async tx => {
      const animal = (await tx.query(
        'SELECT id, status FROM public.animals WHERE id = $1 FOR UPDATE', [id]
      )).rows[0];
      if (!animal) return { status: 404, body: { error: 'Animal não encontrado.' } };
      if (animal.status !== null && Number(animal.status) !== 0) {
        return { status: 409, body: { error: 'Este animal já foi resgatado ou não está disponível.', code: 'ANIMAL_ALREADY_RESCUED' } };
      }
      const userId = req.mobileUser.id;
      const user = (await tx.query(`SELECT coins, CASE WHEN
        (subscription_start_date IS NULL AND subscription_end_date IS NULL)
        OR subscription_end_date > clock_timestamp() THEN plan_tier ELSE 0 END AS plan_tier
        FROM public.users WHERE id = $1 FOR UPDATE`, [userId])).rows[0];
      if (!user) return { status: 404, body: { error: 'Usuário não encontrado.' } };
      const multiplier = Number(user.plan_tier) === 3 ? 3 : Number(user.plan_tier) === 2 ? 2 : 1;
      const earnedCoins = 50 * multiplier;
      // Upload só após obter o lock e verificar disponibilidade. Storage não faz parte do SQL:
      // falha posterior pode deixar arquivo órfão, mas nunca resgate/recompensa parcialmente gravados.
      const rescueImageUrl = req.file ? await uploadToSupabase(req.file) : null;
      await tx.query(`UPDATE public.animals SET status = 1, rescuer_name = $1,
        rescuer_contact = $2, rescue_image_url = $3, "userId" = $4 WHERE id = $5`,
      [rescuer_name, rescuer_contact, rescueImageUrl, userId, id]);
      const credited = (await tx.query(`UPDATE public.users SET coins = COALESCE(coins, 0) + $1
        WHERE id = $2 AND COALESCE(coins, 0) >= 0
        AND COALESCE(coins, 0) <= 2147483647 - $1 RETURNING coins`, [earnedCoins, userId])).rows[0];
      if (!credited) throw new Error('RESCUE_BALANCE_INVALID');
      return { status: 200, body: { message: 'Resgate confirmado com sucesso!',
        rescueImageUrl, earnedCoins, multiplier } };
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Erro na transação de resgate:', { code: error.code || 'RESCUE_FAILED' });
    res.status(500).json({ error: 'Não foi possível confirmar o resgate e sua recompensa. Atualize a lista e tente novamente.' });
  }
});

// BUSCA POR USUÁRIO
router.get('/user/:userId', (req, res) => {
  if (String(req.mobileUser.id) !== req.params.userId) return res.status(403).json({ error: 'Acesso a outra conta não permitido.' });
  db.all('SELECT * FROM animals WHERE "userId" = ?', [req.params.userId], (err, rows) => {
    if (err) {
      console.error("Erro no GET /user/:userId:", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows || []);
  });
});

module.exports = router;
