-- 013_invoices.sql
--
-- Sprint Finanzas 1B — Facturación. La tabla `invoices` ya existe en prod, pero
-- faltan `invoice_line_items`, `payments`, la vista `invoices_view` y los
-- triggers (numeración FAC-YYYY-##### + actualizar estado/saldo al registrar
-- pago). La página /dashboard/invoices consulta invoices_view + payments.
--
-- Ojo: el esquema original referenciaba time_entries (no existe en prod) y
-- reinsertaba productos que chocan con la tabla de verticales — aquí se omiten.
--
-- Idempotente. Seguro de re-correr.

-- ─── Alinear la tabla `invoices` legacy con el módulo de finanzas ──
-- En prod `invoices` es una tabla minimalista (id, client_id, project_id,
-- invoice_number, total_amount, status, issue_date, due_date, created_at)
-- atada a `clients`. Se agregan, de forma ADITIVA, las columnas que el módulo
-- de finanzas necesita, y se aflojan los NOT NULL legacy que no usamos.
ALTER TABLE invoices ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN issue_date SET DEFAULT CURRENT_DATE;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS contact_id        UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quote_id          UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS agent_id          UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS series            TEXT DEFAULT 'A';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_name       TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_email      TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_company    TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_address    TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_tax_id     TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount   NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_amount        NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid       NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_due        NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency          TEXT NOT NULL DEFAULT 'COP';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_date         DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method    TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes             TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS terms             TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS footer_notes      TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at           TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_count        INT NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by        UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ─── invoice_line_items ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID,
  time_entry_id UUID,
  description TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit TEXT,
  discount_percentage NUMERIC(6,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_idx ON invoice_line_items(invoice_id);

-- ─── payments ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'COP',
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('cash','check','bank_transfer','credit_card','debit_card','stripe','paypal','mercadopago','wire_transfer','other')),
  transaction_id TEXT,
  reference_number TEXT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  gateway TEXT,
  gateway_response JSONB,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending','completed','failed','refunded')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS payments_date_idx ON payments(payment_date);

-- ─── Numeración automática FAC-YYYY-##### ──────────────────────────
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  year_text TEXT;
  seq INT;
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    year_text := to_char(CURRENT_DATE, 'YYYY');
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'FAC-[0-9]{4}-([0-9]+)') AS INTEGER)), 0) + 1
      INTO seq
    FROM invoices
    WHERE invoice_number LIKE 'FAC-' || year_text || '-%';
    NEW.invoice_number := 'FAC-' || year_text || '-' || LPAD(seq::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_invoice_number ON invoices;
CREATE TRIGGER trigger_generate_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

-- updated_at
CREATE OR REPLACE FUNCTION invoices_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS invoices_touch_updated_at ON invoices;
CREATE TRIGGER invoices_touch_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION invoices_touch_updated_at();

-- ─── Al registrar pago: recalcular saldo + estado ──────────────────
CREATE OR REPLACE FUNCTION update_invoice_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  invoice_total NUMERIC(14,2);
  total_paid NUMERIC(14,2);
BEGIN
  SELECT total_amount INTO invoice_total FROM invoices WHERE id = NEW.invoice_id;

  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM payments
  WHERE invoice_id = NEW.invoice_id AND status = 'completed';

  UPDATE invoices SET
    amount_paid = total_paid,
    amount_due = GREATEST(invoice_total - total_paid, 0),
    status = CASE
      WHEN total_paid >= invoice_total AND invoice_total > 0 THEN 'paid'
      WHEN total_paid > 0 THEN 'partially_paid'
      ELSE status
    END,
    paid_date = CASE
      WHEN total_paid >= invoice_total AND invoice_total > 0 THEN NEW.payment_date
      ELSE paid_date
    END,
    updated_at = NOW()
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_invoice_on_payment ON payments;
CREATE TRIGGER trigger_update_invoice_on_payment
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION update_invoice_on_payment();

-- ─── Vista de listado ──────────────────────────────────────────────
CREATE OR REPLACE VIEW invoices_view AS
SELECT
  i.*,
  COALESCE(NULLIF(btrim(i.client_name), ''),
           btrim(c.first_name || ' ' || COALESCE(c.last_name, ''))) AS display_client_name,
  c.first_name   AS contact_first_name,
  c.last_name    AS contact_last_name,
  c.email        AS contact_email,
  c.company_name AS contact_company,
  a.name         AS agent_name,
  (SELECT COUNT(*) FROM invoice_line_items ii WHERE ii.invoice_id = i.id) AS item_count,
  (i.total_amount - i.amount_paid) AS balance_due
FROM invoices i
LEFT JOIN contacts c ON c.id = i.contact_id
LEFT JOIN agents a ON a.id = i.agent_id;

-- ─── RLS (service_role bypassa; authenticated permitido; anon no) ──
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_invoices ON invoices;
DROP POLICY IF EXISTS invoices_authenticated_all ON invoices;
CREATE POLICY invoices_authenticated_all ON invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_invoice_items ON invoice_line_items;
DROP POLICY IF EXISTS ili_authenticated_all ON invoice_line_items;
CREATE POLICY ili_authenticated_all ON invoice_line_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all_payments ON payments;
DROP POLICY IF EXISTS payments_authenticated_all ON payments;
CREATE POLICY payments_authenticated_all ON payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
