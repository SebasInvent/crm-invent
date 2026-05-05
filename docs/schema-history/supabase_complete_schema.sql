-- CRM Schema Completo - Core + Unified Inbox
-- Ejecutar TODO este archivo de una vez

-- ============================================
-- 1. AGENTS (referenciado por contacts y inbox)
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
-- 2. CONTACTS (referenciado por inbox)
-- ============================================
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
  lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  lead_source TEXT,
  lead_status TEXT DEFAULT 'new' CHECK (lead_status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  last_interaction_at TIMESTAMP WITH TIME ZONE,
  interaction_count INTEGER DEFAULT 0,
  assigned_to UUID REFERENCES agents(id),
  tags TEXT[] DEFAULT '{}',
  source TEXT,
  custom_fields JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 3. PIPELINES Y STAGES
-- ============================================
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

-- ============================================
-- 4. DEALS
-- ============================================
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

-- ============================================
-- 5. CHANNELS (Unified Inbox)
-- ============================================
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'email', 'whatsapp', 'telegram', 'instagram', 'facebook', 
    'webchat', 'sms', 'phone', 'linkedin', 'twitter', 'other'
  )),
  config JSONB DEFAULT '{}',
  credentials_encrypted TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error', 'pending_setup')),
  last_error TEXT,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  webhook_url TEXT,
  webhook_secret TEXT,
  business_hours JSONB DEFAULT '{"monday":{"start":"09:00","end":"18:00"},"tuesday":{"start":"09:00","end":"18:00"},"wednesday":{"start":"09:00","end":"18:00"},"thursday":{"start":"09:00","end":"18:00"},"friday":{"start":"09:00","end":"18:00"},"saturday":null,"sunday":null}',
  timezone TEXT DEFAULT 'America/Bogota',
  auto_reply_enabled BOOLEAN DEFAULT false,
  auto_reply_message TEXT,
  auto_reply_outside_hours BOOLEAN DEFAULT false,
  created_by UUID REFERENCES agents(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 6. UNIFIED MESSAGES
-- ============================================
CREATE TABLE IF NOT EXISTS unified_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id),
  channel_type TEXT NOT NULL,
  conversation_id UUID,
  thread_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  contact_id UUID REFERENCES contacts(id),
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  external_message_id TEXT,
  external_sender_id TEXT,
  external_sender_name TEXT,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'template', 'interactive')),
  content TEXT NOT NULL,
  content_html TEXT,
  media_urls TEXT[],
  media_captions TEXT[],
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'received' CHECK (status IN ('received', 'delivered', 'read', 'sent', 'failed', 'pending', 'archived', 'spam', 'flagged')),
  assigned_to UUID REFERENCES agents(id),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  tags TEXT[] DEFAULT '{}',
  reply_to_message_id UUID REFERENCES unified_messages(id),
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 7. CONVERSATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id),
  channel_id UUID REFERENCES channels(id),
  thread_id TEXT,
  subject TEXT,
  summary TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'spam', 'closed')),
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_message_preview TEXT,
  last_message_direction TEXT,
  message_count INTEGER DEFAULT 0,
  unread_count INTEGER DEFAULT 0,
  assigned_to UUID REFERENCES agents(id),
  tags TEXT[] DEFAULT '{}',
  source_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 8. MESSAGE TEMPLATES
-- ============================================
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  channel_types TEXT[] DEFAULT '{}',
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'greeting', 'follow_up', 'closing', 'support', 'sales', 'marketing')),
  subject TEXT,
  content TEXT NOT NULL,
  content_html TEXT,
  variables JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
  requires_approval BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES agents(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 9. AUTOMATION RULES
-- ============================================
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  conditions JSONB NOT NULL,
  actions JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  trigger_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES agents(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- DATOS INICIALES
-- ============================================

-- Agente por defecto
INSERT INTO agents (name, email, role) VALUES
('Admin User', 'admin@agencia.com', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Pipeline por defecto
INSERT INTO pipelines (name, description, is_default, is_active) VALUES
('Ventas', 'Pipeline principal de ventas', true, true);

-- Etapas del pipeline
INSERT INTO pipeline_stages (pipeline_id, name, order_index, color, default_probability) 
SELECT id, 'Nuevo Lead', 0, '#64748B', 10 FROM pipelines WHERE name = 'Ventas';

INSERT INTO pipeline_stages (pipeline_id, name, order_index, color, default_probability) 
SELECT id, 'Calificación', 1, '#F59E0B', 25 FROM pipelines WHERE name = 'Ventas';

INSERT INTO pipeline_stages (pipeline_id, name, order_index, color, default_probability) 
SELECT id, 'Propuesta', 2, '#3B82F6', 50 FROM pipelines WHERE name = 'Ventas';

INSERT INTO pipeline_stages (pipeline_id, name, order_index, color, default_probability) 
SELECT id, 'Negociación', 3, '#8B5CF6', 75 FROM pipelines WHERE name = 'Ventas';

INSERT INTO pipeline_stages (pipeline_id, name, order_index, color, default_probability) 
SELECT id, 'Cerrado Ganado', 4, '#10B981', 100 FROM pipelines WHERE name = 'Ventas';

INSERT INTO pipeline_stages (pipeline_id, name, order_index, color, default_probability) 
SELECT id, 'Cerrado Perdido', 5, '#EF4444', 0 FROM pipelines WHERE name = 'Ventas';

-- Canales de ejemplo
INSERT INTO channels (name, type, status, auto_reply_enabled, auto_reply_message) VALUES
('Email General', 'email', 'pending_setup', false, NULL),
('WhatsApp Business', 'whatsapp', 'pending_setup', true, '¡Gracias por contactarnos! Un agente te responderá pronto. 🚀'),
('Telegram Bot', 'telegram', 'active', true, 'Hola! Soy el asistente de Agencia Invent. ¿En qué puedo ayudarte?'),
('WebChat OpenClaw', 'webchat', 'active', false, NULL),
('Instagram DM', 'instagram', 'pending_setup', false, NULL);

-- Plantillas de ejemplo
INSERT INTO message_templates (name, description, channel_types, category, content, variables, is_active) VALUES
('Saludo Inicial', 'Mensaje de bienvenida', ARRAY['whatsapp', 'telegram', 'webchat'], 'greeting', '¡Hola {{first_name}}! 👋 Gracias por contactar a Agencia Invent. ¿En qué puedo ayudarte?', '[{"name": "first_name", "type": "string", "required": false}]'::jsonb, true),
('Seguimiento', 'Post-reunión', ARRAY['email', 'whatsapp'], 'follow_up', 'Hola {{first_name}}, fue un placer conversar contigo.', '[{"name": "first_name"}]'::jsonb, true);
