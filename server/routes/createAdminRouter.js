const express = require('express');
const { createRequireAdmin } = require('../middleware/requireAdmin');

function createAdminRouter({ auth, db }) {
  const router = express.Router();
  router.use(createRequireAdmin({ auth, db }));

  router.get('/me', (req, res) => res.json({ admin: req.admin }));

  router.get('/animals', async (req, res) => {
    const { q = '', page = '1' } = req.query;
    if (typeof q !== 'string' || q.length > 100 || typeof page !== 'string'
        || !/^[1-9]\d{0,5}$/.test(page)) {
      return res.status(400).json({ error: 'Busca ou página inválida.' });
    }
    const pageNumber = Number(page);
    const pageSize = 12;
    try {
      const row = await new Promise((resolve, reject) => db.get(
        `WITH matched AS (
           SELECT id, name, species, breed, health, status, urgency,
                  image_url, rescue_image_url, created_at
           FROM public.animals
           WHERE POSITION(? IN LOWER(COALESCE(name, ''))) > 0
         ), page_rows AS (
           SELECT * FROM matched ORDER BY created_at DESC NULLS LAST, id DESC LIMIT ? OFFSET ?
         )
         SELECT (SELECT COUNT(*) FROM matched) AS total,
           COALESCE((SELECT json_agg(p ORDER BY p.created_at DESC NULLS LAST, p.id DESC)
             FROM page_rows p), '[]'::json) AS animals`,
        [q.trim().toLowerCase(), pageSize, (pageNumber - 1) * pageSize],
        (error, result) => error ? reject(error) : resolve(result)
      ));
      const total = Number(row?.total);
      if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(row?.animals)) throw new Error('Invalid animals result');
      return res.json({ animals: row.animals, total, page: pageNumber, pageSize, totalPages: Math.ceil(total / pageSize) });
    } catch (error) {
      console.error('Falha na moderação:', { code: error.code || 'ADMIN_ANIMALS_UNAVAILABLE' });
      return res.status(503).json({ error: 'Não foi possível listar os animais. Tente novamente.' });
    }
  });

  router.delete('/animals/:id', async (req, res) => {
    if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id))) {
      return res.status(400).json({ error: 'ID de animal inválido.' });
    }
    try {
      // DELETE RETURNING evita uma consulta prévia sujeita a corrida.
      // Não remove arquivos do Storage nem modifica usuários ou moedas.
      const animal = await new Promise((resolve, reject) => db.get(
        'DELETE FROM public.animals WHERE id = ? RETURNING id', [req.params.id],
        (error, row) => error ? reject(error) : resolve(row)
      ));
      if (!animal) return res.status(404).json({ error: 'Animal não encontrado. Atualize a lista.' });
      console.info('Registro de animal excluído pelo admin:', { adminId: req.admin.id, animalId: animal.id });
      return res.json({ deletedId: animal.id });
    } catch (error) {
      console.error('Falha na exclusão administrativa:', { code: error.code || 'ADMIN_DELETE_FAILED' });
      return res.status(error.code === '23503' ? 409 : 503).json({ error: error.code === '23503'
        ? 'Este animal possui registros vinculados e não pode ser excluído.'
        : 'Não foi possível excluir. Atualize a lista antes de tentar novamente.' });
    }
  });

  router.get('/users', async (req, res) => {
    const { q = '', page = '1', plan = '' } = req.query;
    if (typeof q !== 'string' || q.length > 100 || typeof page !== 'string'
        || !/^[1-9]\d{0,5}$/.test(page) || typeof plan !== 'string'
        || !['', '0', '1', '2', '3'].includes(plan)) {
      return res.status(400).json({ error: 'Filtros inválidos. Revise a busca, o plano e a página.' });
    }
    const pageNumber = Number(page);
    const pageSize = 20;
    try {
      const row = await new Promise((resolve, reject) => {
        db.get(
          `WITH filters AS (SELECT ?::text AS term, ?::integer AS tier),
           matched AS (
             SELECT u.id, u.name, u.email, u.coins, u.plan_tier
             FROM public.users u CROSS JOIN filters f
             WHERE (f.term = '' OR POSITION(f.term IN LOWER(COALESCE(u.name, ''))) > 0
               OR POSITION(f.term IN LOWER(COALESCE(u.email, ''))) > 0)
               AND (f.tier IS NULL OR COALESCE(u.plan_tier, 0) = f.tier)
           ), page_rows AS (
             SELECT * FROM matched ORDER BY id DESC LIMIT ? OFFSET ?
           )
           SELECT (SELECT COUNT(*) FROM matched) AS total,
             COALESCE((SELECT json_agg(p ORDER BY p.id DESC) FROM page_rows p), '[]'::json) AS users`,
          [q.trim().toLowerCase(), plan === '' ? null : Number(plan), pageSize, (pageNumber - 1) * pageSize],
          (error, result) => error ? reject(error) : resolve(result)
        );
      });
      const total = Number(row?.total);
      if (!Number.isSafeInteger(total) || total < 0 || !Array.isArray(row?.users)) throw new Error('Invalid users result');
      return res.json({ users: row.users, total, page: pageNumber, pageSize, totalPages: Math.ceil(total / pageSize) });
    } catch (error) {
      console.error('Falha na listagem administrativa:', { code: error.code || 'ADMIN_USERS_UNAVAILABLE' });
      return res.status(503).json({ error: 'Não foi possível carregar os usuários. Tente novamente.' });
    }
  });

  router.get('/summary', async (req, res) => {
    try {
      // Uma consulta mantém as duas contagens no mesmo snapshot do banco.
      // Usuários são perfis PetGo (public.users), não todas as contas de Auth.
      const row = await new Promise((resolve, reject) => {
        db.get(
          `SELECT
             (SELECT COUNT(*) FROM public.users) AS users,
             (SELECT COUNT(*) FROM public.animals) AS animals`,
          [],
          (error, result) => error ? reject(error) : resolve(result)
        );
      });
      const users = Number(row?.users);
      const animals = Number(row?.animals);
      if (![users, animals].every((count) => Number.isSafeInteger(count) && count >= 0)) {
        throw new Error('Invalid aggregate result');
      }
      return res.json({ users, animals, updatedAt: new Date().toISOString() });
    } catch (error) {
      console.error('Falha ao carregar resumo administrativo:', { code: error.code || 'ADMIN_SUMMARY_UNAVAILABLE' });
      return res.status(503).json({ error: 'Não foi possível carregar as contagens. Tente novamente.' });
    }
  });

  return router;
}

module.exports = { createAdminRouter };
