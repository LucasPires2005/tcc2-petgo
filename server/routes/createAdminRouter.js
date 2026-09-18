const express = require('express');
const { createRequireAdmin } = require('../middleware/requireAdmin');

function createAdminRouter({ auth, db }) {
  const router = express.Router();
  router.use(createRequireAdmin({ auth, db }));

  router.get('/me', (req, res) => res.json({ admin: req.admin }));

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
