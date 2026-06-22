-- 021_add_org_id.sql — Multi-tenant F1: columna `org_id` (nullable) en todas
-- las tablas de datos + índice. Nullable en esta fase: el backfill (023) la
-- llena y el NOT NULL llega en F3 (025). No activa RLS. Idempotente.
--
-- Las tablas que no existan en prod se saltan (guard por information_schema).

DO $$
DECLARE t text;
  tablas text[] := ARRAY[
    -- raíces / documentos / alto volumen (org_id propio)
    'contacts','deals','leads','projects','pipelines','channels',
    'message_templates','conversations','unified_messages','chat_threads',
    'chat_messages','quotes','invoices','payments','meetings',
    'agent_deliverables','integration_installs','automated_insights','notes',
    'activity_logs','email_logs','documents','document_folders','campaigns',
    'saved_views','agents','api_keys','api_request_logs',
    -- hijas / líneas (org_id denormalizado para índice y policy simple)
    'quote_line_items','invoice_line_items','lead_interactions','pipeline_stages',
    'tasks','time_entries','milestones','agent_tasks','task_dependencies',
    'resource_allocations','project_budgets','document_folder_items',
    'document_shares','document_signatures'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id)', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(org_id)', 'idx_'||t||'_org', t);
    END IF;
  END LOOP;
END $$;

-- agents: puente opcional al usuario auth (para mapear "miembro del equipo" → login)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='agents') THEN
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id);
  END IF;
END $$;
