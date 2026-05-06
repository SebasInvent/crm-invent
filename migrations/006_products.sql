-- 006_products.sql
--
-- Sprint 8A — multi-product CRM. Adds first-class `products` so each
-- vertical Invent owns (Dental OS, Foody, Veralix, Mowi, El Sonar,
-- The iOS Bogotá, Buna Market, custom software) gets its own pipeline,
-- target market, pricing, and color identity.
--
-- Idempotent. Safe to re-run.

-- ─── Products table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,             -- url-safe identifier (?product=foody)
  name TEXT NOT NULL,                    -- display name
  tagline TEXT,                          -- one-liner shown in chips/cards
  description TEXT,                      -- longer copy for /products/[slug]
  target_market TEXT,                    -- "Clínicas dentales LATAM"
  price_model TEXT,                      -- "$1-3K/mes" or "$15K+ proyecto"
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','beta','idea','paused','archived')),
  color TEXT NOT NULL DEFAULT '#71717a', -- hex, drives chip + dot color
  icon TEXT,                             -- emoji or lucide icon name
  default_pipeline_id UUID,              -- FK populated after pipelines insert
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_slug_idx ON products(slug);
CREATE INDEX IF NOT EXISTS products_status_idx ON products(status);

CREATE OR REPLACE FUNCTION products_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_set_updated_at ON products;
CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION products_set_updated_at();

-- ─── Pipelines table (may already exist; ensure shape) ─────────────
CREATE TABLE IF NOT EXISTS pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS pipelines_product_id_idx ON pipelines(product_id);

-- ─── product_id columns on the entities that need scoping ──────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS contacts_product_id_idx
  ON contacts(product_id) WHERE product_id IS NOT NULL;

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS deals_product_id_idx
  ON deals(product_id) WHERE product_id IS NOT NULL;

-- chat_threads + leads may exist in this schema; tag them too
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_threads') THEN
    ALTER TABLE chat_threads
      ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS chat_threads_product_id_idx
      ON chat_threads(product_id) WHERE product_id IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN
    ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS leads_product_id_idx
      ON leads(product_id) WHERE product_id IS NOT NULL;
  END IF;
END $$;

-- ─── RLS ──────────────────────────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_authenticated_all ON products;
CREATE POLICY products_authenticated_all
  ON products FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pipelines_authenticated_all ON pipelines;
CREATE POLICY pipelines_authenticated_all
  ON pipelines FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
