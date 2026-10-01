// Não iniciar uma troca que poderia ser aplicada sem confirmação por configuração.
async function requireEmailConfirmation(url, key) {
  const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, {
    headers: { apikey: key }, signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('EMAIL_CONFIRMATION_SETTINGS_UNAVAILABLE');
  const settings = await response.json();
  if (settings.mailer_autoconfirm !== false) throw new Error('EMAIL_CONFIRMATION_REQUIRED');
}
module.exports = { requireEmailConfirmation };
