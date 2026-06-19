-- 018_integrations.sql
--
-- Sprint 1F — Integraciones. La página /dashboard/integrations ya está completa
-- (lee integrations + integration_installs, instala/desinstala) pero faltan las
-- tablas y el catálogo sembrado. RLS USING(true) — cliente anon, como el resto.
-- Idempotente.

-- ─── integrations (catálogo) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  provider_name TEXT,
  provider_logo_url TEXT,
  description TEXT,
  short_description TEXT,
  category TEXT NOT NULL DEFAULT 'custom',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','beta','deprecated')),
  featured_order INT,
  is_free BOOLEAN DEFAULT true,
  price_monthly NUMERIC(10,2) DEFAULT 0,
  config_fields JSONB DEFAULT '[]',
  documentation_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS integrations_category_idx ON integrations(category);

-- ─── integration_installs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  config JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','error','pending','uninstalled')),
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  uninstalled_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  installed_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS integration_installs_integration_idx ON integration_installs(integration_id);

-- ─── RLS (USING true — cliente anon) ───────────────────────────────
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_installs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_integrations ON integrations;
CREATE POLICY allow_all_integrations ON integrations FOR ALL USING (true);
DROP POLICY IF EXISTS allow_all_integration_installs ON integration_installs;
CREATE POLICY allow_all_integration_installs ON integration_installs FOR ALL USING (true);

-- ─── Catálogo (idempotente por slug) ───────────────────────────────
INSERT INTO integrations (slug, name, provider_name, category, short_description, description, featured_order, is_free, price_monthly, documentation_url, config_fields)
SELECT v.slug, v.name, v.provider, v.category, v.short_desc, v.descr, v.featured, v.is_free, v.price, v.docs, v.fields::jsonb
FROM (VALUES
  ('whatsapp-evolution','WhatsApp Business','Evolution API','communication','Recibe y responde WhatsApp desde el CRM','Conecta tu número de WhatsApp Business vía Evolution API para gestionar conversaciones desde el Inbox.',1,true,0,'https://doc.evolution-api.com','[{"name":"api_url","label":"URL de Evolution","type":"text","required":true},{"name":"api_key","label":"API Key","type":"password","required":true}]'),
  ('wompi','Wompi','Bancolombia','payment','Cobros con tarjeta, PSE y Nequi (Colombia)','Pasarela de pagos colombiana: tarjetas, PSE, Nequi y Bancolombia. Para cobrar facturas online.',2,true,0,'https://docs.wompi.co','[{"name":"public_key","label":"Llave pública","type":"text","required":true},{"name":"private_key","label":"Llave privada","type":"password","required":true}]'),
  ('google-calendar','Google Calendar','Google','calendar','Sincroniza eventos del CRM con tu calendario','Sincroniza los eventos del Calendario del CRM con Google Calendar en ambos sentidos.',3,true,0,'https://developers.google.com/calendar','[]'),
  ('gmail','Gmail','Google','email','Envía y recibe emails desde el CRM','Conecta Gmail para enviar y registrar correos en el historial de cada contacto.',NULL,true,0,'https://developers.google.com/gmail','[]'),
  ('stripe','Stripe','Stripe','payment','Pagos internacionales con tarjeta','Procesa pagos internacionales y suscripciones con Stripe.',NULL,true,0,'https://stripe.com/docs','[{"name":"secret_key","label":"Secret Key","type":"password","required":true}]'),
  ('siigo','Siigo','Siigo','accounting','Facturación electrónica DIAN','Emite facturas electrónicas válidas ante la DIAN desde el CRM.',NULL,false,0,'https://siigoapi.docs.apiary.io','[{"name":"username","label":"Usuario","type":"text","required":true},{"name":"access_key","label":"Access Key","type":"password","required":true}]'),
  ('slack','Slack','Slack','communication','Notificaciones del CRM en Slack','Recibe alertas de nuevos leads, pagos y entregables en un canal de Slack.',NULL,true,0,'https://api.slack.com','[{"name":"webhook_url","label":"Webhook URL","type":"password","required":true}]'),
  ('meta-ads','Meta Ads','Meta','analytics','Métricas de campañas de Facebook/Instagram','Trae el rendimiento de tus campañas de Meta Ads al CRM.',NULL,true,0,'https://developers.facebook.com/docs/marketing-apis','[]'),
  ('zapier','Zapier','Zapier','automation','Conecta el CRM con 5000+ apps','Automatiza flujos entre el CRM y miles de apps vía Zapier.',NULL,false,0,'https://zapier.com/developer','[{"name":"webhook_url","label":"Zapier Webhook","type":"text","required":true}]')
) AS v(slug,name,provider,category,short_desc,descr,featured,is_free,price,docs,fields)
WHERE NOT EXISTS (SELECT 1 FROM integrations i WHERE i.slug = v.slug);

-- Marcar WhatsApp como ya conectado (Evolution API está en uso)
INSERT INTO integration_installs (integration_id, status, config)
SELECT i.id, 'active', '{}'::jsonb
FROM integrations i
WHERE i.slug = 'whatsapp-evolution'
  AND NOT EXISTS (
    SELECT 1 FROM integration_installs ii
    WHERE ii.integration_id = i.id AND ii.status <> 'uninstalled'
  );
