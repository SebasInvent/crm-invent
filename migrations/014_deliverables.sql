-- 014_deliverables.sql
--
-- Sprint 1H — Entregables. La tabla agent_deliverables ya existe pero exige
-- agent_task_id / client_id / project_id / agent_id NOT NULL, lo que impide
-- crear un entregable suelto desde la UI. Se relajan esos NOT NULL y se agrega
-- contact_id + created_by para el flujo nuevo. La página pasa a leer vía API
-- (service role), así que la RLS se restringe a `authenticated`.
--
-- Idempotente.

ALTER TABLE agent_deliverables ALTER COLUMN agent_task_id DROP NOT NULL;
ALTER TABLE agent_deliverables ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE agent_deliverables ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE agent_deliverables ALTER COLUMN agent_id DROP NOT NULL;

ALTER TABLE agent_deliverables ADD COLUMN IF NOT EXISTS contact_id UUID;
ALTER TABLE agent_deliverables ADD COLUMN IF NOT EXISTS created_by UUID;

CREATE OR REPLACE FUNCTION deliverables_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS deliverables_touch_updated_at ON agent_deliverables;
CREATE TRIGGER deliverables_touch_updated_at
  BEFORE UPDATE ON agent_deliverables
  FOR EACH ROW EXECUTE FUNCTION deliverables_touch_updated_at();

ALTER TABLE agent_deliverables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_deliverables ON agent_deliverables;
DROP POLICY IF EXISTS deliverables_authenticated_all ON agent_deliverables;
CREATE POLICY deliverables_authenticated_all ON agent_deliverables
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
