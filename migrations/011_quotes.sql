-- 011_quotes.sql
--
-- Sprint Finanzas 1A — Cotizaciones. La UI (`/dashboard/quotes`) ya existía
-- y consultaba `quotes` / `quote_line_items` / `quotes_view`, pero esas tablas
-- NUNCA se crearon en prod, así que la página salía vacía. Esta migración crea
-- el modelo de datos que los tipos de `src/types/finance.ts` esperan, más una
-- vista de listado y numeración automática (COT-YYYY-####).
--
-- Idempotente. Seguro de re-correr.

-- ─── quotes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT UNIQUE,                       -- auto: COT-YYYY-#### (trigger)

  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID,
  project_id UUID,
  agent_id UUID,

  -- Snapshot del cliente (se congela al crear, sobrevive si el contacto cambia)
  client_name TEXT,
  client_email TEXT,
  client_company TEXT,
  client_tax_id TEXT,

  -- Totales
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'COP',

  valid_until DATE,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','viewed','accepted','rejected','expired','converted','cancelled')),

  notes TEXT,
  terms_and_conditions TEXT,

  converted_to_deal_id UUID,
  converted_to_project_id UUID,
  converted_at TIMESTAMPTZ,

  template_id UUID,

  sent_at TIMESTAMPTZ,
  sent_count INT NOT NULL DEFAULT 0,

  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quotes_contact_idx ON quotes(contact_id);
CREATE INDEX IF NOT EXISTS quotes_status_idx ON quotes(status);
CREATE INDEX IF NOT EXISTS quotes_created_at_idx ON quotes(created_at DESC);

-- ─── quote_line_items ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id UUID,                                -- opcional: vertical de products

  description TEXT NOT NULL DEFAULT '',

  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,

  discount_percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,

  tax_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,

  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  order_index INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quote_line_items_quote_idx ON quote_line_items(quote_id);

-- ─── Numeración automática + updated_at ────────────────────────────
CREATE SEQUENCE IF NOT EXISTS quotes_number_seq START 1;

CREATE OR REPLACE FUNCTION quotes_set_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
    NEW.quote_number := 'COT-' || to_char(NOW(), 'YYYY') || '-' ||
                        lpad(nextval('quotes_number_seq')::text, 4, '0');
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quotes_set_number ON quotes;
CREATE TRIGGER quotes_set_number
  BEFORE INSERT ON quotes
  FOR EACH ROW EXECUTE FUNCTION quotes_set_number();

CREATE OR REPLACE FUNCTION quotes_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quotes_touch_updated_at ON quotes;
CREATE TRIGGER quotes_touch_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION quotes_touch_updated_at();

-- ─── Vista de listado (lo que consulta la página) ──────────────────
-- Expone client_name/company resolviendo el snapshot o, si está vacío, el
-- contacto enlazado. Incluye conteo de líneas.
CREATE OR REPLACE VIEW quotes_view AS
SELECT
  q.id,
  q.quote_number,
  q.contact_id,
  q.deal_id,
  q.project_id,
  q.agent_id,
  COALESCE(NULLIF(btrim(q.client_name), ''),
           btrim(c.first_name || ' ' || COALESCE(c.last_name, ''))) AS client_name,
  COALESCE(NULLIF(q.client_email, ''), c.email)                     AS client_email,
  COALESCE(NULLIF(q.client_company, ''), c.company_name)            AS client_company,
  q.client_tax_id,
  q.subtotal,
  q.discount_amount,
  q.discount_percentage,
  q.tax_amount,
  q.total_amount,
  q.currency,
  q.valid_until,
  q.status,
  q.notes,
  q.terms_and_conditions,
  q.converted_to_deal_id,
  q.converted_to_project_id,
  q.converted_at,
  q.template_id,
  q.sent_at,
  q.sent_count,
  q.created_by,
  q.created_at,
  q.updated_at,
  c.first_name  AS contact_first_name,
  c.last_name   AS contact_last_name,
  c.email       AS contact_email,
  c.company_name AS contact_company,
  (SELECT COUNT(*) FROM quote_line_items li WHERE li.quote_id = q.id) AS item_count
FROM quotes q
LEFT JOIN contacts c ON c.id = q.contact_id;

-- ─── RLS ───────────────────────────────────────────────────────────
-- El service_role (rutas API) bypassa RLS. Habilitamos RLS + política para
-- `authenticated` por si en el futuro se consulta desde el cliente con sesión.
-- `anon` queda sin acceso.
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotes_authenticated_all ON quotes;
CREATE POLICY quotes_authenticated_all ON quotes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS qli_authenticated_all ON quote_line_items;
CREATE POLICY qli_authenticated_all ON quote_line_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
