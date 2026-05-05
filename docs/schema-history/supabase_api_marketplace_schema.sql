-- CRM Fase 8: API REST y Marketplace de Integraciones
-- Schema para API keys, webhooks, integrations y marketplace

-- ============================================
-- API KEYS (Autenticación para API REST)
-- ============================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificación
  name TEXT NOT NULL,
  description TEXT,
  
  -- Key única (generada automáticamente)
  key_hash TEXT UNIQUE NOT NULL, -- Hash de la key (nunca almacenamos la key plana)
  key_prefix TEXT NOT NULL, -- Primeros 8 caracteres para identificación
  
  -- Relación con agente/tenant
  agent_id UUID REFERENCES agents(id),
  
  -- Permisos (scope-based)
  scopes TEXT[] DEFAULT '{"read:contacts", "read:deals"}',
  -- Opciones: read:*, write:*, admin:*, read:contacts, write:contacts, etc.
  
  -- Rate limiting
  rate_limit_per_minute INTEGER DEFAULT 60,
  rate_limit_per_hour INTEGER DEFAULT 1000,
  rate_limit_per_day INTEGER DEFAULT 10000,
  
  -- Tracking de uso
  last_used_at TIMESTAMP WITH TIME ZONE,
  request_count_total INTEGER DEFAULT 0,
  request_count_this_month INTEGER DEFAULT 0,
  
  -- Estado
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- IP whitelist (opcional)
  allowed_ips TEXT[] DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES agents(id)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_agent ON api_keys(agent_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

-- ============================================
-- API REQUEST LOGS (Auditoría)
-- ============================================

CREATE TABLE IF NOT EXISTS api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  api_key_id UUID REFERENCES api_keys(id),
  
  -- Request details
  method TEXT NOT NULL, -- GET, POST, PUT, DELETE, PATCH
  path TEXT NOT NULL,
  query_params JSONB DEFAULT '{}',
  
  -- Response
  status_code INTEGER,
  response_time_ms INTEGER,
  
  -- Body (truncated for large payloads)
  request_body TEXT,
  response_body TEXT,
  
  -- Metadata
  ip_address TEXT,
  user_agent TEXT,
  
  -- Error tracking
  error_message TEXT,
  error_stack TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_logs_key ON api_request_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_path ON api_request_logs(path);
CREATE INDEX IF NOT EXISTS idx_api_logs_status ON api_request_logs(status_code);

-- Vista de estadísticas de API
CREATE OR REPLACE VIEW api_usage_stats AS
SELECT 
  api_key_id,
  COUNT(*) as total_requests,
  COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) as successful_requests,
  COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_requests,
  AVG(response_time_ms) as avg_response_time,
  MAX(response_time_ms) as max_response_time,
  MIN(created_at) as first_request_at,
  MAX(created_at) as last_request_at
FROM api_request_logs
WHERE created_at >= date_trunc('month', CURRENT_DATE)
GROUP BY api_key_id;

-- ============================================
-- WEBHOOKS (Para integraciones entrantes)
-- ============================================

CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Endpoint configuration
  endpoint_url TEXT NOT NULL,
  secret TEXT, -- Para verificar firma
  
  -- Eventos que escucha
  events TEXT[] NOT NULL, -- ['contact.created', 'deal.won', 'invoice.paid']
  
  -- Estado
  is_active BOOLEAN DEFAULT true,
  
  -- Retry configuration
  retry_count INTEGER DEFAULT 3,
  retry_interval_seconds INTEGER DEFAULT 60,
  
  -- Metadata del último intento
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  last_response_status INTEGER,
  last_error TEXT,
  
  -- Contadores
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  
  created_by UUID REFERENCES agents(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_events ON webhooks USING gin(events);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(is_active);

-- Log de webhook deliveries
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  webhook_id UUID REFERENCES webhooks(id),
  
  -- Evento que disparó
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  
  -- Delivery
  request_body JSONB,
  response_status INTEGER,
  response_body TEXT,
  
  -- Timing
  attempt_number INTEGER DEFAULT 1,
  delivered_at TIMESTAMP WITH TIME ZONE,
  
  -- Error
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event ON webhook_deliveries(event_type);

-- ============================================
-- INTEGRACIONES (Marketplace)
-- ============================================

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificación
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- nombre-unico-para-url
  description TEXT,
  short_description TEXT, -- Para listado
  
  -- Categoría
  category TEXT NOT NULL CHECK (category IN (
    'communication', 'email', 'calendar', 'payment', 
    'accounting', 'storage', 'social', 'automation', 
    'analytics', 'crm', 'custom'
  )),
  
  -- Proveedor/Autor
  provider_name TEXT NOT NULL,
  provider_website TEXT,
  provider_logo_url TEXT,
  
  -- Tipo de integración
  integration_type TEXT DEFAULT 'oauth' CHECK (integration_type IN ('oauth', 'api_key', 'webhook', 'iframe')),
  
  -- OAuth config (si aplica)
  oauth_authorize_url TEXT,
  oauth_token_url TEXT,
  oauth_scopes TEXT[] DEFAULT '{}',
  
  -- Campos de configuración requeridos
  config_fields JSONB DEFAULT '[]', -- [{"name": "api_key", "type": "string", "required": true}]
  
  -- Documentación
  documentation_url TEXT,
  setup_instructions TEXT,
  
  -- Marketplace metadata
  featured_order INTEGER, -- NULL = no destacado, número = orden de destacado
  rating_average DECIMAL(2,1),
  rating_count INTEGER DEFAULT 0,
  install_count INTEGER DEFAULT 0,
  
  -- Precio
  is_free BOOLEAN DEFAULT true,
  price_monthly DECIMAL(10,2),
  price_yearly DECIMAL(10,2),
  
  -- Estado
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'deprecated', 'removed')),
  
  -- Versionado
  version TEXT DEFAULT '1.0.0',
  min_crm_version TEXT, -- Versión mínima del CRM requerida
  
  created_by UUID REFERENCES agents(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrations_category ON integrations(category);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status);
CREATE INDEX IF NOT EXISTS idx_integrations_featured ON integrations(featured_order) WHERE featured_order IS NOT NULL;

-- Instalaciones de integraciones por tenant/agente
CREATE TABLE IF NOT EXISTS integration_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  integration_id UUID REFERENCES integrations(id),
  installed_by UUID REFERENCES agents(id),
  
  -- Configuración (encriptada si contiene secrets)
  config JSONB DEFAULT '{}',
  config_encrypted TEXT,
  
  -- OAuth tokens (encriptados)
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Estado
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error', 'uninstalled')),
  last_error TEXT,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  
  -- Webhook configurado por esta integración
  webhook_id UUID REFERENCES webhooks(id),
  
  installed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  uninstalled_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_installs_integration ON integration_installs(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_installs_agent ON integration_installs(installed_by);
CREATE INDEX IF NOT EXISTS idx_integration_installs_status ON integration_installs(status);

-- ============================================
-- EVENTOS DEL SISTEMA (Para webhooks)
-- ============================================

CREATE TABLE IF NOT EXISTS system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  event_type TEXT NOT NULL, -- contact.created, deal.updated, etc.
  
  -- Entidad afectada
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  
  -- Datos del evento
  payload JSONB NOT NULL,
  
  -- Metadata
  triggered_by UUID REFERENCES agents(id),
  source TEXT DEFAULT 'api' CHECK (source IN ('api', 'webhook', 'ui', 'integration', 'system')),
  
  -- Procesamiento
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(event_type);
CREATE INDEX IF NOT EXISTS idx_system_events_entity ON system_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_processed ON system_events(processed) WHERE processed = false;

-- Trigger function para crear eventos automáticamente
CREATE OR REPLACE FUNCTION create_system_event()
RETURNS TRIGGER AS $$
DECLARE
  event_name TEXT;
  payload JSONB;
BEGIN
  -- Determinar el tipo de evento
  IF TG_OP = 'INSERT' THEN
    event_name := TG_TABLE_NAME || '.created';
    payload := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    event_name := TG_TABLE_NAME || '.updated';
    payload := jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    event_name := TG_TABLE_NAME || '.deleted';
    payload := to_jsonb(OLD);
  END IF;
  
  -- Insertar el evento
  INSERT INTO system_events (event_type, entity_type, entity_id, payload, source)
  VALUES (
    event_name,
    TG_TABLE_NAME,
    CASE 
      WHEN TG_OP = 'DELETE' THEN OLD.id
      ELSE NEW.id
    END,
    payload,
    'system'
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear triggers para tablas principales
-- (Comentados para evitar sobrecarga, activar según necesidad)
-- CREATE TRIGGER trigger_events_contacts AFTER INSERT OR UPDATE OR DELETE ON contacts
-- FOR EACH ROW EXECUTE FUNCTION create_system_event();

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista del marketplace
CREATE OR REPLACE VIEW marketplace_view AS
SELECT 
  i.*,
  ii.status as install_status,
  ii.installed_at,
  ii.installed_by
FROM integrations i
LEFT JOIN integration_installs ii ON ii.integration_id = i.id AND ii.status = 'active';

-- Vista de uso de API por endpoint
CREATE OR REPLACE VIEW api_endpoint_usage AS
SELECT 
  path,
  method,
  COUNT(*) as request_count,
  COUNT(DISTINCT api_key_id) as unique_keys,
  AVG(response_time_ms) as avg_response_time,
  COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) as success_count,
  COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
FROM api_request_logs
WHERE created_at >= date_trunc('day', CURRENT_DATE)
GROUP BY path, method
ORDER BY request_count DESC;

-- ============================================
-- RLS
-- ============================================

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;

-- Políticas
DROP POLICY IF EXISTS allow_all_api_keys ON api_keys;
CREATE POLICY allow_all_api_keys ON api_keys FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_api_logs ON api_request_logs;
CREATE POLICY allow_all_api_logs ON api_request_logs FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_webhooks ON webhooks;
CREATE POLICY allow_all_webhooks ON webhooks FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_webhook_deliveries ON webhook_deliveries;
CREATE POLICY allow_all_webhook_deliveries ON webhook_deliveries FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_integrations ON integrations;
CREATE POLICY allow_all_integrations ON integrations FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_integration_installs ON integration_installs;
CREATE POLICY allow_all_integration_installs ON integration_installs FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_system_events ON system_events;
CREATE POLICY allow_all_system_events ON system_events FOR ALL USING (true);

-- ============================================
-- DATOS INICIALES - Integraciones populares
-- ============================================

INSERT INTO integrations (name, slug, description, short_description, category, provider_name, integration_type, status, featured_order, is_free, config_fields) VALUES
('Stripe', 'stripe', 'Procesa pagos y suscripciones con Stripe', 'Pasarela de pagos para facturación', 'payment', 'Stripe', 'api_key', 'active', 1, true, '[{"name":"secret_key","type":"string","required":true,"label":"Secret Key"},{"name":"webhook_secret","type":"string","required":false,"label":"Webhook Secret"}]'),

('SendGrid', 'sendgrid', 'Envía emails transaccionales y marketing con SendGrid', 'Email delivery y marketing', 'email', 'Twilio', 'api_key', 'active', 2, true, '[{"name":"api_key","type":"string","required":true,"label":"API Key"}]'),

('Google Calendar', 'google-calendar', 'Sincroniza eventos y reuniones con Google Calendar', 'Sincronización de calendario', 'calendar', 'Google', 'oauth', 'active', 3, true, '[]'),

('Slack', 'slack', 'Notificaciones y comandos en Slack', 'Notificaciones en tiempo real', 'communication', 'Slack', 'oauth', 'active', 4, true, '[]'),

('WhatsApp Business API', 'whatsapp-business', 'Envía mensajes de WhatsApp a tus clientes', 'Mensajería WhatsApp', 'communication', 'Meta', 'api_key', 'active', 5, true, '[{"name":"phone_number_id","type":"string","required":true,"label":"Phone Number ID"},{"name":"access_token","type":"string","required":true,"label":"Access Token"}]'),

('Dropbox', 'dropbox', 'Almacena y sincroniza documentos en Dropbox', 'Almacenamiento en la nube', 'storage', 'Dropbox', 'oauth', 'active', NULL, true, '[]'),

('Zapier', 'zapier', 'Automatiza flujos de trabajo con Zapier', 'Automatización de procesos', 'automation', 'Zapier', 'webhook', 'active', NULL, false, '[{"name":"zapier_webhook_url","type":"string","required":true,"label":"Webhook URL"}]')
ON CONFLICT (slug) DO NOTHING;
