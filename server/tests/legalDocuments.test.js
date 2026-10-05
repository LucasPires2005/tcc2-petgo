const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const documents = JSON.parse(fs.readFileSync(path.join(root, 'app/content/legalDocuments.json'), 'utf8'));
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
const content = name => normalize(documents[name].sections.map(section => `${section.title}\n${section.text}`).join('\n\n'));
const terms = content('terms');
const privacy = content('privacy');
const all = `${terms} ${privacy}`;
const notes = normalize(fs.readFileSync(path.join(root, 'legal/NOTAS_DE_ADEQUACAO.md'), 'utf8'));
const registerSource = fs.readFileSync(path.join(root, 'app/screens/RegisterScreen.js'), 'utf8');
const registerButtons = registerSource.match(/<TouchableOpacity\b[\s\S]*?<\/TouchableOpacity>/g) || [];

// Os callbacks locais são pequenos: extraí-los evita carregar React Native ou
// depender de node_modules do app para executar a suíte do servidor.
function pressHandler(button) {
  return /onPress=\{(\(\)\s*=>\s*\{[\s\S]*?\})\}/.exec(button)?.[1]
    || /onPress=\{(\(\)\s*=>\s*[^{}\r\n]+)\}/.exec(button)?.[1];
}

function press(handler, selectedLegalDocument) {
  const calls = [];
  vm.runInNewContext(`(${handler})()`, {
    selectedLegalDocument,
    setSelectedLegalDocument: value => calls.push(['document', value]),
    setTermsVisible: value => calls.push(['visible', value]),
    setAgreed: value => calls.push(['agreed', value])
  });
  return calls;
}

function markdown(name) {
  const document = documents[name];
  return `# ${document.title}\n\n`
    + `Versão: ${documents.version} — atualizado em ${documents.updatedAt}.\n\n`
    + `Status: ${documents.status}.\n\n`
    + `Controlador: ${documents.controller}.\n\n`
    + `Canal oficial: ${documents.supportEmail}.\n\n`
    + document.sections.map(section => `## ${section.title}\n\n${section.text}`).join('\n\n') + '\n';
}

test('documentos legais: versão, contato e status editorial explícitos', () => {
  assert.equal(documents.version, '2026-10-05-v2');
  assert.equal(documents.updatedAt, '05/10/2026');
  assert.equal(documents.supportEmail, 'usepetgo@gmail.com');
  assert.match(normalize(documents.status), /minuta.*demonstracao academica/);
  assert.equal(documents.controller, 'PetGo — projeto acadêmico');
  for (const [key, title] of [['terms', 'Termos de Uso'], ['privacy', 'Política de Privacidade']]) {
    assert.equal(documents[key].title, title);
    assert.ok(documents[key].sections.length >= 8, `${key} deve cobrir o ciclo de uso e dados`);
    const titles = documents[key].sections.map(section => section.title);
    assert.equal(new Set(titles).size, titles.length, `${key} não deve repetir títulos`);
    for (const section of documents[key].sections) {
      assert.equal(typeof section.title, 'string');
      assert.equal(typeof section.text, 'string');
      assert.ok(section.title.trim() && section.text.trim(), 'Seções não podem estar vazias');
    }
  }
});

for (const [key, filename] of [['terms', 'TERMOS_DE_USO.md'], ['privacy', 'POLITICA_DE_PRIVACIDADE.md']]) {
  test(`documentos legais: ${filename} reproduz a mesma íntegra exibida pelo aplicativo`, () => {
    const file = fs.readFileSync(path.join(root, 'legal', filename), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(file, markdown(key));
  });
}

test('documentos legais: maioridade declarada não é atestação oficial de identidade', () => {
  assert.match(terms, /18 anos/);
  assert.match(all, /cpf/);
  assert.match(all, /(?:matematic|digitos|formato)/);
  assert.match(all, /(?:validacao local|api propria|servidor)/);
  assert.match(all, /data de nascimento/);
  assert.match(all, /declarad/);
  assert.match(all, /(?:nao|sem)[^.\n]{0,220}(?:comprova|comprovacao|atesta|verificac|consulta)[^.\n]{0,160}(?:identidade|titularidade|oficia|receita)/);
  assert.match(all, /contas (?:antigas|legadas)/);
});

test('documentos legais: CPF recebe representação protegida sem guardar documento bruto ou nascimento', () => {
  assert.match(privacy, /representacao protegida/);
  assert.match(privacy, /cpf/);
  // Aceita tanto voz ativa ("não se grava CPF bruto") quanto passiva
  // ("CPF bruto e nascimento não são persistidos"), sem impor a redação.
  for (const subject of ['cpf (?:bruto|integral|completo)', '(?:data de )?nascimento']) {
    const notStored = new RegExp(`(?:nao|sem)[^.]{0,180}(?:armazen|persist|grav)[^.]{0,180}${subject}`
      + `|${subject}[^.]{0,180}nao[^.]{0,100}(?:armazen|persist|grav|conserv)`);
    assert.ok(notStored.test(privacy), `${subject} deve ser descrito como não persistido`);
  }
});

test('documentos legais: apoio acadêmico em Sandbox sem promessa de repasse real', () => {
  assert.match(terms, /sandbox/);
  for (const label of ['amigo', 'protetor', 'guardiao']) assert.ok(terms.includes(label));
  assert.match(terms, /gratuit/);
  assert.match(terms, /manutencao/);
  assert.match(terms, /infraestrutura/);
  assert.match(terms, /(?:nao|sem)[^.\n]{0,180}(?:repasse|transferencia|arrecadacao|cobranca)[^.\n]{0,100}(?:reais|real|financeir)/);
  assert.match(terms, /(?:nao|sem)[^.\n]{0,180}(?:destinad|repasse|animal especifico|diretamente)/);
});

test('documentos legais: vigência, cancelamento e PetCoins não implicam recorrência ou dinheiro', () => {
  assert.match(terms, /30 dias/);
  assert.match(terms, /cancel/);
  assert.match(terms, /(?:vencimento|fim do periodo|final do periodo)/);
  assert.match(terms, /(?:nao|sem)[^.\n]{0,150}(?:automatica|automatico|recorrente)/);
  assert.match(terms, /petcoins/);
  assert.match(terms, /(?:nao|sem)[^.\n]{0,150}(?:dinheiro|saque|conversao|valor monetario)/);
});

test('documentos legais: Mercado Pago recebe o checkout e o PetGo não armazena dados de cartão', () => {
  assert.match(all, /mercado pago/);
  assert.match(all, /(?:nao|sem)[^.\n]{0,180}(?:armazen|receb|acess)[^.\n]{0,180}(?:cartao|cvv)/);
  assert.match(privacy, /(?:preferencia|pagamento|checkout)/);
  assert.match(privacy, /(?:endereco|entrega)/);
});

test('documentos legais: quotas correspondem à janela móvel e ao dia de Brasília', () => {
  assert.match(terms, /5[^.\n]{0,100}(?:cadastros|registros)[^.\n]{0,100}5 minutos/);
  assert.match(terms, /(?:movel|deslizante|janela)/);
  assert.match(terms, /20[^.\n]{0,100}(?:dia|diari)/);
  assert.match(terms, /brasilia/);
  assert.match(terms, /(?:meia-noite|00:00)/);
});

test('documentos legais: moderação distingue bloqueio automático de decisão administrativa', () => {
  assert.match(terms, /sightengine/);
  assert.match(terms, /rosto/);
  assert.match(terms, /(?:banimento|suspensao)/);
  assert.match(terms, /(?:administrador|administrativ)/);
  assert.match(terms, /(?:revisao|contestacao|reavaliacao)/);
  assert.match(all, /(?:falsos positivos|falhas|infalivel)/);
});

test('documentos legais: exclusão preserva animais e explica retenção de auditoria', () => {
  assert.match(terms, /exclusao/);
  assert.match(terms, /animais/);
  assert.match(terms, /(?:preserv|mantid|permanec)/);
  assert.match(privacy, /auditoria/);
  assert.match(privacy, /(?:retencao|retid|conserv|permanec)/);
  assert.match(privacy, /(?:nome|e-mail)/);
  assert.match(privacy, /(?:backup|copias de seguranca)/);
  assert.ok(all.includes(documents.supportEmail));
});

test('documentos legais: contatos, fotos e infraestrutura são transparentes', () => {
  for (const service of ['supabase', 'render', 'vercel', 'google', 'sightengine', 'mercado pago']) {
    assert.ok(privacy.includes(service), `Política deve identificar ${service}`);
  }
  assert.match(privacy, /localizacao/);
  assert.match(privacy, /(?:telefone|whatsapp)/);
  assert.match(privacy, /(?:usuarios autenticados|outros usuarios)/);
  assert.match(privacy, /(?:url publica|urls publicas|link publico|links publicos)/);
});

test('documentos legais: versões públicas não prometem segurança absoluta ou certificação inexistente', () => {
  const unsupported = /(?:senhas[^.]{0,80}criptografad|todas[^.]{0,80}senhas[^.]{0,80}hash|100\s*%[^.]{0,80}(?:conforme|conformidade|seguranca)|seguranca (?:total|absoluta)|cpf[^.]{0,100}anonimizad)/;
  for (const sentence of all.split(/[.!?]\s+/)) {
    if (unsupported.test(sentence)) {
      assert.match(sentence, /(?:nao|sem|nenhum)/, 'O público não deve receber garantias técnicas ou legais inexistentes');
    }
  }
});

test('documentos legais: notas internas preservam limitações técnicas e identificação pendente', () => {
  assert.match(notes, /senha[^.]{0,180}texto (?:puro|plano|claro)/);
  assert.match(notes, /hmac/);
  assert.match(notes, /pseudonimiz/);
  assert.match(notes, /pendenc/);
  assert.match(notes, /(?:identificar|identificacao)[^.]{0,180}controlador/);
  assert.match(notes, /(?:art\.?\s*9|artigo 9)/);
});

test('documentos legais: leitura da política não constitui consentimento genérico', () => {
  assert.match(privacy, /consentimento/);
  assert.match(privacy, /legitimo interesse/);
  assert.match(privacy, /(?:execucao de contrato|execucao contratual)/);
  assert.match(privacy, /(?:nao|sem)[^.\n]{0,180}(?:consentimento generico|consentimento irrestrito|autorizacao generica|consentimento para todas|consentimento global)/);
  assert.match(privacy, /(?:revog|retir)/);
  assert.match(privacy, /(?:anpd|autoridade nacional)/);
  assert.match(all, /(?:lgpd|lei geral de protecao de dados)/);
  assert.match(all, /(?:eca digital|15\.211\/2025)/);
});

test('documentos legais: cadastro mantém dois links independentes para Termos e Política', () => {
  assert.match(registerSource, /\[\s*selectedLegalDocument\s*,\s*setSelectedLegalDocument\s*\]\s*=\s*useState\(\s*['"]terms['"]\s*\)/,
    'A seleção do documento não deve compartilhar o estado de aceite');
  for (const document of ['terms', 'privacy']) {
    const selection = new RegExp(`setSelectedLegalDocument\\(\\s*['"]${document}['"]\\s*\\)`);
    const link = registerButtons.find(button => selection.test(pressHandler(button) || ''));
    assert.ok(link, `Deve existir link para ${document}`);
    assert.deepEqual(press(pressHandler(link), document), [['document', document], ['visible', true]]);
  }
});

test('documentos legais: modal apresenta apenas o documento selecionado', () => {
  const selection = /const\s+selectedDocument\s*=\s*(legalDocuments\[selectedLegalDocument\])\s*;/.exec(registerSource);
  assert.ok(selection, 'A modal deve selecionar uma única íntegra');
  assert.match(registerSource, /\{selectedDocument\.title\}/);
  assert.match(registerSource, /selectedDocument\.sections\.map\(/);
  assert.doesNotMatch(registerSource, /\[\s*legalDocuments\.terms\s*,\s*legalDocuments\.privacy\s*\]/,
    'As duas íntegras não devem ser exibidas juntas');
  for (const document of ['terms', 'privacy']) {
    assert.equal(vm.runInNewContext(selection[1], { legalDocuments: documents, selectedLegalDocument: document }), documents[document]);
  }
});

test('documentos legais: fechar Política não registra aceite; Termos preservam o aceite existente', () => {
  assert.match(registerSource, /selectedLegalDocument\s*===\s*['"]terms['"]\s*\?/,
    'Os botões de aceite e fechamento devem depender do documento selecionado');
  for (const [document, label, expected] of [
    ['terms', 'Concordar com os Termos e fechar', [['agreed', true], ['visible', false]]],
    ['privacy', 'Fechar Política de Privacidade', [['visible', false]]]
  ]) {
    const button = registerButtons.find(item => item.includes(label) && pressHandler(item));
    assert.ok(button, `Deve existir botão específico para ${document}`);
    assert.deepEqual(press(pressHandler(button), document), expected);
  }
});
