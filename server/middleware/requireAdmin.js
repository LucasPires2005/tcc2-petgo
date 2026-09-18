// Dependências injetadas para testar autorização sem acessar contas reais.
function createRequireAdmin({ auth, db }) {
  return async function requireAdmin(req, res, next) {
    res.set('Cache-Control', 'no-store');
    const match = /^Bearer\s+(\S+)$/i.exec(req.get('Authorization') || '');
    if (!match) return res.status(401).json({ error: 'Entre com sua conta para continuar.' });

    try {
      // Valida no servidor do Supabase; não confia em IDs ou roles do navegador.
      const { data, error } = await auth.getUser(match[1]);
      if (error || !data?.user) {
        const unavailable = error?.status >= 500 || error?.name === 'AuthRetryableFetchError';
        return res.status(unavailable ? 503 : 401).json({
          error: unavailable ? 'Autenticação indisponível. Tente novamente.' : 'Sessão inválida ou expirada. Entre novamente.'
        });
      }
      if (!data.user.email_confirmed_at) {
        return res.status(403).json({ error: 'Confirme seu e-mail antes de acessar o painel.' });
      }
      const membership = await new Promise((resolve, reject) => {
        db.get(
          'SELECT auth_user_id FROM petgo_private.admin_users WHERE auth_user_id = ?',
          [data.user.id],
          (err, row) => err ? reject(err) : resolve(row)
        );
      });
      if (!membership) {
        return res.status(403).json({ error: 'Sua conta não tem permissão administrativa.' });
      }
      req.admin = { id: data.user.id, email: data.user.email };
      return next();
    } catch (error) {
      // Não registrar token, senha ou detalhes de conexão.
      console.error('Falha na autorização administrativa:', { code: error.code || 'ADMIN_AUTH_UNAVAILABLE' });
      return res.status(503).json({ error: 'Não foi possível verificar o acesso administrativo. Tente novamente.' });
    }
  };
}

module.exports = { createRequireAdmin };
