-- 005_saved_views.sql
--
-- Sprint 6C: per-user saved view definitions for filterable lists
-- (today: leads. Tomorrow: contacts, deals, etc.). A "view" is just a
-- named bag of URL filter params, so it's storage-agnostic — adding
-- a new entity is a UI change, no schema change required.
--
-- Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner. Auth required to read/write your own views.
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Which list this view applies to. Free-form string so we don't
  -- have to migrate when we add another entity. Convention:
  -- 'leads' | 'contacts' | 'deals'.
  entity TEXT NOT NULL,

  -- Display name. Unique per (user, entity) so the dropdown is clean.
  name TEXT NOT NULL,

  -- Query string params, e.g. {"status":"hot","archetype":"hero_entrepreneur"}
  filters JSONB NOT NULL DEFAULT '{}',

  -- Optional pin to surface in the list at the top
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT saved_views_unique_name_per_user UNIQUE (user_id, entity, name)
);

CREATE INDEX IF NOT EXISTS saved_views_user_entity_idx
  ON saved_views(user_id, entity);

CREATE OR REPLACE FUNCTION saved_views_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS saved_views_set_updated_at ON saved_views;
CREATE TRIGGER saved_views_set_updated_at
  BEFORE UPDATE ON saved_views
  FOR EACH ROW
  EXECUTE FUNCTION saved_views_set_updated_at();

ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_views_select_own ON saved_views;
CREATE POLICY saved_views_select_own
  ON saved_views FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS saved_views_insert_own ON saved_views;
CREATE POLICY saved_views_insert_own
  ON saved_views FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS saved_views_update_own ON saved_views;
CREATE POLICY saved_views_update_own
  ON saved_views FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS saved_views_delete_own ON saved_views;
CREATE POLICY saved_views_delete_own
  ON saved_views FOR DELETE TO authenticated
  USING (user_id = auth.uid());
