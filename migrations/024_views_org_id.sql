-- 024_views_org_id.sql — Multi-tenant F2b
--
-- Las vistas de listado deben ARRASTRAR org_id para poder filtrar por workspace
-- desde las rutas API (service_role) y, en F3, desde el cliente autenticado.
--
-- Dos casos:
--   • Vistas con `t.*` (deals_full, invoices_view, inbox_view, documents_view):
--     se "congelaron" antes de que 021 añadiera org_id → recrearlas las hace
--     recoger la columna automáticamente.
--   • Vistas con columnas explícitas (quotes_view, conversations_view): se añade
--     org_id al final de la lista.
--
-- NO se activa `security_invoker` aquí: varias de estas vistas todavía se leen
-- con el cliente anon (Pipeline, Inbox, Documentos). El security_invoker llega
-- en F3, junto con el flip de RLS, una vez esas páginas usen sesión. Idempotente.

-- ─── quotes_view (+ org_id) ────────────────────────────────────────
DROP VIEW IF EXISTS quotes_view;
CREATE VIEW quotes_view AS
SELECT
  q.id, q.quote_number, q.contact_id, q.deal_id, q.project_id, q.agent_id,
  COALESCE(NULLIF(btrim(q.client_name), ''),
           btrim(c.first_name || ' ' || COALESCE(c.last_name, ''))) AS client_name,
  COALESCE(NULLIF(q.client_email, ''), c.email)                     AS client_email,
  COALESCE(NULLIF(q.client_company, ''), c.company_name)            AS client_company,
  q.client_tax_id, q.subtotal, q.discount_amount, q.discount_percentage,
  q.tax_amount, q.total_amount, q.currency, q.valid_until, q.status, q.notes,
  q.terms_and_conditions, q.converted_to_deal_id, q.converted_to_project_id,
  q.converted_at, q.template_id, q.sent_at, q.sent_count, q.created_by,
  q.created_at, q.updated_at,
  c.first_name  AS contact_first_name,
  c.last_name   AS contact_last_name,
  c.email       AS contact_email,
  c.company_name AS contact_company,
  (SELECT COUNT(*) FROM quote_line_items li WHERE li.quote_id = q.id) AS item_count,
  q.org_id
FROM quotes q
LEFT JOIN contacts c ON c.id = q.contact_id;

-- ─── deals_full (d.* ya incluye org_id al recrear) ─────────────────
DROP VIEW IF EXISTS deals_full;
CREATE VIEW deals_full AS
SELECT
  d.*,
  c.first_name   AS contact_first_name,
  c.last_name    AS contact_last_name,
  c.email        AS contact_email,
  c.company_name AS contact_company,
  c.phone        AS contact_phone,
  ps.name        AS stage_name,
  ps.color       AS stage_color,
  ps.order_index AS pipeline_stage_order,
  p.name         AS pipeline_name,
  a.name         AS owner_name,
  (d.value * d.probability / 100) AS weighted_value
FROM deals d
JOIN contacts c ON c.id = d.contact_id
LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
LEFT JOIN pipelines p ON p.id = d.pipeline_id
LEFT JOIN agents a ON a.id = d.owner_id;

-- ─── invoices_view (i.* ya incluye org_id) ─────────────────────────
DROP VIEW IF EXISTS invoices_view;
CREATE VIEW invoices_view AS
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

-- ─── conversations_view (+ org_id) ─────────────────────────────────
DROP VIEW IF EXISTS conversations_view;
CREATE VIEW conversations_view AS
SELECT
  conv.id, conv.contact_id, conv.channel_id, conv.thread_id, conv.subject, conv.status,
  conv.last_message_at, conv.last_message_preview, conv.last_message_direction,
  conv.message_count, conv.unread_count, conv.assigned_to, conv.tags, conv.created_at, conv.updated_at,
  COALESCE(c.first_name, conv.subject) AS contact_first_name,
  c.last_name    AS contact_last_name,
  c.email        AS contact_email,
  c.company_name AS contact_company,
  ch.name        AS channel_name,
  ch.type        AS channel_type,
  a.name         AS assigned_to_name,
  conv.org_id
FROM conversations conv
LEFT JOIN contacts c ON c.id = conv.contact_id
LEFT JOIN channels ch ON ch.id = conv.channel_id
LEFT JOIN agents a ON a.id = conv.assigned_to
WHERE conv.channel_id IS NOT NULL;

-- ─── inbox_view (m.* ya incluye org_id) ────────────────────────────
DROP VIEW IF EXISTS inbox_view;
CREATE VIEW inbox_view AS
SELECT
  m.*,
  c.first_name   AS contact_first_name,
  c.last_name    AS contact_last_name,
  c.email        AS contact_email,
  c.company_name AS contact_company,
  ch.name        AS channel_name,
  a.name         AS assigned_to_name
FROM unified_messages m
LEFT JOIN contacts c ON c.id = m.contact_id
LEFT JOIN channels ch ON ch.id = m.channel_id
LEFT JOIN agents a ON a.id = m.assigned_to;

-- ─── documents_view (d.* ya incluye org_id) ────────────────────────
DROP VIEW IF EXISTS documents_view;
CREATE VIEW documents_view AS
SELECT
  d.*,
  c.company_name AS contact_company,
  c.first_name   AS contact_first_name,
  c.last_name    AS contact_last_name
FROM documents d
LEFT JOIN contacts c ON c.id = d.contact_id;
