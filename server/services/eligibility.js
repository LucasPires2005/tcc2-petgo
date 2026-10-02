const crypto = require('node:crypto');
const { assessEligibility, CPF_KEY_VERSION, ELIGIBILITY_STATUS, ELIGIBILITY_METHOD } = require('./eligibilityValidation');

const ELIGIBILITY_TERMS_VERSION = '2026-10-02-v1';
const PRIVATE_COLUMNS = 'cpf_hmac, cpf_key_version, status, method';

function eligibilityError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function prepareEligibility(input) {
  if (input?.acceptedDeclaration !== true) {
    throw eligibilityError('DECLARATION_REQUIRED', 'Confirme a declaração de maioridade para continuar.');
  }
  // Data e idade sempre calculadas pelo servidor; flags fornecidas pelo app não aprovam ninguém.
  const assessment = assessEligibility({ cpf: input.cpf, birthDate: input.birthDate });
  if (!assessment.eligible) throw eligibilityError(assessment.code, assessment.error);
  return assessment;
}

function publicEligibility(row) {
  if (row && (row.status !== ELIGIBILITY_STATUS || row.method !== ELIGIBILITY_METHOD
    || row.cpf_key_version !== CPF_KEY_VERSION || typeof row.cpf_hmac !== 'string'
    || !/^[0-9a-f]{64}$/.test(row.cpf_hmac))) {
    throw eligibilityError('ELIGIBILITY_UNAVAILABLE', 'Não foi possível verificar a declaração. Tente novamente.', 503);
  }
  // Projeção explícita: nunca devolver o registro privado ou o HMAC na resposta HTTP.
  return { status: row ? ELIGIBILITY_STATUS : 'PENDING', declaredAdult: Boolean(row), identityVerified: false };
}

function readEligibility(db, userId) {
  return new Promise((resolve, reject) => db.get(
    `SELECT ${PRIVATE_COLUMNS} FROM petgo_private.user_eligibility WHERE user_id = ?`, [userId],
    (error, row) => {
      if (error) return reject(error);
      try { resolve(publicEligibility(row)); } catch (validationError) { reject(validationError); }
    }
  ));
}

// Usar dentro da mesma transação do perfil e com o lock do usuário local já obtido.
// Uma declaração existente não pode ser substituída por outro CPF nesta etapa.
async function persistEligibility(tx, userId, assessment) {
  const inserted = (await tx.query(`INSERT INTO petgo_private.user_eligibility
    (user_id, cpf_hmac, cpf_key_version, status, method, assessed_at, terms_version)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (user_id) DO NOTHING RETURNING ${PRIVATE_COLUMNS}`,
  [userId, assessment.cpfHmac, assessment.cpfKeyVersion, assessment.status,
    assessment.method, assessment.assessedAt, ELIGIBILITY_TERMS_VERSION])).rows[0];
  if (inserted) return publicEligibility(inserted);
  const existing = (await tx.query(`SELECT ${PRIVATE_COLUMNS}
    FROM petgo_private.user_eligibility WHERE user_id = $1 FOR UPDATE`, [userId])).rows[0];
  const result = publicEligibility(existing);
  if (!existing) throw eligibilityError('ELIGIBILITY_UNAVAILABLE', 'Não foi possível registrar a declaração.', 503);
  if (!crypto.timingSafeEqual(Buffer.from(existing.cpf_hmac, 'hex'), Buffer.from(assessment.cpfHmac, 'hex'))) {
    throw eligibilityError('CPF_DECLARATION_MISMATCH', 'O CPF informado não corresponde à declaração desta conta.');
  }
  return result;
}

function eligibilityFailure(res, error) {
  const inputCodes = new Set(['DECLARATION_REQUIRED', 'CPF_INVALID', 'BIRTH_DATE_INVALID', 'UNDERAGE', 'CPF_DECLARATION_MISMATCH']);
  if (inputCodes.has(error.code)) return res.status(400).json({ error: error.message, code: error.code });
  return res.status(503).json({ error: 'Não foi possível verificar ou registrar a declaração. Tente novamente.', code: 'ELIGIBILITY_UNAVAILABLE' });
}

module.exports = { ELIGIBILITY_TERMS_VERSION, prepareEligibility, publicEligibility, readEligibility, persistEligibility, eligibilityFailure };
