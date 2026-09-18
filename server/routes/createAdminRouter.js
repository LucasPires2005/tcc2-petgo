const express = require('express');
const { createRequireAdmin } = require('../middleware/requireAdmin');

function createAdminRouter({ auth, db }) {
  const router = express.Router();
  router.use(createRequireAdmin({ auth, db }));

  router.get('/me', (req, res) => res.json({ admin: req.admin }));

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
