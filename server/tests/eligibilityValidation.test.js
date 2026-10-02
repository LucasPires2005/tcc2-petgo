const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const {
  CPF_KEY_VERSION, normalizeCpf, isValidCpf, parseBirthDate, calculateAge, isAdult,
  createCpfHmac, matchesCpfHmac, assessEligibility
} = require('../services/eligibilityValidation');

// Somente fixtures matemáticas/chaves artificiais; não consultar documentos.
const cpf = '52998224725';
const leadingZeroCpf = '01234567890';
const testKey = Buffer.alloc(32, 0x61).toString('base64');
const today = new Date('2026-10-02T15:00:00Z');

function withKey(t, value = testKey) {
  const previous = process.env.CPF_HMAC_SECRET;
  if (value === undefined || value === null) delete process.env.CPF_HMAC_SECRET;
  else process.env.CPF_HMAC_SECRET = value;
  t.after(() => {
    if (previous === undefined) delete process.env.CPF_HMAC_SECRET;
    else process.env.CPF_HMAC_SECRET = previous;
  });
}

test('CPF: normalização estrita preserva zeros e aceita máscara completa', () => {
  assert.equal(normalizeCpf(' 529.982.247-25 '), cpf);
  assert.equal(normalizeCpf(leadingZeroCpf), leadingZeroCpf);
  assert.equal(normalizeCpf('012.345.678-90'), leadingZeroCpf);
  assert.equal(isValidCpf(cpf), true);
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf(leadingZeroCpf), true);
});

test('CPF: rejeita tipos incorretos, máscara parcial, lixo, Unicode e excesso de tamanho', () => {
  for (const value of [null, undefined, 52998224725, true, [], {}, '', '5299822472', '529982247255',
    '529.982247-25', '529 982 247 25', '52998224725abc', '529#982!24725',
    '５２９９８２２４７２５', '52998224725\u200b', ' '.repeat(33) + cpf]) {
    assert.equal(normalizeCpf(value), null);
    assert.equal(isValidCpf(value), false);
  }
});

test('CPF: rejeita todas as sequências repetidas e adulteração de ambos os dígitos', () => {
  for (let digit = 0; digit <= 9; digit++) assert.equal(isValidCpf(String(digit).repeat(11)), false);
  for (let digit = 0; digit <= 9; digit++) {
    if (digit !== Number(cpf[9])) assert.equal(isValidCpf(cpf.slice(0, 9) + digit + cpf[10]), false);
    if (digit !== Number(cpf[10])) assert.equal(isValidCpf(cpf.slice(0, 10) + digit), false);
  }
});

test('nascimento: valida calendário, incluindo séculos bissextos, sem rollover', () => {
  assert.deepEqual(parseBirthDate('2000-02-29'), { year: 2000, month: 2, day: 29 });
  assert.deepEqual(parseBirthDate('1900-02-28'), { year: 1900, month: 2, day: 28 });
  for (const value of ['1900-02-29', '2100-02-29', '2026-02-29', '2026-04-31', '2026-00-01',
    '2026-13-01', '2026-01-00', '2026-01-32', '0000-01-01', '2008-1-2', '02/10/2008',
    '2008-10-02T00:00:00Z', ' 2008-10-02', '2008-10-02\n', '', null, undefined, 20081002, {}, []]) {
    assert.equal(parseBirthDate(value), null, String(value));
  }
});

test('idade: aniversário exato de 18 anos, anterior, posterior e adulto', () => {
  assert.equal(calculateAge('2008-10-02', today), 18);
  assert.equal(isAdult('2008-10-02', today), true);
  assert.equal(calculateAge('2008-10-03', today), 17);
  assert.equal(isAdult('2008-10-03', today), false);
  assert.equal(calculateAge('2008-10-01', today), 18);
  assert.equal(calculateAge('1990-12-31', today), 35);
  assert.equal(calculateAge('2026-10-02', today), 0);
});

test('idade: usa o calendário de Brasília, não o dia UTC nem o fuso da máquina', () => {
  assert.equal(calculateAge('2008-10-02', new Date('2026-10-02T02:59:59.999Z')), 17);
  assert.equal(calculateAge('2008-10-02', new Date('2026-10-02T03:00:00.000Z')), 18);
  assert.equal(calculateAge('2008-01-01', new Date('2026-01-01T02:59:59.999Z')), 17);
  assert.equal(calculateAge('2008-01-01', new Date('2026-01-01T03:00:00.000Z')), 18);
});

test('idade: 29/02 completa aniversário em 01/03 no ano não bissexto', () => {
  assert.equal(calculateAge('2008-02-29', new Date('2026-02-28T15:00:00Z')), 17);
  assert.equal(isAdult('2008-02-29', new Date('2026-02-28T15:00:00Z')), false);
  assert.equal(calculateAge('2008-02-29', new Date('2026-03-01T15:00:00Z')), 18);
  assert.equal(calculateAge('2008-02-29', new Date('2028-02-29T15:00:00Z')), 20);
});

test('idade: nascimento futuro, inválido ou relógio inválido não aprova', () => {
  for (const value of ['2026-10-03', '2027-01-01', '2026-02-30', undefined, null]) {
    assert.equal(calculateAge(value, today), null);
    assert.equal(isAdult(value, today), false);
  }
  for (const clock of [new Date(NaN), '2026-10-02', null, {}]) {
    assert.equal(calculateAge('2008-10-02', clock), null);
    assert.equal(isAdult('2008-10-02', clock), false);
  }
});

test('HMAC: CPF com máscara/dígitos gera mesmo digest, com prefixo e versão próprios', t => {
  withKey(t);
  const expected = crypto.createHmac('sha256', Buffer.from(testKey, 'base64'))
    .update('petgo:cpf:v1:' + cpf).digest('hex');
  assert.equal(CPF_KEY_VERSION, 'v1');
  assert.equal(createCpfHmac(cpf), expected);
  assert.equal(createCpfHmac(' 529.982.247-25 '), expected);
  assert.match(expected, /^[0-9a-f]{64}$/);
  assert.notEqual(expected, crypto.createHash('sha256').update(cpf).digest('hex'));
  assert.notEqual(expected, crypto.createHmac('sha256', Buffer.from(testKey, 'base64')).update(cpf).digest('hex'));
  assert.equal(createCpfHmac(leadingZeroCpf), createCpfHmac('012.345.678-90'));
});

test('HMAC: CPF ou chave diferentes alteram o resultado; não usa MOBILE_JWT_SECRET', t => {
  withKey(t);
  const previousJwtSecret = process.env.MOBILE_JWT_SECRET;
  t.after(() => {
    if (previousJwtSecret === undefined) delete process.env.MOBILE_JWT_SECRET;
    else process.env.MOBILE_JWT_SECRET = previousJwtSecret;
  });
  const first = createCpfHmac(cpf);
  process.env.MOBILE_JWT_SECRET = 'fixture-jwt-independente';
  assert.equal(createCpfHmac(cpf), first);
  delete process.env.MOBILE_JWT_SECRET;
  assert.equal(createCpfHmac(cpf), first);
  assert.notEqual(first, createCpfHmac(leadingZeroCpf));
  process.env.CPF_HMAC_SECRET = Buffer.alloc(32, 0x62).toString('base64');
  assert.notEqual(first, createCpfHmac(cpf));
});

test('HMAC: chave ausente, curta ou Base64 não canônico falha sem expor valor', t => {
  withKey(t);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const finalIndex = testKey.length - 2;
  const nonCanonicalKey = testKey.slice(0, finalIndex)
    + alphabet[alphabet.indexOf(testKey[finalIndex]) | 1] + '=';
  assert.deepEqual(Buffer.from(nonCanonicalKey, 'base64'), Buffer.from(testKey, 'base64'));
  for (const value of [null, '', 'segredo-curto', Buffer.alloc(31).toString('base64'),
    ' ' + testKey, testKey + '\n', testKey.replace(/=$/, ''), testKey + '=',
    nonCanonicalKey, '!'.repeat(64)]) {
    if (value === null) delete process.env.CPF_HMAC_SECRET;
    else process.env.CPF_HMAC_SECRET = value;
    assert.throws(() => createCpfHmac(cpf), error => {
      assert.equal(error.code, 'CPF_HMAC_NOT_CONFIGURED');
      assert.equal(error.message, 'Configure CPF_HMAC_SECRET com uma chave Base64 de pelo menos 32 bytes.');
      assert.equal(error.cpf, undefined);
      return true;
    });
  }
});

test('HMAC: aceita chave de 64 bytes e rejeita CPF inválido antes da criptografia', t => {
  withKey(t, Buffer.alloc(64, 0x63).toString('base64'));
  assert.match(createCpfHmac(cpf), /^[0-9a-f]{64}$/);
  delete process.env.CPF_HMAC_SECRET;
  assert.throws(() => createCpfHmac('00000000000'), { code: 'CPF_INVALID' });
});

test('HMAC: comparação constante confere versão e formato antes de comparar bytes', t => {
  withKey(t);
  const hash = createCpfHmac(cpf);
  assert.equal(matchesCpfHmac('529.982.247-25', hash, 'v1'), true);
  assert.equal(matchesCpfHmac(leadingZeroCpf, hash), false);
  assert.equal(matchesCpfHmac(cpf, '0'.repeat(64)), false);
  for (const invalid of [null, undefined, {}, '', hash.slice(1), hash + '0', 'z'.repeat(64),
    hash.toUpperCase(), hash + '\n', hash + '\r']) {
    assert.equal(matchesCpfHmac(cpf, invalid), false);
  }
  assert.equal(matchesCpfHmac(cpf, hash, 'v2'), false);
  assert.equal(matchesCpfHmac(0, hash), false);
  delete process.env.CPF_HMAC_SECRET;
  assert.equal(matchesCpfHmac(cpf, 'invalido'), false);
  assert.throws(() => matchesCpfHmac(cpf, hash), { code: 'CPF_HMAC_NOT_CONFIGURED' });
});

test('base isolada: importar helpers e validar CPF/idade não exige chave ou outros serviços', () => {
  const modulePath = require.resolve('../services/eligibilityValidation');
  const output = execFileSync(process.execPath, ['-e',
    `const h = require(${JSON.stringify(modulePath)}); if (!h.isValidCpf('52998224725') || !h.isAdult('2000-01-01', new Date('2026-10-02T15:00:00Z'))) process.exit(1);`
  ], { env: { ...process.env, CPF_HMAC_SECRET: '' }, encoding: 'utf8' });
  assert.equal(output, '');
});

test('avaliação: erros claros de CPF, nascimento e menoridade sem gerar HMAC', t => {
  withKey(t, null);
  assert.deepEqual(assessEligibility({ cpf: '00000000000', birthDate: '1990-01-01' }, today), {
    eligible: false, code: 'CPF_INVALID', error: 'CPF inválido. Confira os números informados.'
  });
  assert.equal(assessEligibility({ cpf, birthDate: '2026-02-30' }, today).code, 'BIRTH_DATE_INVALID');
  assert.equal(assessEligibility({ cpf, birthDate: '2027-01-01' }, today).code, 'BIRTH_DATE_INVALID');
  assert.deepEqual(assessEligibility({ cpf, birthDate: '2008-10-03' }, today), {
    eligible: false, code: 'UNDERAGE', error: 'É necessário ter 18 anos ou mais para continuar.'
  });
  assert.equal(assessEligibility(null, today).code, 'CPF_INVALID');
});

test('avaliação: só retorna declaração e dados privados mínimos, nunca CPF/nascimento/idade', t => {
  withKey(t);
  const result = assessEligibility({ cpf, birthDate: '2008-10-02', eligible: true, identityVerified: true }, today);
  assert.deepEqual(result, {
    eligible: true, status: 'DECLARED_ADULT', method: 'LOCAL_DECLARATION', identityVerified: false,
    cpfHmac: createCpfHmac(cpf), cpfKeyVersion: 'v1', assessedAt: today.toISOString()
  });
  assert.equal(result.cpf, undefined);
  assert.equal(result.birthDate, undefined);
  assert.equal(result.age, undefined);
  assert.doesNotMatch(JSON.stringify(result), /52998224725|2008-10-02/);
  assert.equal(assessEligibility({ cpf, birthDate: '2008-10-03', eligible: true, identityVerified: true }, today).eligible, false);
});

test('avaliação: configuração ou relógio inválido não é confundido com aprovação/erro do usuário', t => {
  withKey(t, null);
  assert.throws(() => assessEligibility({ cpf, birthDate: '1990-01-01' }, today), { code: 'CPF_HMAC_NOT_CONFIGURED' });
  assert.throws(() => assessEligibility({ cpf, birthDate: '1990-01-01' }, new Date(NaN)), { code: 'ELIGIBILITY_CLOCK_INVALID' });
});
