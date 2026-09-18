const crypto = require('node:crypto');

// Token da API PetGo, separado dos tokens dos links de recuperação do Supabase.
const issuer = 'petgo-api';
const audience = 'petgo-mobile';
function key() {
  const value = process.env.MOBILE_JWT_SECRET;
  if (!value || Buffer.byteLength(value) < 32) throw new Error('MOBILE_JWT_SECRET must contain at least 32 bytes');
  return value;
}
function sign(input) {
  return crypto.createHmac('sha256', key()).update(input).digest();
}
function issueMobileToken(userId, version = 0) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: issuer, aud: audience, sub: String(userId), ver: version,
    iat: now, exp: now + 12 * 60 * 60 })).toString('base64url');
  const input = `${header}.${payload}`;
  return `${input}.${sign(input).toString('base64url')}`;
}
function verifyMobileToken(token) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  const expected = sign(`${parts[0]}.${parts[1]}`);
  const supplied = Buffer.from(parts[2], 'base64url');
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== 'HS256' || header.typ !== 'JWT' || claims.iss !== issuer || claims.aud !== audience
        || !/^[1-9]\d*$/.test(claims.sub) || !Number.isSafeInteger(Number(claims.sub))
        || !Number.isSafeInteger(claims.ver) || claims.ver < 0
        || !Number.isSafeInteger(claims.exp) || claims.exp <= now
        || !Number.isSafeInteger(claims.iat) || claims.iat > now || claims.exp - claims.iat > 43200) return null;
    return claims;
  } catch { return null; }
}
function getMobileAccess(db, id) {
  return new Promise((resolve, reject) => db.get(
    `SELECT u.id, COALESCE(a.banned, false) AS banned, COALESCE(a.version, 0) AS version
     FROM public.users u LEFT JOIN petgo_private.user_access a ON a.user_id = u.id WHERE u.id = ?`,
    [id], (error, row) => error ? reject(error) : resolve(row)
  ));
}
module.exports = { issueMobileToken, verifyMobileToken, getMobileAccess };
