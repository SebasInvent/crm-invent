-- 015_meetings.sql
--
-- Sprint 1E — Calendario. La página solo mostraba follow-ups de leads (lectura).
-- Se habilita crear/gestionar EVENTOS usando la tabla `meetings` existente, que
-- exige client_id NOT NULL (legacy → clients). Se relaja y se agregan campos
-- para el flujo nuevo (contact_id, description). RLS a `authenticated`.
--
-- Idempotente.

ALTER TABLE meetings ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS contact_id  UUID;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS created_by  UUID;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS meetings_scheduled_at_idx ON meetings(scheduled_at);

CREATE OR REPLACE FUNCTION meetings_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS meetings_touch_updated_at ON meetings;
CREATE TRIGGER meetings_touch_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION meetings_touch_updated_at();

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_meetings ON meetings;
DROP POLICY IF EXISTS meetings_authenticated_all ON meetings;
CREATE POLICY meetings_authenticated_all ON meetings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
