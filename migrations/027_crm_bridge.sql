-- 028_crm_bridge.sql — Auditable contact bridge between independent CRMs.

CREATE TABLE IF NOT EXISTS integration_contact_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  peer_system text NOT NULL CHECK (peer_system IN ('invent','yumk')),
  peer_contact_id uuid NOT NULL,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (peer_system, peer_contact_id),
  UNIQUE (local_contact_id, peer_system)
);
CREATE INDEX IF NOT EXISTS integration_contact_links_local_idx
  ON integration_contact_links(local_contact_id);

CREATE TABLE IF NOT EXISTS integration_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL UNIQUE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  peer_system text NOT NULL CHECK (peer_system IN ('invent','yumk')),
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_sync_events_status_idx
  ON integration_sync_events(status, created_at);

ALTER TABLE integration_contact_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_events ENABLE ROW LEVEL SECURITY;
