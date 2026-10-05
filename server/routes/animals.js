const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { moderateImage } = require('../services/imageModeration');
const { reserveAnimalCreation, releaseAnimalCreation } = require('../services/animalCreationLimit');
const { createAnimalAuthorDeletionRouter } = require('./animalAuthorDeletion');
const { createRequireMobileUser, bindAnimalActor } = require('../middleware/requireMobileUser');
const profanityFilter = require('../middlewares/profanityFilter');
const { normalizeEmail, isValidEmail } = require('../services/credentialValidation');
const { isValidCpf, matchesCpfHmac, CPF_KEY_VERSION, ELIGIBILITY_STATUS } = require('../services/eligibilityValidation');
const RESCUE_TERMS_VERSION = '2026-10-02-v1';
router.use(createRequireMobileUser({ db }));

// Configuração do Supabase Client
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
router.use(createAnimalAuthorDeletionRouter({ db, storage: supabase.storage, supabaseUrl: SUPABASE_URL }));

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
router.post('/', upload.single('image'), bindAnimalActor, profanityFilter, async (req, res) => {
  const { name, species, breed, health, latitude, longitude, userId, urgency } = req.body;
  let reservation;
  try {
    reservation = await reserveAnimalCreation(db, req.mobileUser.id);
  } catch (error) {
    console.error('Erro ao verificar limite de cadastros:', { code: error.code || 'ANIMAL_LIMIT_UNAVAILABLE' });
    return res.status(503).json({ error: 'Não foi possível verificar o limite de cadastros. Tente novamente.', code: 'ANIMAL_LIMIT_UNAVAILABLE' });
  }
  if (!reservation.allowed) {
    res.set('Retry-After', String(reservation.retryAfter));
    return res.status(429).json({
      error: reservation.daily
        ? 'Você atingiu o limite de 20 cadastros de animais por dia. Tente novamente após a meia-noite de Brasília.'
        : 'Você atingiu o limite de 5 cadastros de animais em 5 minutos. Aguarde e tente novamente.',
      code: 'ANIMAL_CREATION_LIMIT', retryAfter: reservation.retryAfter
    });
  }
  let created = false;
  try {
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
    const sql = `INSERT INTO animals (name, species, breed, health, latitude, longitude, image_url, "userId", urgency, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      name || "Sem nome", species, breed, health,
      parsedLatitude, parsedLongitude, imageUrl, parsedUserId, urgency || 'Estável', req.mobileUser.id
    ];

    await new Promise((resolve, reject) => db.run(sql, params, error => error ? reject(error) : resolve()));
    created = true;
    res.json({ message: "Animal cadastrado com sucesso!", ...req.body, image_url: imageUrl, creator_id: req.mobileUser.id });
  } catch (error) {
    console.error('Erro ao cadastrar animal:', { code: error.code || 'ANIMAL_CREATE_FAILED' });
    res.status(500).json({ error: 'Não foi possível cadastrar o animal. Tente novamente.' });
  } finally {
    if (!created) {
      await releaseAnimalCreation(db, req.mobileUser.id, reservation.reservationId).catch(error => {
        // Falha conservadora: mantém a vaga contabilizada, sem liberar cota indevidamente.
        console.error('Erro ao liberar reserva de cadastro:', { code: error.code || 'ANIMAL_LIMIT_RELEASE_FAILED' });
      });
    }
  }
});

// Status do animal e recompensa são confirmados na mesma conexão/transação.
router.patch('/:id/rescue', upload.single('rescue_image'), bindAnimalActor, profanityFilter, async (req, res) => {
  const { id } = req.params;
  const { rescuer_cpf, acceptedResponsibility } = req.body;
  const rescuer_name = typeof req.body.rescuer_name === 'string' ? req.body.rescuer_name.trim() : '';
  const phoneInput = typeof req.body.rescuer_contact === 'string' ? req.body.rescuer_contact.trim() : '';
  let rescuer_contact = phoneInput.replace(/[+(). -]/g, '');
  if (phoneInput.startsWith('+55') || ([12, 13].includes(rescuer_contact.length) && rescuer_contact.startsWith('55'))) {
    rescuer_contact = rescuer_contact.slice(2);
  }
  const rescuer_email = normalizeEmail(req.body.rescuer_email);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    return res.status(400).json({ error: 'Identificador de animal inválido.' });
  }
  if (rescuer_name.length < 2 || rescuer_name.length > 120
      || /[\u0000-\u001f\u007f]/.test(req.body.rescuer_name)) {
    return res.status(400).json({ error: 'Informe seu nome, entre 2 e 120 caracteres.', code: 'RESCUER_NAME_INVALID' });
  }
  if (phoneInput.length > 32 || !/^(?:\+55)?[0-9(). -]+$/.test(phoneInput) || !/^[0-9]{10,11}$/.test(rescuer_contact)) {
    return res.status(400).json({ error: 'Informe um telefone com DDD, com 10 ou 11 números.', code: 'RESCUER_CONTACT_INVALID' });
  }
  if (!isValidEmail(rescuer_email)) {
    return res.status(400).json({ error: 'Formato de e-mail inválido.', code: 'RESCUER_EMAIL_INVALID' });
  }
  if (!isValidCpf(rescuer_cpf)) {
    return res.status(400).json({ error: 'CPF inválido. Confira os números informados.', code: 'CPF_INVALID' });
  }
  if (acceptedResponsibility !== true && acceptedResponsibility !== 'true') {
    return res.status(400).json({ error: 'Confirme a declaração de responsabilidade para continuar.', code: 'RESPONSIBILITY_REQUIRED' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Adicione a foto de prova do resgate.', code: 'RESCUE_IMAGE_REQUIRED' });
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
      let eligibility;
      try {
        eligibility = (await tx.query(`SELECT cpf_hmac, cpf_key_version, status
          FROM petgo_private.user_eligibility WHERE user_id = $1 FOR SHARE`, [userId])).rows[0];
      } catch {
        throw Object.assign(new Error('ELIGIBILITY_UNAVAILABLE'), { code: 'ELIGIBILITY_UNAVAILABLE' });
      }
      if (!eligibility || eligibility.status !== ELIGIBILITY_STATUS) {
        return { status: 403, body: { error: 'Complete sua declaração de maioridade antes de resgatar.', code: 'ELIGIBILITY_REQUIRED' } };
      }
      let cpfMatches;
      try {
        if (eligibility.cpf_key_version !== CPF_KEY_VERSION || !/^[0-9a-f]{64}$/.test(eligibility.cpf_hmac)) {
          throw new Error('ELIGIBILITY_UNAVAILABLE');
        }
        cpfMatches = matchesCpfHmac(rescuer_cpf, eligibility.cpf_hmac, eligibility.cpf_key_version);
      } catch {
        throw Object.assign(new Error('ELIGIBILITY_UNAVAILABLE'), { code: 'ELIGIBILITY_UNAVAILABLE' });
      }
      if (!cpfMatches) {
        return { status: 400, body: { error: 'O CPF deve ser o mesmo informado na declaração de maioridade.', code: 'CPF_DECLARATION_MISMATCH' } };
      }
      // A declaração continua invisível até o commit. Falhas de migração/permissão
      // são detectadas antes do upload; qualquer falha posterior também a desfaz.
      try {
        await tx.query(`INSERT INTO petgo_private.rescue_declarations
          (animal_id, user_id, rescuer_name, rescuer_contact, rescuer_email, terms_version)
          VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, userId, rescuer_name, rescuer_contact, rescuer_email, RESCUE_TERMS_VERSION]);
      } catch {
        throw Object.assign(new Error('ELIGIBILITY_UNAVAILABLE'), { code: 'ELIGIBILITY_UNAVAILABLE' });
      }
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
    if (error.code === 'ELIGIBILITY_UNAVAILABLE') {
      return res.status(503).json({ error: 'Não foi possível validar a declaração de responsabilidade. Tente novamente.', code: 'ELIGIBILITY_UNAVAILABLE' });
    }
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
