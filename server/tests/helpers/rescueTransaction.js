// Simulação serializada das consultas reais; commit só publica o estado ao concluir.
function rescueTransaction({ user, state, options, record }) {
  let queue = Promise.resolve();
  return work => {
    const job = queue.then(async () => {
      if (options.writeError) throw options.writeError;
      const copy = { ...state, creationEvents: [...(state.creationEvents || options.creationEvents || [])],
        rescueDeclarations: [...(state.rescueDeclarations || [])] };
      const result = await work({ async query(sql, params) {
        record('tx', { sql, params });
        if (sql.includes('FROM petgo_private.user_eligibility')) {
          if (options.eligibilityError) throw options.eligibilityError;
          return { rows: copy.eligibility ? [{ ...copy.eligibility }] : [] };
        }
        if (sql.includes('INSERT INTO petgo_private.rescue_declarations')) {
          if (options.rescueDeclarationError) throw options.rescueDeclarationError;
          if (copy.rescueDeclarations.some(declaration => String(declaration.animal_id) === String(params[0]))) {
            throw Object.assign(new Error('duplicate declaration'), { code: '23505' });
          }
          copy.rescueDeclarations.push({ animal_id: params[0], user_id: params[1], rescuer_name: params[2],
            rescuer_contact: params[3], rescuer_email: params[4], terms_version: params[5] });
          return { rows: [] };
        }
        if (sql.includes('pg_advisory_xact_lock')) {
          if (options.limitError) throw options.limitError;
          return { rows: [] };
        }
        if (sql.includes('COUNT(e.id)')) {
          const at = options.now ? options.now() : Date.now();
          const dayStart = Math.floor((at - 3 * 3600000) / 86400000) * 86400000 + 3 * 3600000;
          const events = copy.creationEvents.filter(event => String(event.userId) === String(params[0]));
          const recent = events.filter(event => event.at > at - 300000);
          return { rows: [{ at: new Date(at), day_start: new Date(dayStart), recent_count: recent.length,
            daily_count: events.filter(event => event.at >= dayStart).length,
            recent_retry: recent.length ? Math.ceil((Math.min(...recent.map(event => event.at)) + 300000 - at) / 1000) : null,
            daily_retry: Math.ceil((dayStart + 86400000 - at) / 1000) }] };
        }
        if (sql.startsWith('DELETE FROM petgo_private.animal_creation_events')) {
          copy.creationEvents = copy.creationEvents.filter(event => String(event.userId) !== String(params[0])
            || event.at >= Math.min(new Date(params[1]).getTime(), new Date(params[2]).getTime() - 300000));
          return { rows: [] };
        }
        if (sql.startsWith('INSERT INTO petgo_private.animal_creation_events')) {
          if (options.reservationError) throw options.reservationError;
          copy.creationEvents.push({ id: params[0], userId: params[1], at: new Date(params[2]).getTime() });
          return { rows: [] };
        }
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
