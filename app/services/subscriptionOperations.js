// A chave identifica uma intenção, não é uma credencial. Retry reutiliza a mesma.
export function newOperationId() {
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
export function createOperationRunner({ read, write, send, generate = newOperationId }) {
  const busy = new Set();
  return async function run(scope, action, payload, ensureSession = () => {}) {
    if (busy.has(scope)) throw new Error('Já existe uma operação em andamento. Aguarde.');
    busy.add(scope);
    try {
      ensureSession();
      let pending = await read(scope);
      ensureSession();
      const signature = JSON.stringify({ action, payload });
      if (pending && pending.signature !== signature) {
        throw new Error('Há uma ativação pendente. Repita a tentativa do mesmo benefício antes de iniciar outra compra.');
      }
      if (!pending) {
        pending = { signature, operationId: generate() };
        await write(scope, pending); // Persistir ANTES de enviar: sobreviver a reinício e timeout.
      }
      if (typeof pending.operationId !== 'string' || !/^[a-zA-Z0-9_-]{16,100}$/.test(pending.operationId)) {
        throw new Error('Registro local de operação inválido. Não foi feita nenhuma nova cobrança.');
      }
      ensureSession();
      const response = await send(action, { ...payload, operationId: pending.operationId });
      const data = await response.json();
      // 401/403 podem invalidar o token e já apresentam o aviso centralizado.
      if (![401, 403].includes(response.status)) ensureSession();
      // Erro de rede/5xx é ambíguo: manter o ID. Rejeição definitiva libera nova intenção.
      // Sessão expirada também mantém ID: tentativa anterior pode ter sido aplicada.
      if (response.ok || [400, 404, 409, 422].includes(response.status)) await write(scope, null);
      if (response.ok) ensureSession();
      return { response, data };
    } finally { busy.delete(scope); }
  };
}
