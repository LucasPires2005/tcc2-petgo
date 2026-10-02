const express = require('express');
const { createRequireMobileUser } = require('../middleware/requireMobileUser');

const SUPPORT_NETWORK_QUERY = `
  SELECT id::text AS id, name, category, address, latitude, longitude,
         COALESCE(description, '') AS description
  FROM public.partners
  WHERE active = true AND demonstration = true
    AND category IN ('store', 'clinic', 'ngo')
    AND NULLIF(TRIM(name), '') IS NOT NULL
    AND NULLIF(TRIM(address), '') IS NOT NULL
    AND latitude BETWEEN -90 AND 90
    AND longitude BETWEEN -180 AND 180
  ORDER BY name, id`;

function createSupportNetworkRouter({ db, verify }) {
  const router = express.Router();
  router.use(createRequireMobileUser({ db, verify }));
  router.get('/', (req, res) => {
    // O catálogo é somente leitura. Cadastro e seed são feitos no Supabase,
    // nunca na inicialização do servidor nem a partir do aplicativo.
    db.all(SUPPORT_NETWORK_QUERY, [], (error, rows) => {
      if (error) {
        console.error('Erro ao consultar a rede de apoio:', { code: error.code });
        return res.status(503).json({
          error: 'A rede de apoio está indisponível no momento. Tente novamente.'
        });
      }
      const items = rows.map(row => ({
        id: String(row.id), name: row.name, category: row.category,
        address: row.address, latitude: Number(row.latitude), longitude: Number(row.longitude),
        description: row.description || '', demonstration: true
      }));
      res.json({ demonstration: true, items });
    });
  });
  return router;
}

module.exports = { createSupportNetworkRouter, SUPPORT_NETWORK_QUERY };
