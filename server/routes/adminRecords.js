const express = require('express');

function reasonFrom(body) {
  // Compatibilidade com painel anterior: ausência explícita fica identificada no histórico.
  if (body?.reason === undefined) return 'Não informado (painel anterior)';
  if (typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.trim().length > 500) return null;
  return body.reason.trim();
}

// Deve ser montado SOMENTE depois de requireAdmin.
function createAdminRecordsRouter({ db, supabaseUrl }) {
  const router = express.Router();
  const get = (sql, params) => new Promise((resolve, reject) => db.get(sql, params,
    (error, row) => error ? reject(error) : resolve(row)));
  const validPage = page => typeof page === 'string' && /^[1-9]\d{0,5}$/.test(page);

  router.get('/audit', async (req, res) => {
    const { page = '1', action = '' } = req.query;
    if (!validPage(page) || typeof action !== 'string' || !['', 'user_ban', 'user_unban', 'animal_delete'].includes(action)) {
      return res.status(400).json({ error: 'Página ou ação inválida.' });
    }
    try {
      const result = await get(`WITH matched AS (
        SELECT id::text, actor_id, action, target_id, reason, details, created_at
        FROM petgo_private.admin_audit_log WHERE (?::text = '' OR action = ?)
      ), page_rows AS (SELECT * FROM matched ORDER BY created_at DESC, id::bigint DESC LIMIT 20 OFFSET ?)
      SELECT (SELECT count(*) FROM matched) AS total,
        COALESCE((SELECT json_agg(p ORDER BY p.created_at DESC, p.id::bigint DESC) FROM page_rows p), '[]'::json) AS entries`,
      [action, action, (Number(page) - 1) * 20]);
      const total = Number(result?.total);
      if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(result?.entries)) throw new Error('Invalid audit');
      res.json({ entries: result.entries, total, page: Number(page), totalPages: Math.ceil(total / 20) });
    } catch (error) {
      console.error('Falha no histórico administrativo:', { code: error.code || 'AUDIT_UNAVAILABLE' });
      res.status(503).json({ error: 'Não foi possível consultar o histórico. Confira a migração do painel.' });
    }
  });

  router.get('/files', async (req, res) => {
    const { page = '1', q = '', link = '' } = req.query;
    if (!validPage(page) || typeof q !== 'string' || q.length > 100 || !['', 'linked', 'unlinked'].includes(link)) {
      return res.status(400).json({ error: 'Filtros de arquivos inválidos.' });
    }
    try {
      const url = new URL(supabaseUrl);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid storage URL');
      const prefix = `${url.origin}/storage/v1/object/public/animals/`;
      // Somente leitura de metadados. Nunca excluir storage.objects por SQL.
      // Vínculo por URL pública exata; URLs assinadas/legadas não são classificadas como prova de abandono.
      const result = await get(`WITH inventory AS (
        SELECT o.id, o.name, o.created_at, o.metadata->>'size' AS size_bytes,
          o.metadata->>'mimetype' AS mime_type,
          COALESCE((SELECT json_agg(a.id ORDER BY a.id) FROM public.animals a
            WHERE a.image_url = ? || o.name OR a.rescue_image_url = ? || o.name), '[]'::json) AS animal_ids
        FROM storage.objects o WHERE o.bucket_id = 'animals' AND POSITION(? IN LOWER(o.name)) > 0
      ), matched AS (
        SELECT * FROM inventory WHERE ?::text = ''
          OR (? = 'linked' AND json_array_length(animal_ids) > 0)
          OR (? = 'unlinked' AND json_array_length(animal_ids) = 0)
      ), page_rows AS (SELECT * FROM matched ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET ?)
      SELECT (SELECT count(*) FROM matched) AS total,
        COALESCE((SELECT json_agg(p ORDER BY p.created_at DESC, p.id DESC) FROM page_rows p), '[]'::json) AS files`,
      [prefix, prefix, q.trim().toLowerCase(), link, link, link, (Number(page) - 1) * 20]);
      const total = Number(result?.total);
      if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(result?.files)) throw new Error('Invalid inventory');
      res.json({ files: result.files.map(file => ({ ...file,
        url: prefix + String(file.name).split('/').map(encodeURIComponent).join('/') })),
      total, page: Number(page), totalPages: Math.ceil(total / 20) });
    } catch (error) {
      console.error('Falha no inventário:', { code: error.code || 'FILES_UNAVAILABLE' });
      res.status(503).json({ error: 'Inventário indisponível. Confira a conexão SQL e a permissão de leitura dos metadados do Storage.' });
    }
  });
  return router;
}
module.exports = { createAdminRecordsRouter, reasonFrom };
