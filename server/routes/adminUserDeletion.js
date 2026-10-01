const express = require('express');
const { reasonFrom } = require('./adminRecords');

// Montado depois de requireAdmin. Nunca recebe UUID de Auth do navegador.
function createAdminUserDeletionRouter({ auth, db }) {
  const router = express.Router();
  const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params,
    (error, row) => error ? reject(error) : resolve(row)));

  router.delete('/users/:id', async (req, res) => {
    const { id } = req.params;
    const reason = reasonFrom(req.body);
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))
        || typeof req.body?.reason !== 'string' || reason === null) {
      return res.status(400).json({ error: 'Informe um usuário válido e um motivo com 3 a 500 caracteres.' });
    }
    try {
      const user = await get(`SELECT u.id, u.auth_user_id, u.name, u.email,
        EXISTS (SELECT 1 FROM petgo_private.admin_users a
          WHERE a.auth_user_id::text = u.auth_user_id::text) AS is_admin
        FROM public.users u WHERE u.id = ?`, [id]);
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado. Atualize a lista.' });
      if (user.is_admin || (user.auth_user_id && user.auth_user_id === req.admin.id)) {
        return res.status(409).json({ error: 'Contas administrativas são protegidas e não podem ser excluídas.' });
      }

      // Fail closed: sem a migração, NÃO apagar a identidade no Supabase.
      const migration = await get(`SELECT
        EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = 'public.users'::regclass
          AND tgname = 'petgo_preserve_animals_on_user_delete' AND tgenabled IN ('O', 'A')
          AND tgfoid = to_regprocedure('petgo_private.preserve_animals_on_user_delete()'))
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid = 'auth.users'::regclass
          AND tgname = 'petgo_delete_profile_with_auth_user' AND tgenabled IN ('O', 'A')
          AND tgfoid = to_regprocedure('petgo_private.delete_profile_with_auth_user()')) AS ready`);
      if (migration?.ready !== true) {
        return res.status(503).json({ error: 'Exclusão indisponível. Aplique a migração 007_admin_deletion.sql antes de continuar.' });
      }

      let authMissing = !user.auth_user_id;
      if (user.auth_user_id) {
        const { error } = await auth.admin.deleteUser(user.auth_user_id, false);
        // Não tratar timeout, falha de permissão ou Storage como "usuário ausente".
        if (error?.code === 'user_not_found') authMissing = true;
        else if (error) throw error;
      }

      if (authMissing) {
        // Conta legada ou Auth já ausente: trigger + exclusão + auditoria atômicos.
        const deleted = await get(`WITH deleted AS (
          DELETE FROM public.users WHERE id = ? AND auth_user_id::text IS NOT DISTINCT FROM ?::text RETURNING id, name, email
        ), logged AS (
          INSERT INTO petgo_private.admin_audit_log (actor_id, action, target_id, reason, details)
          SELECT ?::uuid, 'user_delete', id::text, ?, jsonb_build_object('name', name, 'email', email) FROM deleted RETURNING id
        ) SELECT deleted.id FROM deleted CROSS JOIN logged`, [id, user.auth_user_id, req.admin.id, reason]);
        if (!deleted) return res.status(409).json({ error: 'A conta mudou ou já foi excluída. Atualize a lista.' });
      } else {
        // O trigger já removeu o perfil dentro da transação de auth.users.
        const remaining = await get('SELECT id FROM public.users WHERE id = ?', [id]);
        if (remaining) throw new Error('PROFILE_DELETE_NOT_CONFIRMED');
        try {
          await get(`INSERT INTO petgo_private.admin_audit_log (actor_id, action, target_id, reason, details)
            VALUES (?::uuid, 'user_delete', ?, ?, ?::jsonb) RETURNING id`,
          [req.admin.id, String(id), reason, JSON.stringify({ name: user.name ?? null, email: user.email ?? null })]);
        } catch (error) {
          // Auth é um serviço externo: não fingir rollback de uma conta já removida.
          console.error('Conta excluída; auditoria indisponível:', { adminId: req.admin.id, userId: id, code: error.code || 'AUDIT_FAILED' });
          return res.json({ deletedId: user.id, warning: 'Conta excluída, mas não foi possível gravar o histórico. Confira os logs do servidor.' });
        }
      }
      return res.json({ deletedId: user.id });
    } catch (error) {
      console.error('Falha na exclusão de usuário:', { code: error.code || 'ADMIN_USER_DELETE_FAILED' });
      return res.status(['23503', '42501'].includes(error.code) ? 409 : 503).json({
        error: 'Não foi possível confirmar a exclusão. Atualize a lista. Se a conta permanecer, confira vínculos e permissões no Supabase.'
      });
    }
  });
  return router;
}

module.exports = { createAdminUserDeletionRouter };
