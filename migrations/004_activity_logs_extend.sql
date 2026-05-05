-- 004_activity_logs_extend.sql
--
-- Sprint 6B: extends activity_logs so the application can record
-- automatic events on leads (today's table only knows about contacts
-- and deals) and so we have richer activity_type values than the
-- original CRUD-focused ones.
--
-- Idempotent: safe to run more than once.

-- 1. Add lead_id column (FK to leads, cascade delete) if not present
ALTER TABLE activity_logs
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE CASCADE;

-- Helpful index for the lead detail timeline
CREATE INDEX IF NOT EXISTS activity_logs_lead_id_idx
  ON activity_logs(lead_id) WHERE lead_id IS NOT NULL;

-- 2. Widen the activity_type CHECK constraint. Postgres doesn't
-- support ALTER CHECK directly — drop + add the constraint.
DO $$
BEGIN
  -- Drop existing CHECK if it exists (name is auto-generated; we
  -- look it up). Skip silently if it isn't there.
  PERFORM 1
    FROM pg_constraint
    WHERE conrelid = 'activity_logs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%activity_type%';
  IF FOUND THEN
    EXECUTE (
      SELECT 'ALTER TABLE activity_logs DROP CONSTRAINT ' || quote_ident(conname)
      FROM pg_constraint
      WHERE conrelid = 'activity_logs'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%activity_type%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE activity_logs
  ADD CONSTRAINT activity_logs_activity_type_chk CHECK (activity_type IN (
    -- Original
    'note', 'email', 'call', 'meeting', 'task_completed',
    'stage_change', 'deal_created', 'deal_won', 'deal_lost',
    'web_visit', 'document_viewed', 'proposal_sent',
    'conversation', 'telegram_message', 'whatsapp_message',
    -- Sprint 6B: lead lifecycle
    'lead_created', 'lead_status_change', 'lead_score_change',
    'lead_priority_change', 'lead_archived', 'lead_deleted',
    'lead_follow_up_set',
    -- Sprint 6B: deal lifecycle (richer than just stage_change)
    'deal_moved', 'deal_value_change', 'deal_assigned',
    -- Sprint 6B: bulk
    'bulk_operation'
  ));
