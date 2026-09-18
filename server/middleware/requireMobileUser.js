const { verifyMobileToken, getMobileAccess } = require('../services/mobileSession');

function createRequireMobileUser({ db, verify = verifyMobileToken }) {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const match = /^Bearer\s+(\S+)$/i.exec(req.get('Authorization') || '');
    if (!match) return res.status(401).json({ error: 'Entre novamente para continuar.', code: 'SESSION_INVALID' });
    try {
      const claims = verify(match[1]);
      if (!claims) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.', code: 'SESSION_INVALID' });
      const access = await getMobileAccess(db, claims.sub);
      if (access?.banned) return res.status(403).json({ error: 'Sua conta está banida.', code: 'ACCOUNT_BANNED' });
      if (!access || access.version !== claims.ver) return res.status(401).json({ error: 'Sessão revogada. Entre novamente.', code: 'SESSION_INVALID' });
      req.mobileUser = { id: access.id };
      return next();
    } catch (error) {
      console.error('Falha ao validar sessão mobile:', { code: error.code || 'SESSION_UNAVAILABLE' });
      return res.status(503).json({ error: 'Não foi possível verificar sua sessão. Tente novamente.' });
    }
  };
}

// Executar após JSON/multipart: não confiar no ID enviado pelo cliente.
function bindMobileIdentity(req, res, next) {
  const id = String(req.mobileUser.id);
  for (const value of [req.params.id, req.params.userId]) {
    if (value !== undefined && String(value) !== id) return res.status(403).json({ error: 'Acesso a outra conta não permitido.' });
  }
  req.body = { ...req.body, id: req.mobileUser.id, userId: req.mobileUser.id };
  next();
}
function bindAnimalActor(req, res, next) {
  req.body = { ...req.body, userId: req.mobileUser.id };
  next();
}
module.exports = { createRequireMobileUser, bindMobileIdentity, bindAnimalActor };
