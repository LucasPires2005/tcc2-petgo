// Simulação serializada das consultas reais; commit só publica o estado ao concluir.
function rescueTransaction({ user, state, options, record }) {
  let queue = Promise.resolve();
  return work => {
    const job = queue.then(async () => {
      if (options.writeError) throw options.writeError;
      const copy = { ...state };
      const result = await work({ async query(sql, params) {
        record('tx', { sql, params });
        if (sql.startsWith('SELECT id, status FROM public.animals')) {
          return { rows: options.missingAnimal ? [] : [{ id: params[0], status: copy.rescued ? 1 : 0 }] };
        }
        if (sql.includes('FROM public.users') && sql.includes('FOR UPDATE')) {
          const profile = require('../../services/subscriptions').profileWithValidity(user);
          return { rows: [{ coins: copy.coins, plan_tier: profile.plan_tier }] };
        }
        if (sql.startsWith('UPDATE public.animals')) {
          if (options.animalWriteError) throw options.animalWriteError;
          copy.rescued = true;
          copy.rescuer = params[3];
          return { rows: [] };
        }
        if (sql.startsWith('UPDATE public.users SET coins')) {
          if (options.rewardError) throw options.rewardError;
          const balance = copy.coins ?? 0;
          if (balance < 0 || balance > 2147483647 - params[0]) return { rows: [] };
          copy.coins = balance + params[0];
          return { rows: [{ coins: copy.coins }] };
        }
        throw new Error(`Consulta não simulada: ${sql}`);
      } });
      Object.assign(state, copy);
      return result;
    });
    queue = job.catch(() => {});
    return job;
  };
}
module.exports = { rescueTransaction };
