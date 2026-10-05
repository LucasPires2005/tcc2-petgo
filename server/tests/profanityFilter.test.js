const { test } = require('node:test');
const assert = require('node:assert/strict');
const profanityFilter = require('../middlewares/profanityFilter');

const ERROR_MESSAGE = 'O texto enviado contém expressões inadequadas. Utilize uma linguagem respeitosa.';

function runFilter(body, requestExtras = {}) {
  const calls = { next: 0, status: [], json: [] };
  const req = { ...requestExtras, body };
  const res = {
    status(code) { calls.status.push(code); return this; },
    json(value) { calls.json.push(value); return this; }
  };
  profanityFilter(req, res, () => calls.next++);
  return { req, calls };
}

function assertAllowed(body, requestExtras) {
  const result = runFilter(body, requestExtras);
  assert.equal(result.req.body, body, 'o corpo original deve ser preservado');
  assert.equal(result.calls.next, 1, 'next deve ser chamado uma única vez');
  assert.deepEqual(result.calls.status, []);
  assert.deepEqual(result.calls.json, []);
  return result;
}

function assertRejected(body, requestExtras) {
  const result = runFilter(body, requestExtras);
  assert.equal(result.req.body, body, 'o corpo original deve ser preservado');
  assert.equal(result.calls.next, 0, 'uma requisição rejeitada não deve chamar next');
  assert.deepEqual(result.calls.status, [400]);
  assert.deepEqual(result.calls.json, [{ error: ERROR_MESSAGE }]);
  return result;
}

for (const term of ['caralho', 'porra', 'buceta', 'foder', 'foda', 'fodido', 'fudido', 'merda', 'puta', 'puto', 'cacete']) {
  test(`filtro rejeita o termo completo ${term}`, () => {
    assertRejected({ description: `Texto antes ${term} depois.` });
  });
}

for (const word of ['Caramelo', 'Cuiabá', 'cadela', 'Disputa', 'amputação']) {
  test(`filtro permite a palavra legítima ${word}`, () => {
    assertAllowed({ name: word, description: `Animal encontrado em ${word}.` });
  });
}

test('filtro compara palavras completas e preserva termos dentro de palavras maiores', () => {
  assertAllowed({ description: 'disputar amputado computou caralhos porra123 123porra' });
  for (const description of ['(porra)!', 'antes/merda/depois', 'porra_nome', 'antes\nputa\tdepois']) {
    assertRejected({ description });
  }
});

for (const [label, value] of [
  ['maiúsculas e minúsculas', 'PoRrA'],
  ['acentos precompostos', 'PÓRRÁ'],
  ['marcas combinantes', 'buce\u0301ta'],
  ['espaço de largura zero', 'po\u200Brra'],
  ['junção de largura zero', 'pu\u200Dto'],
  ['marca de ordem de bytes', '\uFEFFmerda'],
  ['caracteres de largura completa', 'ＣＡＲＡＬＨＯ']
]) {
  test(`filtro normaliza ${label}`, () => {
    assertRejected({ description: value });
  });
}

test('filtro percorre valores de texto em objetos e arrays aninhados', () => {
  assertRejected({ sections: [{ rows: [null, { detail: { caption: 'Esta é uma porra.' } }] }] });
  assertAllowed({ sections: [{ rows: [null, { detail: { caption: 'Cadela encontrada em Cuiabá.' } }] }] });
});

test('filtro verifica strings em arrays sem depender de nomes de campos', () => {
  assertRejected(['Descrição respeitosa', ['Outra descrição', 'merda']]);
  assertAllowed(['Caramelo', ['Cuiabá', 'cadela']]);
});

test('filtro deixa a validação de tipos não textuais para os controladores', () => {
  assertAllowed({ name: 123, description: false, active: true, missing: null, optional: undefined });
  for (const body of [undefined, null, 0, 42, false, true]) assertAllowed(body);
});

test('filtro trata um corpo que seja uma string', () => {
  assertAllowed('Caramelo encontrado em Cuiabá.');
  assertRejected('PORRA');
});

test('filtro ignora todos os campos técnicos previstos', () => {
  const fields = [
    'password', 'currentPassword', 'newPassword', 'confirmPassword',
    'email', 'rescuerEmail', 'cpf', 'rescuerCpf', 'birthDate',
    'token', 'accessToken', 'refreshToken', 'authCode', 'codeVerifier',
    'id', 'userId', 'authUserId', 'animalId', 'creatorId', 'productId',
    'paymentId', 'preferenceId', 'operationId',
    'phone', 'telefone', 'telephone', 'rescuerContact', 'latitude', 'longitude',
    'image', 'rescueImage', 'imageUrl', 'rescueImageUrl', 'redirectUrl', 'callbackUrl'
  ];
  for (const field of fields) {
    const result = runFilter({ [field]: 'porra', name: 'Caramelo' });
    assert.equal(result.calls.next, 1, `campo técnico ${field} deve ser ignorado`);
    assert.deepEqual(result.calls.status, [], field);
    assert.deepEqual(result.calls.json, [], field);
  }
});

test('filtro normaliza maiúsculas, sublinhados e hífens nos nomes de campos técnicos', () => {
  assertAllowed({
    CURRENT_PASSWORD: 'porra',
    'New-Password': 'merda',
    ReScUeR_EmAiL: 'puta',
    'AUTH-USER_ID': 'foda',
    CALLBACK_URL: 'cacete',
    details: { 'refresh-token': 'foder' }
  });
});

test('filtro ignora a subárvore inteira de um campo técnico', () => {
  assertAllowed({
    password: { nested: ['porra', { description: 'merda' }] },
    details: { image: [{ caption: 'puta' }], name: 'Caramelo' }
  });
});

test('filtro ignora apenas nomes técnicos exatos, sem ignorar nomes que os contêm', () => {
  for (const field of ['emailDescription', 'passwordHint', 'imageCaption', 'userIdDescription', 'phoneLabel']) {
    assertRejected({ [field]: 'porra' });
  }
});

test('filtro verifica um objeto compartilhado quando também aparece fora de campo técnico', () => {
  const shared = { caption: 'porra' };
  assertRejected({ image: shared, description: shared });
});

test('filtro não altera valores nem estruturas de corpos congelados permitidos', () => {
  const descriptions = Object.freeze(['  Cadela em Cuiabá.  ', 'Disputa por adoção']);
  const body = Object.freeze({ name: '  Caramelo  ', details: Object.freeze({ descriptions }) });
  assertAllowed(body);
  assert.deepEqual(body, { name: '  Caramelo  ', details: { descriptions: ['  Cadela em Cuiabá.  ', 'Disputa por adoção'] } });
});

test('filtro não altera a string original de corpos congelados rejeitados', () => {
  const body = Object.freeze({ details: Object.freeze({ description: '  PÓRRÁ\u200B!  ' }) });
  assertRejected(body);
  assert.deepEqual(body, { details: { description: '  PÓRRÁ\u200B!  ' } });
});

test('filtro encerra a busca de objetos cíclicos sem rejeitar textos permitidos', () => {
  const body = { description: 'Cadela encontrada em Cuiabá.' };
  body.self = body;
  body.items = [body];
  assertAllowed(body);
  assert.equal(body.self, body);
  assert.equal(body.items[0], body);
});

test('filtro encontra um termo inadequado mesmo em um objeto cíclico', () => {
  const body = { details: { description: 'porra' } };
  body.details.parent = body;
  assertRejected(body);
  assert.equal(body.details.parent, body);
});

test('filtro percorre corpos profundos sem exceder a pilha de chamadas', () => {
  const body = {};
  let leaf = body;
  for (let depth = 0; depth < 20000; depth++) {
    leaf.child = {};
    leaf = leaf.child;
  }
  leaf.description = 'Caramelo';
  assertAllowed(body);
  leaf.description = 'porra';
  assertRejected(body);
});

test('filtro inspeciona somente o corpo e não arquivos, cabeçalhos ou query', () => {
  assertAllowed({ description: 'Caramelo' }, {
    file: { originalname: 'porra', buffer: Buffer.from('merda') },
    files: [{ originalname: 'puta' }],
    headers: { authorization: 'foda', 'x-description': 'cacete' },
    query: { description: 'porra' },
    params: { description: 'merda' }
  });
});

test('resposta de rejeição contém somente o erro genérico sem ecoar campo ou valor', () => {
  const result = assertRejected({ privateDescription: 'Conteúdo privado: buceta.' });
  const response = JSON.stringify(result.calls.json[0]);
  assert.equal(response.includes('privateDescription'), false);
  assert.equal(response.includes('Conteúdo privado'), false);
  assert.equal(response.includes('buceta'), false);
});
