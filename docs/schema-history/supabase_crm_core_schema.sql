-- CRM Integral Profesional - Schema Core Mejorado
-- Fase 2: Contactos 360° + Pipeline de Ventas

-- ============================================
-- AGENTS/USUARIOS (Crear primero - referenciado por contacts)
-- ============================================

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  role TEXT DEFAULT 'agent' CHECK (role IN ('admin', 'manager', 'agent', 'viewer')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'away')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CONTACTOS 360° (Unificación de clientes, leads, partners, suppliers)
-- ============================================

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Información básica
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  
  -- Tipo de contacto
  type TEXT NOT NULL DEFAULT 'lead' CHECK (type IN ('lead', 'prospect', 'customer', 'partner', 'supplier', 'vendor', 'influencer', 'employee')),
  
  -- Estado del contacto
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived', 'blocked')),
  
  -- Jerarquía: Empresa/Organización
  organization_id UUID REFERENCES contacts(id),
  job_title TEXT,
  department TEXT,
  
  -- Información de la organización (si es tipo=organization)
  company_name TEXT,
  industry TEXT,
  company_size TEXT CHECK (company_size IN ('startup', 'small', 'medium', 'large', 'enterprise')),
  annual_revenue DECIMAL(12,2),
  website TEXT,
  linkedin_url TEXT,
  
  -- Ubicación
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  zip_code TEXT,
  timezone TEXT DEFAULT 'America/Bogota',
  
  -- Scoring y priorización
  lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  
  -- Arquetipo Jung (metodología existente)
  jung_archetype TEXT CHECK (jung_archetype IN (
    'hero_entrepreneur', 'sage_conservative', 'caregiver_stressed', 
    'artist_specialist', 'ruler_executive', 'explorer_merchant'
  )),
  
  -- Campos para integración con canales
  telegram_chat_id TEXT,
  telegram_username TEXT,
  whatsapp_number TEXT,
  openclaw_session_id TEXT,
  
  -- Origen/Atribución
  source TEXT DEFAULT 'manual' CHECK (source IN (
    'manual', 'telegram', 'openclaw', 'whatsapp', 'web_form', 
    'referral', 'linkedin', 'scraped', 'event', 'cold_outreach', 'other'
  )),
  source_details JSONB,
  
  -- Owner/Responsable
  assigned_to UUID REFERENCES agents(id),
  
  -- Metadata y tags
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  notes TEXT,
  
  -- Fechas importantes
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_interaction_at TIMESTAMP WITH TIME ZONE,
  last_contact_date TIMESTAMP WITH TIME ZONE,
  next_follow_up_date TIMESTAMP WITH TIME ZONE,
  
  -- GDPR/Consentimiento
  consent_status TEXT DEFAULT 'pending' CHECK (consent_status IN ('granted', 'pending', 'denied')),
  consent_date TIMESTAMP WITH TIME ZONE,
  
  -- Lifetime value
  lifetime_value DECIMAL(10,2) DEFAULT 0,
  total_deals_won INTEGER DEFAULT 0,
  total_deals_value DECIMAL(10,2) DEFAULT 0
);

-- Índices para contacts
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(type);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned ON contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_contacts_lead_score ON contacts(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_organization ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_created ON contacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(source);

-- Vista de contactos con info de organización
CREATE OR REPLACE VIEW contacts_with_organization AS
SELECT 
  c.*,
  org.company_name as organization_name,
  org.industry as organization_industry,
  a.name as assigned_to_name,
  a.email as assigned_to_email
FROM contacts c
LEFT JOIN contacts org ON org.id = c.organization_id
LEFT JOIN agents a ON a.id = c.assigned_to;

-- ============================================
-- PIPELINES Y ETAPAS (CREAR PRIMERO - Referencias FK)
-- ============================================

CREATE TABLE IF NOT EXISTS pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Configuración
  currency TEXT DEFAULT 'USD',
  display_fields JSONB DEFAULT '["value", "contact", "expected_close", "probability"]',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  
  -- Probabilidad por defecto para esta etapa
  default_probability INTEGER DEFAULT 0 CHECK (default_probability >= 0 AND default_probability <= 100),
  
  -- Configuración de automatización
  auto_move_rules JSONB DEFAULT '[]',
  required_fields TEXT[] DEFAULT '{}',
  
  -- Límites (WIP limits)
  max_deals INTEGER,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- DEALS/OPORTUNIDADES (Pipeline de Ventas)
-- ============================================

CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relación con contacto
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Información del deal
  name TEXT NOT NULL,
  description TEXT,
  
  -- Pipeline y etapa
  pipeline_id UUID REFERENCES pipelines(id),
  stage_id UUID REFERENCES pipeline_stages(id),
  stage_order INTEGER DEFAULT 0,
  
  -- Valor y probabilidad
  value DECIMAL(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'COP', 'EUR', 'MXN', 'BRL')),
  probability INTEGER DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  actual_close_date DATE,
  
  -- Estado del deal
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'paused')),
  lost_reason TEXT,
  won_reason TEXT,
  
  -- Competencia
  competitor TEXT,
  competitor_notes TEXT,
  
  -- Owner/Equipo
  owner_id UUID REFERENCES agents(id),
  team_members UUID[] DEFAULT '{}',
  
  -- Productos/Servicios incluidos
  line_items JSONB DEFAULT '[]',
  
  -- Actividad
  last_activity_at TIMESTAMP WITH TIME ZONE,
  last_activity_type TEXT,
  
  -- Metadata
  source TEXT,
  campaign_id TEXT,
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deals_contact ON deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_expected_close ON deals(expected_close_date);
CREATE INDEX IF NOT EXISTS idx_deals_value ON deals(value DESC);

-- Vista de deals con toda la info
CREATE OR REPLACE VIEW deals_full AS
SELECT 
  d.*,
  c.first_name as contact_first_name,
  c.last_name as contact_last_name,
  c.email as contact_email,
  c.company_name as contact_company,
  c.phone as contact_phone,
  ps.name as stage_name,
  ps.color as stage_color,
  ps.order_index as pipeline_stage_order,
  p.name as pipeline_name,
  a.name as owner_name,
  (d.value * d.probability / 100) as weighted_value
FROM deals d
JOIN contacts c ON c.id = d.contact_id
LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
LEFT JOIN pipelines p ON p.id = d.pipeline_id
LEFT JOIN agents a ON a.id = d.owner_id;

-- ============================================
-- TIMELINE DE ACTIVIDAD (Contact History)
-- ============================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Entidad relacionada
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Tipo de actividad
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'note', 'email', 'call', 'meeting', 'task_completed', 
    'stage_change', 'deal_created', 'deal_won', 'deal_lost',
    'web_visit', 'document_viewed', 'proposal_sent',
    'conversation', 'telegram_message', 'whatsapp_message'
  )),
  
  -- Contenido
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  performed_by UUID REFERENCES agents(id),
  
  -- Fechas
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  activity_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_contact ON activity_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_activity_deal ON activity_logs(deal_id);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);

-- ============================================
-- TRIGGERS Y FUNCIONES
-- ============================================

-- Actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
CREATE TRIGGER update_contacts_updated_at 
BEFORE UPDATE ON contacts 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_deals_updated_at ON deals;
CREATE TRIGGER update_deals_updated_at 
BEFORE UPDATE ON deals 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pipelines_updated_at ON pipelines;
CREATE TRIGGER update_pipelines_updated_at 
BEFORE UPDATE ON pipelines 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Cuando un deal se gana, actualizar métricas del contacto
CREATE OR REPLACE FUNCTION update_contact_on_deal_won()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'won' AND OLD.status != 'won' THEN
    UPDATE contacts 
    SET 
      total_deals_won = total_deals_won + 1,
      total_deals_value = total_deals_value + NEW.value,
      lifetime_value = lifetime_value + NEW.value,
      type = CASE WHEN type = 'lead' OR type = 'prospect' THEN 'customer' ELSE type END
    WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_contact_on_deal_won ON deals;
CREATE TRIGGER trigger_update_contact_on_deal_won
AFTER UPDATE OF status ON deals
FOR EACH ROW EXECUTE FUNCTION update_contact_on_deal_won();

-- Trigger: Log de cambios de etapa en deals
CREATE OR REPLACE FUNCTION log_deal_stage_change()
RETURNS TRIGGER AS $$
DECLARE
  old_stage_name TEXT;
  new_stage_name TEXT;
BEGIN
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    SELECT name INTO old_stage_name FROM pipeline_stages WHERE id = OLD.stage_id;
    SELECT name INTO new_stage_name FROM pipeline_stages WHERE id = NEW.stage_id;
    
    INSERT INTO activity_logs (contact_id, deal_id, activity_type, title, description, performed_by, created_at)
    VALUES (
      NEW.contact_id, 
      NEW.id, 
      'stage_change',
      'Deal movido de etapa',
      COALESCE(old_stage_name, 'Sin etapa') || ' → ' || COALESCE(new_stage_name, 'Sin etapa'),
      NEW.owner_id,
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_deal_stage_change ON deals;
CREATE TRIGGER trigger_log_deal_stage_change
AFTER UPDATE OF stage_id ON deals
FOR EACH ROW EXECUTE FUNCTION log_deal_stage_change();

-- ============================================
-- RLS (Row Level Security)
-- ============================================

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Políticas básicas (para desarrollo)
DROP POLICY IF EXISTS allow_all_contacts ON contacts;
CREATE POLICY allow_all_contacts ON contacts FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_deals ON deals;
CREATE POLICY allow_all_deals ON deals FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_pipelines ON pipelines;
CREATE POLICY allow_all_pipelines ON pipelines FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_pipeline_stages ON pipeline_stages;
CREATE POLICY allow_all_pipeline_stages ON pipeline_stages FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_activity_logs ON activity_logs;
CREATE POLICY allow_all_activity_logs ON activity_logs FOR ALL USING (true);

-- ============================================
-- DATOS INICIALES
-- ============================================

-- Pipeline por defecto: Ventas
INSERT INTO pipelines (name, description, is_default, currency) 
VALUES ('Pipeline de Ventas', 'Proceso estándar de ventas para la agencia', true, 'USD')
ON CONFLICT DO NOTHING;

-- Etapas del pipeline de ventas
WITH default_pipeline AS (SELECT id FROM pipelines WHERE is_default = true LIMIT 1)
INSERT INTO pipeline_stages (pipeline_id, name, description, order_index, color, default_probability)
SELECT 
  dp.id, 
  stage.name, 
  stage.description, 
  stage.order_index, 
  stage.color, 
  stage.default_probability
FROM default_pipeline dp
CROSS JOIN (VALUES 
  ('Nuevo Lead', 'Contactos recién llegados', 0, '#64748B', 10),
  ('Calificación', 'Evaluando fit y necesidades', 1, '#3B82F6', 25),
  ('Propuesta', 'Propuesta enviada', 2, '#F59E0B', 50),
  ('Negociación', 'Discutiendo términos', 3, '#8B5CF6', 75),
  ('Cerrado Ganado', 'Deal ganado', 4, '#10B981', 100),
  ('Cerrado Perdido', 'Deal perdido', 5, '#EF4444', 0)
) AS stage(name, description, order_index, color, default_probability)
WHERE NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE pipeline_id = dp.id);

-- Contactos de ejemplo (migrando los existentes)
INSERT INTO contacts (first_name, last_name, email, company_name, type, status, source, lead_score)
SELECT 
  name,
  NULL,
  email,
  company,
  CASE status 
    WHEN 'lead' THEN 'lead'::text
    WHEN 'active' THEN 'customer'::text 
    ELSE 'prospect'::text 
  END,
  'active',
  COALESCE(source, 'manual'),
  CASE priority
    WHEN 'high' THEN 80
    WHEN 'medium' THEN 50
    ELSE 30
  END
FROM clients
WHERE NOT EXISTS (SELECT 1 FROM contacts WHERE email = clients.email);

-- Crear deals de ejemplo para contactos existentes
WITH sample_contacts AS (
  SELECT id, first_name FROM contacts WHERE type IN ('lead', 'prospect') LIMIT 3
),
first_stage AS (
  SELECT id FROM pipeline_stages WHERE order_index = 0 LIMIT 1
)
INSERT INTO deals (contact_id, name, value, stage_id, status, expected_close_date)
SELECT 
  sc.id,
  'Proyecto ' || sc.first_name,
  (random() * 5000 + 1000)::integer,
  fs.id,
  'open',
  NOW() + INTERVAL '30 days'
FROM sample_contacts sc
CROSS JOIN first_stage fs
WHERE NOT EXISTS (SELECT 1 FROM deals WHERE contact_id = sc.id);
