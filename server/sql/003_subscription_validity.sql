-- Revisar e executar no SQL Editor ANTES do deploy do backend.
-- Não modifica datas ou níveis já existentes do plano por nível.
BEGIN;
CREATE TABLE IF NOT EXISTS petgo_private.subscription_rollout (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  starts_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  premium_backfilled boolean NOT NULL DEFAULT false
);
INSERT INTO petgo_private.subscription_rollout (singleton) VALUES (true)
  ON CONFLICT (singleton) DO NOTHING;
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS premium_start_date timestamptz,
  ADD COLUMN IF NOT EXISTS premium_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS premium_status varchar DEFAULT 'INACTIVE';

-- PRO passa a ter relógio próprio. Preserva eventual prazo anterior informado.
UPDATE public.users SET premium_start_date = subscription_start_date,
  premium_end_date = subscription_end_date, premium_status = subscription_status
WHERE is_premium = 1 AND premium_start_date IS NULL AND premium_end_date IS NULL
  AND (subscription_start_date IS NOT NULL OR subscription_end_date IS NOT NULL)
  AND EXISTS (SELECT 1 FROM petgo_private.subscription_rollout WHERE singleton = true AND NOT premium_backfilled);
UPDATE petgo_private.subscription_rollout SET premium_backfilled = true WHERE singleton = true;

CREATE TABLE IF NOT EXISTS petgo_private.subscription_baselines (
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('plan', 'premium')),
  initial_state jsonb NOT NULL,
  PRIMARY KEY (user_id, kind)
);
CREATE TABLE IF NOT EXISTS petgo_private.subscription_events (
  event_key text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('plan', 'premium')),
  tier integer NOT NULL CHECK (tier BETWEEN 1 AND 3),
  approved_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_events_user_kind
  ON petgo_private.subscription_events(user_id, kind, approved_at, event_key);
ALTER TABLE petgo_private.subscription_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE petgo_private.subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE petgo_private.subscription_rollout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON petgo_private.subscription_baselines, petgo_private.subscription_events, petgo_private.subscription_rollout
  FROM PUBLIC, anon, authenticated;
COMMIT;
