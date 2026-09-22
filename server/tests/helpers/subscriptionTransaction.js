// Simula SOMENTE as consultas do serviço. A transação real é testada separadamente.
function subscriptionTransaction({ user, state, options = {}, record = () => {} }) {
  state.events = [];
  state.baselines = {};
  let queue = Promise.resolve();
  return work => {
    const job = queue.then(async () => {
      if (options.writeError) throw options.writeError;
      const copy = structuredClone({ user: { ...user, coins: state.coins }, events: state.events, baselines: state.baselines });
      const result = await work({ async query(sql, params) {
        record('tx', { sql, params });
        if (sql.startsWith('SELECT starts_at')) return { rows: [{ starts_at: options.rollout || '2000-01-01T00:00:00Z' }] };
        if (sql.includes('FOR UPDATE')) return { rows: options.missingUser ? [] : [{ ...copy.user }] };
        if (sql.startsWith('SELECT * FROM petgo_private.subscription_events WHERE event_key')) {
          return { rows: copy.events.filter(e => e.event_key === params[0]) };
        }
        if (sql.startsWith('INSERT INTO petgo_private.subscription_baselines')) {
          copy.baselines[params[1]] ??= JSON.parse(params[2]); return { rows: [] };
        }
        if (sql.startsWith('INSERT INTO petgo_private.subscription_events')) {
          if (copy.events.some(e => e.event_key === params[0])) throw new Error('duplicate');
          copy.events.push({ event_key: params[0], user_id: params[1], kind: params[2], tier: params[3], approved_at: params[4] });
          return { rows: [] };
        }
        if (sql.startsWith('SELECT initial_state')) return { rows: [{ initial_state: copy.baselines[params[1]] }] };
        if (sql.startsWith('SELECT * FROM petgo_private.subscription_events WHERE user_id')) {
          return { rows: copy.events.filter(e => e.kind === params[1]) };
        }
        if (sql.startsWith('UPDATE public.users SET')) {
          if (options.activationWriteError) throw options.activationWriteError;
          if (sql.includes("_status = 'CANCELLED'")) {
            const prefix = sql.includes('SET subscription_cancelled_at') ? 'subscription' : 'premium';
            copy.user[`${prefix}_cancelled_at`] = params[0];
            copy.user[`${prefix}_status`] = 'CANCELLED';
            return { rows: [{ ...copy.user }] };
          }
          const plan = sql.includes('SET plan_tier');
          const prefix = plan ? 'subscription' : 'premium';
          copy.user[plan ? 'plan_tier' : 'is_premium'] = params[0];
          copy.user[`${prefix}_start_date`] = params[1];
          copy.user[`${prefix}_end_date`] = params[2];
          copy.user[`${prefix}_status`] = params[3];
          copy.user[`${prefix}_cancelled_at`] = params[6] ?? null;
          copy.user.coins -= params[4];
          return { rows: [{ ...copy.user }] };
        }
        throw new Error(`Consulta não simulada: ${sql}`);
      } });
      Object.assign(user, copy.user);
      state.coins = copy.user.coins;
      state.events = copy.events;
      state.baselines = copy.baselines;
      return result;
    });
    queue = job.catch(() => {});
    return job;
  };
}
module.exports = { subscriptionTransaction };
