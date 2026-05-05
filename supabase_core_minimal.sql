-- Schema Core Mínimo - Solo tablas esenciales
-- Ejecutar PRIMERO antes del Unified Inbox

-- 1. Tabla agents (primera - referenciada por contacts)
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

-- 2. Tabla contacts (referencia agents)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  type TEXT NOT NULL DEFAULT 'lead' CHECK (type IN ('lead', 'prospect', 'customer', 'partner', 'supplier', 'vendor', 'influencer', 'employee')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived', 'blocked')),
  organization_id UUID REFERENCES contacts(id),
  job_title TEXT,
  department TEXT,
  company_name TEXT,
  industry TEXT,
  company_size TEXT CHECK (company_size IN ('startup', 'small', 'medium', 'large', 'enterprise')),
  annual_revenue DECIMAL(12,2),
  website TEXT,
  linkedin_url TEXT,
  twitter_handle TEXT,
  facebook_url TEXT,
  instagram_url TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'Colombia',
  postal_code TEXT,
  timezone TEXT DEFAULT 'America/Bogota',
  language TEXT DEFAULT 'es',
  birth_date DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  
  -- Lead scoring
  lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  lead_source TEXT,
  lead_status TEXT DEFAULT 'new' CHECK (lead_status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  
  -- Engagement
  last_interaction_at TIMESTAMP WITH TIME ZONE,
  interaction_count INTEGER DEFAULT 0,
  
  -- Owner/Assigned
  assigned_to UUID REFERENCES agents(id),
  
  -- Tags y metadata
  tags TEXT[] DEFAULT '{}',
  source TEXT,
  custom_fields JSONB DEFAULT '{}',
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabla pipelines (antes de deals)
CREATE TABLE IF NOT EXISTS pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  currency TEXT DEFAULT 'USD',
  display_fields JSONB DEFAULT '["value", "contact", "expected_close", "probability"]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabla pipeline_stages (antes de deals)
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  order_index INTEGER NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  default_probability INTEGER DEFAULT 0 CHECK (default_probability >= 0 AND default_probability <= 100),
  auto_move_rules JSONB DEFAULT '[]',
  required_fields TEXT[] DEFAULT '{}',
  max_deals INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Tabla deals (referencia contacts, pipelines, pipeline_stages)
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  pipeline_id UUID REFERENCES pipelines(id),
  stage_id UUID REFERENCES pipeline_stages(id),
  stage_order INTEGER DEFAULT 0,
  value DECIMAL(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'COP', 'EUR', 'MXN', 'BRL')),
  probability INTEGER DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  actual_close_date DATE,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'paused')),
  lost_reason TEXT,
  won_reason TEXT,
  competitor TEXT,
  competitor_notes TEXT,
  owner_id UUID REFERENCES agents(id),
  team_members UUID[] DEFAULT '{}',
  line_items JSONB DEFAULT '[]',
  last_activity_at TIMESTAMP WITH TIME ZONE,
  last_activity_type TEXT,
  source TEXT,
  campaign_id TEXT,
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices básicos
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(type);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_deals_contact ON deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);

-- Datos mínimos de prueba
INSERT INTO agents (name, email, role) VALUES
('Admin User', 'admin@agencia.com', 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO pipelines (name, description, is_default, is_active) VALUES
('Ventas', 'Pipeline principal de ventas', true, true)
ON CONFLICT DO NOTHING;

-- Insertar etapas del pipeline
INSERT INTO pipeline_stages (pipeline_id, name, order_index, color, default_probability) 
SELECT id, 'Nuevo Lead', 0, '#64748B', 10
FROM pipelines WHERE name = 'Ventas'
ON CONFLICT DO NOTHING;

INSERT INTO pipeline_stages (pipeline_id, name, order_index, color, default_probability) 
SELECT id, 'Calificación', 1, '#F59E0B', 25
FROM pipelines WHERE name = 'Ventas'
ON CONFLICT DO NOTHING;

INSERT INTO pipeline_stages (pipeline_id, name, order_index, color, default_probability) 
SELECT id, 'Propuesta', 2, '#3B82F6', 50
FROM pipelines WHERE name = 'Ventas'
ON CONFLICT DO NOTHING;

INSERT INTO pipeline_stages (pipeline_id, name, order_index, color, default_probability) 
SELECT id, 'Negociación', 3, '#8B5CF6', 75
FROM pipelines WHERE name = 'Ventas'
ON CONFLICT DO NOTHING;

INSERT INTO pipeline_stages (pipeline_id, name, order_index, color, default_probability) 
SELECT id, 'Cerrado Ganado', 4, '#10B981', 100
FROM pipelines WHERE name = 'Ventas'
ON CONFLICT DO NOTHING;

INSERT INTO pipeline_stages (pipeline_id, name, order_index, color, default_probability) 
SELECT id, 'Cerrado Perdido', 5, '#EF4444', 0
FROM pipelines WHERE name = 'Ventas'
ON CONFLICT DO NOTHING;
