BEGIN;
CREATE TABLE IF NOT EXISTS petgo_private.admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('user_ban', 'user_unban', 'animal_delete')),
  target_id text NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created ON petgo_private.admin_audit_log(created_at DESC, id DESC);
ALTER TABLE petgo_private.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON petgo_private.admin_audit_log FROM PUBLIC, anon, authenticated;
COMMIT;
