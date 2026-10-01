const { randomUUID } = require('node:crypto');

async function reserveAnimalCreation(db, userId) {
  return db.transaction(async tx => {
    // Serializa somente admissões do mesmo usuário, inclusive em instâncias diferentes.
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('petgo:animal-create:' || $1::text, 0))", [userId]);
    const { rows: [limits] } = await tx.query(`
      WITH moment AS (SELECT clock_timestamp() AS at), bounds AS (
        SELECT at,
          date_trunc('day', at AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' AS day_start,
          (date_trunc('day', at AT TIME ZONE 'America/Sao_Paulo') + interval '1 day') AT TIME ZONE 'America/Sao_Paulo' AS day_end
        FROM moment
      )
      SELECT b.at, b.day_start,
        COUNT(e.id) FILTER (WHERE e.created_at > b.at - interval '5 minutes') AS recent_count,
        COUNT(e.id) FILTER (WHERE e.created_at >= b.day_start) AS daily_count,
        CEIL(EXTRACT(EPOCH FROM (
          MIN(e.created_at) FILTER (WHERE e.created_at > b.at - interval '5 minutes') + interval '5 minutes' - b.at
        ))) AS recent_retry,
        CEIL(EXTRACT(EPOCH FROM (b.day_end - b.at))) AS daily_retry
      FROM bounds b LEFT JOIN petgo_private.animal_creation_events e
        ON e.user_id = $1 AND e.created_at >= LEAST(b.day_start, b.at - interval '5 minutes')
      GROUP BY b.at, b.day_start, b.day_end`, [userId]);
    const recent = Number(limits?.recent_count), daily = Number(limits?.daily_count);
    if (!limits || !Number.isSafeInteger(recent) || recent < 0 || !Number.isSafeInteger(daily) || daily < 0) {
      throw new Error('ANIMAL_CREATION_LIMIT_INVALID');
    }
    if (recent >= 5 || daily >= 20) {
      const retryAfter = Math.max(1, recent >= 5 ? Number(limits.recent_retry) : 0,
        daily >= 20 ? Number(limits.daily_retry) : 0);
      if (!Number.isSafeInteger(retryAfter)) throw new Error('ANIMAL_CREATION_LIMIT_INVALID');
      return { allowed: false, retryAfter, daily: daily >= 20 };
    }
    // Guarda apenas o histórico necessário à janela móvel e ao dia atual.
    await tx.query(`DELETE FROM petgo_private.animal_creation_events
      WHERE user_id = $1 AND created_at < LEAST($2::timestamptz, $3::timestamptz - interval '5 minutes')`,
    [userId, limits.day_start, limits.at]);
    const reservationId = randomUUID();
    await tx.query(`INSERT INTO petgo_private.animal_creation_events (id, user_id, created_at)
      VALUES ($1, $2, $3)`, [reservationId, userId, limits.at]);
    return { allowed: true, reservationId };
  });
}

function releaseAnimalCreation(db, userId, reservationId) {
  return new Promise((resolve, reject) => db.run(
    'DELETE FROM petgo_private.animal_creation_events WHERE id = ? AND user_id = ?',
    [reservationId, userId], error => error ? reject(error) : resolve()
  ));
}

module.exports = { reserveAnimalCreation, releaseAnimalCreation };
