-- 027_yumk_global_operations.sql
--
-- Workspace operativo de Yumk Group dentro de Control:
--   * aislamiento por organización activa (RLS)
--   * entidades operativas USA / Colombia y monedas USD / COP
--   * programas comerciales + pipelines
--   * diagnósticos públicos trazables hasta lead/contacto/deal
--
-- Idempotente. Requiere 020–024.

-- ─── Configuración del workspace ──────────────────────────────────
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS legal_name text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS home_country text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_currency text DEFAULT 'USD';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS reporting_currency text DEFAULT 'USD';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Bogota';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}';

INSERT INTO organizations (
  name, slug, legal_name, owner_user_id, owner_email,
  home_country, default_currency, reporting_currency, timezone, settings
)
SELECT
  'Yumk Group', 'yumk', 'Yumk Group LLC',
  (SELECT id FROM auth.users WHERE lower(email) = 'admon@yumkgroup.com' LIMIT 1),
  'admon@yumkgroup.com', 'US', 'USD', 'USD', 'America/New_York',
  '{"markets":["US","CO"],"languages":["en","es"],"brand":"Yumk Group"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug = 'yumk');

UPDATE organizations
SET legal_name = COALESCE(legal_name, 'Yumk Group LLC'),
    home_country = COALESCE(home_country, 'US'),
    default_currency = 'USD',
    reporting_currency = 'USD',
    timezone = 'America/New_York',
    settings = COALESCE(settings, '{}'::jsonb) ||
      '{"markets":["US","CO"],"languages":["en","es"],"brand":"Yumk Group"}'::jsonb,
    updated_at = now()
WHERE slug = 'yumk';

-- El equipo administrador actual de Invent también puede operar Yumk. Si
-- existe el usuario de admon@yumkgroup.com, entra como owner.
INSERT INTO organization_members (org_id, user_id, role)
SELECT y.id, u.id,
       CASE WHEN lower(u.email) = 'admon@yumkgroup.com' THEN 'owner' ELSE 'admin' END
FROM organizations y
JOIN auth.users u ON lower(u.email) = 'admon@yumkgroup.com'
WHERE y.slug = 'yumk'
ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO organization_members (org_id, user_id, role)
SELECT DISTINCT y.id, m.user_id, 'admin'
FROM organizations y
JOIN organizations invent ON invent.slug = 'invent'
JOIN organization_members m ON m.org_id = invent.id AND m.role IN ('owner','admin')
WHERE y.slug = 'yumk'
ON CONFLICT (org_id, user_id) DO NOTHING;

-- ─── Entidades / mercados ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operating_entities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code              text NOT NULL,
  name              text NOT NULL,
  legal_name        text,
  country_code      text NOT NULL CHECK (country_code IN ('US','CO')),
  currency          text NOT NULL CHECK (currency IN ('USD','COP')),
  timezone          text NOT NULL,
  locale            text NOT NULL,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);
CREATE INDEX IF NOT EXISTS idx_operating_entities_org ON operating_entities(org_id);

INSERT INTO operating_entities
  (org_id, code, name, legal_name, country_code, currency, timezone, locale)
SELECT id, 'US', 'Yumk USA', 'Yumk Group LLC', 'US', 'USD', 'America/New_York', 'en-US'
FROM organizations WHERE slug = 'yumk'
ON CONFLICT (org_id, code) DO UPDATE SET
  name = EXCLUDED.name, legal_name = EXCLUDED.legal_name,
  currency = EXCLUDED.currency, timezone = EXCLUDED.timezone,
  locale = EXCLUDED.locale, is_active = true, updated_at = now();

INSERT INTO operating_entities
  (org_id, code, name, legal_name, country_code, currency, timezone, locale)
SELECT id, 'CO', 'Yumk Colombia', 'Yumk Group — Operación Colombia', 'CO', 'COP', 'America/Bogota', 'es-CO'
FROM organizations WHERE slug = 'yumk'
ON CONFLICT (org_id, code) DO UPDATE SET
  name = EXCLUDED.name, legal_name = EXCLUDED.legal_name,
  currency = EXCLUDED.currency, timezone = EXCLUDED.timezone,
  locale = EXCLUDED.locale, is_active = true, updated_at = now();

DO $$
DECLARE t text;
  tablas text[] := ARRAY['contacts','leads','deals','projects','quotes','invoices','meetings'];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS operating_entity_id uuid REFERENCES operating_entities(id) ON DELETE SET NULL',
        t
      );
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(operating_entity_id)', 'idx_'||t||'_operating_entity', t);
    END IF;
  END LOOP;
END $$;
-- ─── Diagnóstico público → CRM ────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnostic_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  operating_entity_id uuid REFERENCES operating_entities(id) ON DELETE SET NULL,
  contact_id          uuid REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id             uuid REFERENCES leads(id) ON DELETE SET NULL,
  deal_id             uuid REFERENCES deals(id) ON DELETE SET NULL,
  name                text NOT NULL,
  email               text NOT NULL,
  phone               text,
  company             text,
  market              text NOT NULL CHECK (market IN ('US','CO','INTL')),
  language            text NOT NULL DEFAULT 'en' CHECK (language IN ('en','es')),
  answers             jsonb NOT NULL DEFAULT '[]',
  recommended_program text NOT NULL,
  complexity          text NOT NULL,
  indicative_range    text NOT NULL,
  indicative_timeline text NOT NULL,
  lead_score          integer NOT NULL CHECK (lead_score BETWEEN 0 AND 100),
  classification      text NOT NULL,
  consent_status      text NOT NULL DEFAULT 'granted',
  source_url          text,
  referrer            text,
  utm                  jsonb NOT NULL DEFAULT '{}',
  status              text NOT NULL DEFAULT 'new'
                      CHECK (status IN ('new','reviewed','contacted','qualified','converted','archived')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diagnostic_submissions_org_created
  ON diagnostic_submissions(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_submissions_email
  ON diagnostic_submissions(lower(email));

-- ─── Programas y pipelines Yumk ──────────────────────────────────
INSERT INTO products (slug, name, tagline, target_market, price_model, status, color, icon, metadata)
VALUES
  ('yumk-digital-foundation', 'Digital Foundation', 'Presencia tecnológica y captura comercial', 'Empresas que organizan su base digital', '$18K–35K USD', 'active', '#d7ff4f', '◫', '{"workspace":"yumk","program_order":1}'),
  ('yumk-digital-commerce', 'Digital Commerce', 'Ventas, reservas y pagos conectados', 'Empresas listas para transaccionar online', '$28K–65K USD', 'active', '#63e6be', '↗', '{"workspace":"yumk","program_order":2}'),
  ('yumk-business-automation', 'Business Automation', 'Procesos, CRM, IA e integraciones', 'Operaciones con trabajo manual y sistemas aislados', '$35K–85K USD', 'active', '#74c0fc', '⚡', '{"workspace":"yumk","program_order":3}'),
  ('yumk-saas-launch', 'SaaS Launch', 'Producto digital multiusuario listo para mercado', 'Empresas y founders con conocimiento productizable', '$60K–170K+ USD', 'active', '#b197fc', '◆', '{"workspace":"yumk","program_order":4}'),
  ('yumk-custom-technology', 'Custom Technology', 'Arquitectura compleja hecha a medida', 'Marketplaces y plataformas multiempresa', '$90K–220K+ USD', 'active', '#ff8787', '✦', '{"workspace":"yumk","program_order":5}')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, tagline = EXCLUDED.tagline,
  target_market = EXCLUDED.target_market, price_model = EXCLUDED.price_model,
  status = EXCLUDED.status, color = EXCLUDED.color, icon = EXCLUDED.icon,
  metadata = products.metadata || EXCLUDED.metadata, updated_at = now();

INSERT INTO pipelines (name, description, currency, product_id, is_default, is_active, org_id)
SELECT p.name || ' — Yumk', 'Embudo comercial USA + Colombia para ' || p.name,
       'USD', p.id, true, true, o.id
FROM products p
CROSS JOIN organizations o
WHERE o.slug = 'yumk' AND p.slug LIKE 'yumk-%'
  AND NOT EXISTS (
    SELECT 1 FROM pipelines pl WHERE pl.org_id = o.id AND pl.product_id = p.id
  );

DO $$
DECLARE rec record;
BEGIN
  FOR rec IN
    SELECT pl.id AS pipeline_id, pl.org_id
    FROM pipelines pl
    JOIN products p ON p.id = pl.product_id
    JOIN organizations o ON o.id = pl.org_id
    WHERE o.slug = 'yumk' AND p.slug LIKE 'yumk-%'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE pipeline_id = rec.pipeline_id) THEN
      INSERT INTO pipeline_stages
        (pipeline_id, name, default_probability, order_index, color, is_active, org_id)
      VALUES
        (rec.pipeline_id, 'Diagnóstico recibido', 10, 1, '#71717a', true, rec.org_id),
        (rec.pipeline_id, 'Calificado',           30, 2, '#74c0fc', true, rec.org_id),
        (rec.pipeline_id, 'Sesión de estrategia', 45, 3, '#b197fc', true, rec.org_id),
        (rec.pipeline_id, 'Validación técnica',   60, 4, '#ffd43b', true, rec.org_id),
        (rec.pipeline_id, 'Propuesta enviada',    75, 5, '#ffa94d', true, rec.org_id),
        (rec.pipeline_id, 'Negociación',          90, 6, '#ff8787', true, rec.org_id),
        (rec.pipeline_id, 'Ganado',              100, 7, '#63e6be', true, rec.org_id),
        (rec.pipeline_id, 'Perdido',               0, 8, '#f87171', true, rec.org_id);
    END IF;
  END LOOP;
END $$;

-- ─── Aislamiento por workspace activo ─────────────────────────────
CREATE OR REPLACE FUNCTION active_user_org_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.active_org_id
  FROM profiles p
  WHERE p.id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM organization_members m
      WHERE m.user_id = auth.uid() AND m.org_id = p.active_org_id
    )
$$;

DO $$
DECLARE t text; pol record;
  tablas text[] := ARRAY[
    'contacts','deals','leads','projects','pipelines','channels',
    'message_templates','conversations','unified_messages','chat_threads',
    'chat_messages','quotes','invoices','payments','meetings',
    'agent_deliverables','integration_installs','automated_insights','notes',
    'activity_logs','email_logs','documents','document_folders','campaigns',
    'saved_views','agents','api_keys','api_request_logs','quote_line_items',
    'invoice_line_items','lead_interactions','pipeline_stages','tasks',
    'time_entries','milestones','agent_tasks','task_dependencies',
    'resource_allocations','project_budgets','document_folder_items',
    'document_shares','document_signatures','operating_entities',
    'diagnostic_submissions'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='org_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
      END LOOP;
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (org_id = active_user_org_id()) WITH CHECK (org_id = active_user_org_id())',
        t || '_active_org', t
      );
    END IF;
  END LOOP;
END $$;

-- Las vistas deben respetar el RLS de sus tablas base.
DO $$
DECLARE v text;
  vistas text[] := ARRAY[
    'quotes_view','deals_full','invoices_view','conversations_view',
    'inbox_view','documents_view','contacts_with_organization'
  ];
BEGIN
  FOREACH v IN ARRAY vistas LOOP
    IF to_regclass('public.' || v) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW %I SET (security_invoker = true)', v);
    END IF;
  END LOOP;
END $$;
