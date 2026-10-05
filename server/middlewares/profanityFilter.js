const BLOCKED_TERMS = new Set([
  'caralho', 'porra', 'buceta', 'foder', 'foda',
  'fodido', 'fudido', 'merda', 'puta', 'puto', 'cacete'
]);


const IGNORED_KEYS = new Set([
  'password', 'currentpassword', 'newpassword', 'confirmpassword',
  'email', 'rescueremail', 'cpf', 'rescuercpf', 'birthdate',
  'token', 'accesstoken', 'refreshtoken', 'authcode', 'codeverifier',
  'id', 'userid', 'authuserid', 'animalid', 'creatorid',
  'productid', 'paymentid', 'preferenceid', 'operationid',
  'phone', 'telefone', 'telephone', 'rescuercontact',
  'latitude', 'longitude', 'image', 'rescueimage',
  'imageurl', 'rescueimageurl', 'redirecturl', 'callbackurl'
]);

const ERROR_MESSAGE =
  'O texto enviado contém expressões inadequadas. Utilize uma linguagem respeitosa.';

function containsProfanity(text) {
  const normalized = text
    .normalize('NFKD')
    .replace(/[\p{M}\p{Cf}]/gu, '')
    .toLowerCase();

  // Palavras inteiras reduzem falsos positivos em nomes e descrições legítimas.
  const words = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  return words.some(word => BLOCKED_TERMS.has(word));
}

function profanityFilter(req, res, next) {
  const pending = [req.body];
  const visited = new WeakSet();

  // Percorre strings, arrays e objetos sem recursão nem alteração do corpo.
  while (pending.length) {
    const value = pending.pop();

    if (typeof value === 'string') {
      if (containsProfanity(value)) {
        return res.status(400).json({ error: ERROR_MESSAGE });
      }
      continue;
    }

    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);

    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.replace(/[_-]/g, '').toLowerCase();
      if (!IGNORED_KEYS.has(normalizedKey)) pending.push(child);
    }
  }

  return next();
}

module.exports = profanityFilter;
