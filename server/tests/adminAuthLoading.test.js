const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const adminSource = file => fs.readFileSync(path.resolve(__dirname, '../../admin/src', file), 'utf8');
const contextSource = adminSource('context/AdminAuthContext.jsx');
const session = (id = 'admin-a', token = 'token-a') => ({ user: { id }, access_token: token });
const administrator = id => ({ id, email: `${id}@example.test` });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// Executa os hooks e o objeto value reais do Provider, sem React DOM, SDK,
// rede, Babel ou dependências adicionais. Apenas o invólucro JSX é removido.
function providerProgram(source) {
  const match = /<AdminAuthContext\.Provider\s+value=\{/.exec(source);
  assert.ok(match, 'o Provider precisa publicar seu estado no contexto');
  const opening = match.index + match[0].length - 1;
  let depth = 1, closing = opening + 1, quote = null;
  for (; closing < source.length && depth; closing++) {
    const char = source[closing];
    if (quote) {
      if (char === '\\') closing++;
      else if (char === quote) quote = null;
    } else if ('\'"`'.includes(char)) quote = char;
    else if (char === '{') depth++;
    else if (char === '}') depth--;
  }
  assert.equal(depth, 0);
  const value = source.slice(opening + 1, closing - 1);
  const returnIndex = source.lastIndexOf('return (', match.index);
  assert.ok(returnIndex >= 0);
  return `${source.slice(0, returnIndex)
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '')}return ${value};\n}\nAdminAuthProvider;`;
}

function contextFixture({ configured = true } = {}) {
  const slots = [], pendingEffects = [], requests = [], subscriptions = [], timers = new Map();
  const restoration = deferred();
  let cursor = 0, dirty = true, mounted = true, value, unmountedUpdates = 0, timerId = 0;
  const changed = (previous, next) => !previous || !next
    || previous.length !== next.length || next.some((item, index) => !Object.is(item, previous[index]));
  const auth = {
    getSession: () => restoration.promise,
    onAuthStateChange(callback) {
      const subscription = { active: true, callback, unsubscribe() { this.active = false; } };
      subscriptions.push(subscription);
      return { data: { subscription } };
    },
    async signInWithPassword() { return { error: null }; },
    async signOut() { return { error: null }; }
  };
  const environment = {
    AbortController, console,
    configurationError: configured ? '' : 'Configuração administrativa indisponível.',
    supabase: configured ? { auth } : null,
    createContext: () => ({}), useContext() {},
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { state: typeof initial === 'function' ? initial() : initial };
      return [slots[index].state, next => {
        if (!mounted) { unmountedUpdates++; return; }
        const previous = slots[index].state;
        const result = typeof next === 'function' ? next(previous) : next;
        if (!Object.is(previous, result)) { slots[index].state = result; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { ref: { current: initial } };
      return slots[index].ref;
    },
    useCallback(callback, dependencies) {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].dependencies, dependencies)) {
        slots[index] = { callback, dependencies };
      }
      return slots[index].callback;
    },
    useMemo(factory, dependencies) {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].dependencies, dependencies)) {
        slots[index] = { memo: factory(), dependencies };
      }
      return slots[index].memo;
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      if (!slots[index] || changed(slots[index].dependencies, dependencies)) {
        const previous = slots[index];
        slots[index] = { effect, dependencies, cleanup: previous?.cleanup };
        pendingEffects.push(index);
      }
    },
    fetchAdminIdentity(token, signal) {
      const request = { token, signal, ...deferred() };
      requests.push(request);
      // Não responde automaticamente ao abort: assim provamos que respostas
      // tardias são descartadas mesmo se a camada de transporte não cooperar.
      return request.promise;
    },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  const provider = vm.runInNewContext(providerProgram(contextSource), environment);
  const render = () => {
    cursor = 0; dirty = false;
    value = provider({ children: 'conteúdo protegido' });
    while (pendingEffects.length) {
      const slot = slots[pendingEffects.shift()];
      slot.cleanup?.();
      slot.cleanup = slot.effect();
    }
  };
  render();
  return {
    requests, restoration, subscriptions, timers,
    get value() { return value; },
    get unmountedUpdates() { return unmountedUpdates; },
    async flush() {
      for (let round = 0; round < 20; round++) {
        if (dirty && mounted) render();
        await Promise.resolve();
      }
      if (dirty && mounted) render();
      return value;
    },
    async restore(nextSession) {
      restoration.resolve({ data: { session: nextSession }, error: null });
      return this.flush();
    },
    async emit(event, nextSession) {
      for (const subscription of subscriptions) if (subscription.active) subscription.callback(event, nextSession);
      return this.flush();
    },
    async rerender() { dirty = true; return this.flush(); },
    async advanceTimers(milliseconds) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay <= milliseconds && timers.has(id)) { timers.delete(id); timer.callback(); }
      }
      return this.flush();
    },
    dispose() {
      mounted = false;
      for (const slot of slots) slot.cleanup?.();
    },
    async replayEffects() {
      // React StrictMode: setup, cleanup, setup na mesma instância.
      for (const slot of slots) if (slot.effect) { slot.cleanup?.(); slot.cleanup = slot.effect(); }
      return this.flush();
    }
  };
}

async function verifiedFixture() {
  const fixture = contextFixture();
  await fixture.restore(session());
  fixture.requests[0].resolve(administrator('admin-a'));
  await fixture.flush();
  assert.equal(fixture.value.loading, false);
  assert.equal(fixture.value.admin?.id, 'admin-a');
  return fixture;
}

test('admin: restauração e verificação iniciais terminam sem repetir durante navegação', async () => {
  const f = contextFixture();
  assert.equal(f.value.loading, true);
  await f.restore(session());
  assert.equal(f.value.loading, true);
  assert.equal(f.value.admin, null);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].token, 'token-a');
  f.requests[0].resolve(administrator('admin-a'));
  await f.flush();
  for (let index = 0; index < 5; index++) await f.rerender();
  await f.emit('SIGNED_IN', session());
  assert.equal(f.requests.length, 1, 'navegação/re-render e mesmo token reutilizam a permissão');
  assert.equal(f.value.loading, false);
  assert.equal(f.value.admin?.id, 'admin-a');
  assert.equal(f.value.hasSession, true);
  assert.equal(f.value.accessToken, 'token-a');
  f.dispose();
});

test('admin: sessão ausente ou configuração ausente nunca deixa loading preso', async () => {
  const f = contextFixture();
  await f.restore(null);
  assert.equal(f.value.loading, false);
  assert.equal(f.value.hasSession, false);
  assert.equal(f.value.admin, null);
  assert.equal(f.requests.length, 0);
  f.dispose();
  const missing = contextFixture({ configured: false });
  await missing.flush();
  assert.equal(missing.value.loading, false);
  assert.equal(missing.value.admin, null);
  assert.ok(missing.value.error);
  missing.dispose();
});

for (const [label, error] of [
  ['negação 403', Object.assign(new Error('Acesso administrativo negado.'), { status: 403 })],
  ['token 401', Object.assign(new Error('Sessão inválida.'), { status: 401 })],
  ['falha de conexão', new Error('Sem conexão com o servidor.')]
]) {
  test(`admin: ${label} encerra loading e não libera conteúdo protegido`, async () => {
    const f = contextFixture();
    await f.restore(session());
    f.requests[0].reject(error);
    await f.flush();
    assert.equal(f.value.loading, false);
    assert.equal(f.value.admin, null);
    assert.equal(f.value.error, error.message);
    await f.rerender();
    assert.equal(f.requests.length, 1);
    f.dispose();
  });
}

test('admin: refresh do token mantém conteúdo validado e revalida em segundo plano', async () => {
  const f = await verifiedFixture();
  await f.emit('TOKEN_REFRESHED', session('admin-a', 'token-a-refresh'));
  assert.equal(f.value.loading, false);
  assert.equal(f.value.admin?.id, 'admin-a');
  assert.equal(f.value.accessToken, 'token-a-refresh');
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].token, 'token-a-refresh');
  f.requests[1].resolve(administrator('admin-a'));
  await f.flush();
  assert.equal(f.value.loading, false);
  assert.equal(f.value.admin?.id, 'admin-a');
  await f.emit('SIGNED_IN', session('admin-a', 'token-a-refresh'));
  assert.equal(f.requests.length, 2);
  f.dispose();
});

test('admin: refresh recusado revoga a permissão sem loading infinito', async () => {
  const f = await verifiedFixture();
  await f.emit('TOKEN_REFRESHED', session('admin-a', 'token-a-refresh'));
  f.requests[1].reject(Object.assign(new Error('Administrador removido.'), { status: 403 }));
  await f.flush();
  assert.equal(f.value.loading, false);
  assert.equal(f.value.admin, null);
  assert.equal(f.value.error, 'Administrador removido.');
  f.dispose();
});

test('admin: falha de rede na revalidação em segundo plano também falha fechada', async () => {
  const f = await verifiedFixture();
  await f.emit('TOKEN_REFRESHED', session('admin-a', 'token-a-refresh'));
  assert.equal(f.value.loading, false);
  f.requests[1].reject(new Error('Não foi possível verificar a permissão atual.'));
  await f.flush();
  assert.equal(f.value.loading, false);
  assert.equal(f.value.admin, null);
  assert.ok(f.value.error);
  f.dispose();
});

test('admin: trocar usuário limpa imediatamente a autorização anterior', async () => {
  const f = await verifiedFixture();
  await f.emit('SIGNED_IN', session('admin-b', 'token-b'));
  assert.equal(f.value.admin, null);
  assert.equal(f.value.loading, true);
  assert.equal(f.value.accessToken, 'token-b');
  assert.equal(f.requests.length, 2);
  f.requests[1].resolve(administrator('admin-b'));
  await f.flush();
  assert.equal(f.value.admin?.id, 'admin-b');
  assert.equal(f.value.loading, false);
  f.dispose();
});

test('admin: logout aborta verificação e resposta tardia não restaura permissão', async () => {
  const f = contextFixture();
  await f.restore(session());
  const request = f.requests[0];
  await f.emit('SIGNED_OUT', null);
  assert.equal(request.signal?.aborted, true);
  assert.equal(f.value.loading, false);
  assert.equal(f.value.admin, null);
  assert.equal(f.value.hasSession, false);
  request.resolve(administrator('admin-a'));
  await f.flush();
  assert.equal(f.value.admin, null);
  assert.equal(f.value.hasSession, false);
  f.dispose();
});

for (const completion of ['resolve', 'reject']) {
  test(`admin: ${completion} obsoleto não interfere na verificação de outro usuário`, async () => {
    const f = contextFixture();
    await f.restore(session());
    const old = f.requests[0];
    await f.emit('SIGNED_IN', session('admin-b', 'token-b'));
    assert.equal(old.signal?.aborted, true);
    if (completion === 'resolve') old.resolve(administrator('admin-a'));
    else old.reject(new Error('Erro da sessão antiga.'));
    await f.flush();
    assert.equal(f.value.admin, null);
    assert.equal(f.value.loading, true);
    assert.notEqual(f.value.error, 'Erro da sessão antiga.');
    f.requests[1].resolve(administrator('admin-b'));
    await f.flush();
    assert.equal(f.value.admin?.id, 'admin-b');
    assert.equal(f.value.error, '');
    f.dispose();
  });
}

test('admin: 401/403 de uma página aborta /me pendente e sucesso tardio não desfaz revogação', async () => {
  const f = await verifiedFixture();
  await f.emit('TOKEN_REFRESHED', session('admin-a', 'token-a-refresh'));
  const pending = f.requests[1];
  f.value.invalidateAccess('Seu acesso administrativo foi revogado.');
  await f.flush();
  assert.equal(pending.signal?.aborted, true);
  assert.equal(f.value.admin, null);
  assert.equal(f.value.loading, false);
  pending.resolve(administrator('admin-a'));
  await f.flush();
  assert.equal(f.value.admin, null);
  assert.equal(f.value.error, 'Seu acesso administrativo foi revogado.');
  f.dispose();
});

test('admin: callback de invalidação capturado com token antigo não revoga login novo', async () => {
  const f = await verifiedFixture();
  const staleInvalidate = f.value.invalidateAccess;
  await f.emit('SIGNED_IN', session('admin-b', 'token-b'));
  f.requests[1].resolve(administrator('admin-b'));
  await f.flush();
  staleInvalidate('Negação de uma requisição da conta anterior.');
  await f.flush();
  assert.equal(f.value.admin?.id, 'admin-b');
  assert.equal(f.value.loading, false);
  assert.equal(f.value.error, '');
  f.dispose();
});

test('admin: callback de outro usuário não aborta verificação mesmo com token simulado igual', async () => {
  const f = await verifiedFixture();
  const staleInvalidate = f.value.invalidateAccess;
  await f.emit('SIGNED_IN', session('admin-b', 'token-a'));
  staleInvalidate('Negação de uma requisição da conta anterior.');
  await f.flush();
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].signal.aborted, false);
  assert.equal(f.value.loading, true);
  f.requests[1].resolve(administrator('admin-b'));
  await f.flush();
  assert.equal(f.value.admin?.id, 'admin-b');
  assert.equal(f.value.error, '');
  f.dispose();
});

test('admin: retry explícito volta a verificar e permite recuperar de erro', async () => {
  const f = contextFixture();
  await f.restore(session());
  f.requests[0].reject(new Error('Erro temporário.'));
  await f.flush();
  f.value.retry();
  await f.flush();
  assert.equal(f.value.loading, true);
  assert.equal(f.value.admin, null);
  assert.equal(f.requests.length, 2);
  f.requests[1].resolve(administrator('admin-a'));
  await f.flush();
  assert.equal(f.value.loading, false);
  assert.equal(f.value.admin?.id, 'admin-a');
  assert.equal(f.value.error, '');
  f.dispose();
});

test('admin: invalidação da tentativa antiga não aborta retry com o mesmo token', async () => {
  const f = await verifiedFixture();
  const obsoleteInvalidate = f.value.invalidateAccess;
  obsoleteInvalidate('Acesso revogado nesta tentativa.');
  await f.flush();
  f.value.retry();
  // Simula a resposta antiga no intervalo antes do próximo commit do React.
  obsoleteInvalidate('Resposta atrasada da tentativa anterior.');
  await f.flush();
  assert.equal(f.value.loading, true);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].signal.aborted, false);
  obsoleteInvalidate('Outra resposta atrasada.');
  await f.flush();
  assert.equal(f.requests[1].signal.aborted, false);
  f.requests[1].resolve(administrator('admin-a'));
  await f.flush();
  assert.equal(f.value.loading, false);
  assert.equal(f.value.admin?.id, 'admin-a');
  assert.equal(f.value.error, '');
  f.dispose();
});

test('admin: identidade /me divergente do usuário autenticado nunca libera acesso', async () => {
  const f = contextFixture();
  await f.restore(session());
  f.requests[0].resolve(administrator('outro-administrador'));
  await f.flush();
  assert.equal(f.value.loading, false);
  assert.equal(f.value.admin, null);
  assert.match(f.value.error, /autorização válida/);
  f.dispose();
});

test('admin: restauração Supabase travada tem timeout e permanece sem acesso', async () => {
  const f = contextFixture();
  await f.advanceTimers(15000);
  assert.equal(f.value.loading, false);
  assert.equal(f.value.admin, null);
  assert.equal(f.value.hasSession, false);
  assert.ok(f.value.error);
  assert.equal(f.requests.length, 0);
  f.dispose();
});

test('admin: erro ao restaurar sessão encerra loading de forma segura', async () => {
  const f = contextFixture();
  f.restoration.reject(new Error('Supabase indisponível.'));
  await f.flush();
  assert.equal(f.value.loading, false);
  assert.equal(f.value.admin, null);
  assert.ok(f.value.error);
  f.dispose();
});

test('admin: erro Supabase junto de sessão não autoriza dados potencialmente inválidos', async () => {
  const f = contextFixture();
  f.restoration.resolve({ data: { session: session() }, error: new Error('Sessão inválida.') });
  await f.flush();
  assert.equal(f.value.loading, false);
  assert.equal(f.value.admin, null);
  assert.equal(f.value.hasSession, false);
  assert.equal(f.requests.length, 0);
  assert.ok(f.value.error);
  f.dispose();
});

test('admin: evento de login mais recente prevalece sobre restauração atrasada', async () => {
  const f = contextFixture();
  await f.emit('SIGNED_IN', session('admin-b', 'token-b'));
  f.restoration.resolve({ data: { session: session() }, error: null });
  await f.flush();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].token, 'token-b');
  assert.equal(f.value.accessToken, 'token-b');
  f.requests[0].resolve(administrator('admin-b'));
  await f.flush();
  assert.equal(f.value.admin?.id, 'admin-b');
  f.dispose();
});

for (const invalid of [{ access_token: 'token-a' }, { user: { id: '' }, access_token: 'token-a' }]) {
  test(`admin: sessão sem identidade válida (${JSON.stringify(invalid)}) falha fechada`, async () => {
    const f = contextFixture();
    await f.restore(invalid);
    assert.equal(f.value.loading, false);
    assert.equal(f.value.admin, null);
    assert.equal(f.requests.length, 0);
    assert.ok(f.value.error);
    f.dispose();
  });
}

test('admin: desmontagem cancela transporte, assinatura e atualizações tardias', async () => {
  const f = contextFixture();
  await f.restore(session());
  const pending = f.requests[0];
  f.dispose();
  assert.equal(pending.signal?.aborted, true);
  assert.equal(f.subscriptions.every(item => !item.active), true);
  assert.equal(f.timers.size, 0);
  pending.resolve(administrator('admin-a'));
  await f.flush();
  assert.equal(f.unmountedUpdates, 0);
});

test('admin: StrictMode reinscreve listeners sem aplicar a requisição cancelada', async () => {
  const f = contextFixture();
  await f.restore(session());
  const first = f.requests[0];
  await f.replayEffects();
  assert.equal(first.signal?.aborted, true);
  assert.equal(f.subscriptions.filter(item => item.active).length, 1);
  first.resolve(administrator('admin-a'));
  await f.flush();
  assert.equal(f.value.admin, null);
  assert.equal(f.value.loading, true);
  const current = f.requests.at(-1);
  assert.notEqual(current, first);
  current.resolve(administrator('admin-a'));
  await f.flush();
  assert.equal(f.value.admin?.id, 'admin-a');
  assert.equal(f.value.loading, false);
  f.dispose();
});

test('admin API: /me encaminha AbortSignal e libera timeout/listener ao cancelar', async () => {
  const source = adminSource('lib/api.js').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const caller = new AbortController(), timers = new Set();
  const requests = [];
  let removedListeners = 0;
  const removeListener = caller.signal.removeEventListener.bind(caller.signal);
  caller.signal.removeEventListener = (...args) => { removedListeners++; return removeListener(...args); };
  const load = vm.runInNewContext(`${source}; fetchAdminIdentity;`, {
    apiBaseUrl: 'https://api.example.test', AbortController, URLSearchParams, TypeError,
    setTimeout(callback) { timers.add(callback); return callback; },
    clearTimeout(callback) { timers.delete(callback); },
    fetch(url, options) {
      requests.push({ url, options });
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('abortado'), { name: 'AbortError' })), { once: true });
      });
    }
  });
  const checking = load('token-atual', caller.signal);
  assert.equal(requests[0].url, 'https://api.example.test/admin/me');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer token-atual');
  caller.abort();
  await assert.rejects(checking, /conectar ao servidor/);
  assert.equal(requests[0].options.signal.aborted, true);
  assert.equal(timers.size, 0);
  assert.equal(removedListeners, 1);
});

test('admin API: /me sem resposta expira em 65 segundos e libera o transporte', async () => {
  const source = adminSource('lib/api.js').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const timers = new Map();
  let transportSignal;
  const load = vm.runInNewContext(`${source}; fetchAdminIdentity;`, {
    apiBaseUrl: 'https://api.example.test', AbortController, URLSearchParams, TypeError,
    setTimeout(callback, delay) { timers.set(callback, delay); return callback; },
    clearTimeout(callback) { timers.delete(callback); },
    fetch(_url, options) {
      transportSignal = options.signal;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(Object.assign(new Error('timeout'), { name: 'AbortError' })), { once: true });
      });
    }
  });
  const checking = load('token-atual');
  assert.equal(timers.size, 1);
  const [[expire, delay]] = [...timers];
  assert.equal(delay, 65000);
  expire();
  await assert.rejects(checking, /conectar ao servidor/);
  assert.equal(transportSignal.aborted, true);
  assert.equal(timers.size, 0);
});
