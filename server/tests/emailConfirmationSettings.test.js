const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requireEmailConfirmation } = require('../services/emailConfirmationSettings');

test('troca de e-mail exige confirmação habilitada e falha fechada se configuração não puder ser verificada', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  for (const settings of [{ mailer_autoconfirm: true }, {}, { mailer_autoconfirm: 'false' }]) {
    global.fetch = async () => ({ ok: true, json: async () => settings });
    await assert.rejects(requireEmailConfirmation('https://example.test/', 'server-key'), /EMAIL_CONFIRMATION_REQUIRED/);
  }
  global.fetch = async () => ({ ok: false });
  await assert.rejects(requireEmailConfirmation('https://example.test', 'server-key'), /SETTINGS_UNAVAILABLE/);
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://example.test/auth/v1/settings');
    assert.equal(options.headers.apikey, 'server-key');
    return { ok: true, json: async () => ({ mailer_autoconfirm: false }) };
  };
  await requireEmailConfirmation('https://example.test/', 'server-key');
});
