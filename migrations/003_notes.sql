-- 003_notes.sql
--
-- Adds a polymorphic notes table that can attach to a lead, contact,
-- or deal. Notes are first-class objects (not stuffed into JSONB) so
-- we can index, search, and audit them.
--
-- Run this in your self-hosted Supabase (studio.inventagency.co)
-- via SQL editor, or via psql:
--   psql -h <host> -U postgres -d postgres -f migrations/003_notes.sql
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Polymorphic FK. Exactly ONE of these must be set per row,
  -- enforced via the CHECK constraint below.
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,

  -- Content
  body TEXT NOT NULL,

  -- Authorship
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_email TEXT, -- denormalized for display when author is gone

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Exactly one parent
  CONSTRAINT notes_one_parent_chk CHECK (
    (CASE WHEN lead_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN deal_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX IF NOT EXISTS notes_lead_id_idx       ON notes(lead_id)    WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notes_contact_id_idx    ON notes(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notes_deal_id_idx       ON notes(deal_id)    WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notes_created_at_idx    ON notes(created_at DESC);

-- Auto-bump updated_at on UPDATE
CREATE OR REPLACE FUNCTION notes_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notes_set_updated_at ON notes;
CREATE TRIGGER notes_set_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION notes_set_updated_at();

-- RLS — open by default for the authenticated role since this is a
-- single-tenant CRM today. Lock down later if/when multi-org lands.
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notes_authenticated_all ON notes;
CREATE POLICY notes_authenticated_all
  ON notes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
