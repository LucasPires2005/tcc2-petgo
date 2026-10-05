const express = require('express');
const { cleanupAnimalPhotos } = require('../services/animalStorageCleanup');
const profanityFilter = require('../middlewares/profanityFilter');

// Montado somente depois do middleware de sessão mobile.
function createAnimalAuthorDeletionRouter({ db, storage, supabaseUrl }) {
  const router = express.Router();
  router.delete('/:id', profanityFilter, async (req, res) => {
    const { id } = req.params;
    const reason = req.body?.reason;
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))
        || typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500) {
      return res.status(400).json({ error: 'Informe um registro válido e um motivo com 3 a 500 caracteres.' });
    }
    try {
      // Autorização no próprio DELETE: sem janela entre conferir autoria e excluir.
      // O lock do DELETE também serializa a operação com o resgate existente.
      const animal = await new Promise((resolve, reject) => db.get(`WITH deleted AS (
        DELETE FROM public.animals WHERE id = ? AND creator_id = ?
        RETURNING id, name, species, status, image_url, rescue_image_url
      ), logged AS (
        INSERT INTO petgo_private.animal_author_deletions (actor_user_id, animal_id, reason, details)
        SELECT ?, id, ?, jsonb_build_object('name', name, 'species', species, 'status', status,
          'image_url', image_url, 'rescue_image_url', rescue_image_url) FROM deleted RETURNING id
      ) SELECT deleted.* FROM deleted CROSS JOIN logged`,
      [id, req.mobileUser.id, req.mobileUser.id, reason.trim()], (error, row) => error ? reject(error) : resolve(row)));
      if (!animal) return res.status(404).json({ error: 'Registro não encontrado ou você não é o autor deste cadastro.' });
      const storageCleanup = await cleanupAnimalPhotos({ animal, db, storage, supabaseUrl });
      return res.json({ deletedId: animal.id, storageCleanup });
    } catch (error) {
      console.error('Falha na exclusão pelo autor:', { code: error.code || 'AUTHOR_DELETE_FAILED' });
      return res.status(error.code === '23503' ? 409 : 503).json({ error: 'Não foi possível excluir o registro. Atualize a lista antes de tentar novamente.' });
    }
  });
  return router;
}
module.exports = { createAnimalAuthorDeletionRouter };
