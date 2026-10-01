const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.resolve(__dirname, '../../app', file), 'utf8');
const palette = import(`data:text/javascript;base64,${Buffer.from(read('theme/colors.js')).toString('base64')}`);
const login = read('screens/LoginScreen.js');

test('hierarquia: Coins dourado, Mercado Pago vinho, Pix verde e Apoiar outline', async () => {
  const { colors } = await palette;
  const account = read('screens/AccountScreen.js');
  for (const [method, token] of [['COINS', 'coins'], ['MERCADO_PAGO', 'action'], ['PIX', 'success']]) {
    const button = account.slice(0, account.indexOf(`onPress={() => processPhysicalPurchase('${method}')}`));
    assert.ok(button.includes('style={[styles.btnSave'));
    assert.match(button.slice(button.lastIndexOf('style={[styles.btnSave')), new RegExp(`backgroundColor: colors\\.${token}\\b`));
  }
  const source = read('screens/MapScreen.js');
  const styles = vm.runInNewContext(`${source.slice(source.indexOf('const styles ='))}; styles;`, { colors, StyleSheet: { create: value => value } });
  assert.equal(styles.rescueButton.backgroundColor, colors.action);
  assert.equal(styles.donateButtonNew.backgroundColor, colors.surface);
  assert.equal(styles.donateButtonNew.borderColor, colors.action);
  assert.equal(styles.donateButtonNew.borderWidth, 1);
  assert.equal(styles.donateButtonText.color, colors.action);
  assert.equal(styles.drawerActions.gap, 12);
  assert.equal(styles.drawerActions.flexWrap, 'wrap');
  assert.match(source.split('\n').find(line => line.includes('>Apoiar</Text>')), /name="heart" size=\{18\} color=\{colors.action\}/);
});

test('marca: CTAs vinho, cadastro e WhatsApp verdes, avatar marrom e fundos claros', async () => {
  const { colors } = await palette;
  const stylesFor = file => {
    const source = read(file);
    return vm.runInNewContext(`${source.slice(source.indexOf('const styles ='))}; styles;`, { colors, Platform: { OS: 'android' }, StyleSheet: { create: value => value } });
  };
  const map = stylesFor('screens/MapScreen.js');
  for (const name of ['saveButton', 'rescueButton', 'confirmRescueBtn', 'mpButton']) assert.equal(map[name].backgroundColor, colors.action);
  assert.equal(map.shareButton.backgroundColor, colors.success);
  assert.equal(map.tag.backgroundColor, colors.surface);
  assert.equal(stylesFor('screens/RegisterScreen.js').button.backgroundColor, colors.success);
  const account = stylesFor('screens/AccountScreen.js');
  assert.equal(account.avatar.backgroundColor, colors.primary);
  assert.equal(account.avatarPremium.borderColor, colors.primary);
  assert.equal(account.partnerIconArea.backgroundColor, colors.surface);
  assert.equal(account.deleteButton.backgroundColor, colors.danger);
  for (const os of ['android', 'ios']) assert.equal(stylesFor(`components/PetMap.${os}.js`).userMarker.backgroundColor, colors.primary);
});

test('marca: planos preservam preços e cores exclusivas de Protetor/Guardião', async () => {
  const { colors } = await palette;
  const source = read('screens/SubscriptionScreen.js');
  const start = source.indexOf('  const plans =');
  const end = source.indexOf('  const handleSubscribe', start);
  const plans = vm.runInNewContext(`${source.slice(start, end)}; plans;`, { colors });
  assert.equal(plans[0].color, colors.action);
  assert.equal(plans[1].color, '#8E44AD');
  assert.equal(plans[2].color, '#F39C12');
  assert.equal(plans.map(p => p.price).join(','), 'R$ 19,90,R$ 39,90,R$ 79,90');
});

test('marca: paleta oficial e cores exclusivas dos planos preservadas', async () => {
  const { colors } = await palette;
  assert.deepEqual({ ...colors }, {
    action: '#8B1E3F', primary: '#5A3E2B', surface: '#F5E9E2', text: '#333333',
    background: '#FFFFFF', success: '#22C55E', danger: '#EF4444', coins: '#946200',
    protector: '#8E44AD', guardian: '#F39C12'
  });
  assert.equal(Object.isFrozen(colors), true);
});

test('marca: Login usa logo fornecida e estilos sem azul; rolagem e campos continuam presentes', async () => {
  const { colors } = await palette;
  const styles = vm.runInNewContext(`${login.slice(login.indexOf('const styles ='))}; styles;`, {
    colors, StyleSheet: { create: value => value }
  });
  assert.equal(styles.buttonPrimary.backgroundColor, colors.action);
  assert.equal(styles.buttonSecondaryText.color, colors.primary);
  assert.equal(styles.input.backgroundColor, colors.surface);
  assert.equal(styles.input.color, colors.text);
  assert.equal(styles.modalContent.backgroundColor, colors.background);
  assert.equal(styles.cancelText.color, colors.danger);
  assert.equal(styles.logo.width, 160);
  assert.equal(styles.logo.height, 160);
  assert.equal(styles.logo.flexShrink, 0);
  assert.equal(styles.subtitle.marginBottom, 24);
  assert.equal(styles.inputContainer.marginBottom, 8);
  assert.equal(styles.logo.maxWidth, '100%');
  assert.match(login, /require\('\.\.\/assets\/LogoPetGo\.png'\)/);
  assert.match(login, /resizeMode="contain"/);
  assert.match(login, /<ScrollView/);
  assert.match(login, /<KeyboardAvoidingView/);
  assert.match(login, /<PasswordInput/);
  assert.doesNotMatch(login, /#4A90E2|#B0C4E2/);
  const png = fs.readFileSync(path.resolve(__dirname, '../../app/assets/LogoPetGo.png'));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('marca: navegação mantém tema base e define marrom ativo', async () => {
  const { colors } = await palette;
  const app = read('App.js');
  const start = app.indexOf('const navigationTheme =');
  const end = app.indexOf('function Tabs()', start);
  const DefaultTheme = { dark: false, fonts: { regular: { fontFamily: 'System' } }, colors: {} };
  const theme = vm.runInNewContext(`${app.slice(start, end)}; navigationTheme;`, { colors, DefaultTheme });
  assert.equal(theme.fonts, DefaultTheme.fonts);
  assert.equal(theme.colors.primary, colors.primary);
  assert.equal(theme.colors.background, colors.background);
  assert.match(app, /tabBarActiveTintColor: colors.primary/);
  assert.match(app, /theme=\{navigationTheme\}/);
});

test('marca: handlers do Login preservam payloads, validações e recuperação', async () => {
  const start = login.indexOf('  const handleLogin =');
  const end = login.indexOf('  return (', start);
  const calls = [];
  const handlers = vm.runInNewContext(`${login.slice(start, end)}; ({ handleLogin, handleForgotPassword });`, {
    email: ' teste@example.test ', password: 'senha-original', resetEmail: ' recuperar@example.test ',
    login: async (...args) => calls.push(['login', ...args]),
    requestPasswordReset: async (...args) => { calls.push(['reset', ...args]); return true; },
    setIsLoading() {}, setIsResettingPassword() {},
    setResetEmail: value => calls.push(['email', value]),
    setForgotPasswordModalVisible: value => calls.push(['modal', value]),
    Alert: { alert: () => assert.fail('Dados válidos não devem exibir erro') }
  });
  await handlers.handleLogin();
  await handlers.handleForgotPassword();
  assert.deepEqual(calls, [['login', 'teste@example.test', 'senha-original'],
    ['reset', 'recuperar@example.test'], ['email', ''], ['modal', false]]);
});
