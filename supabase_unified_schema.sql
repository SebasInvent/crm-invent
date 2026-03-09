-- ============================================
-- OPENCLAW + CRM INVENT - SCHEMA UNIFICADO
-- Todas las tablas en Supabase
-- ============================================

-- ============================================
-- TABLAS CORE (Compartidas entre OpenClaw y CRM)
-- ============================================

-- Clientes (única tabla de clientes)
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  company TEXT,
  phone TEXT,
  
  -- Campos CRM
  status TEXT DEFAULT 'lead' CHECK (status IN ('active', 'inactive', 'lead')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  lifetime_value DECIMAL(10,2) DEFAULT 0,
  
  -- Campos OpenClaw
  openclaw_session_id TEXT UNIQUE,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  
  -- Metadata
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'openclaw', 'telegram', 'web', 'whatsapp', 'other')),
  last_interaction_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear índices para clients
CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_telegram ON clients(telegram_chat_id);
CREATE INDEX idx_clients_openclaw ON clients(openclaw_session_id);
CREATE INDEX idx_clients_source ON clients(source);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_created ON clients(created_at);

-- ============================================
-- TABLAS OPENCLAW
-- ============================================

-- Sesiones de OpenClaw
CREATE TABLE openclaw_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  session_id TEXT UNIQUE NOT NULL,
  
  -- Estado de la sesión
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended', 'archived')),
  
  -- Contexto de la conversación
  context JSONB DEFAULT '{}',
  
  -- Métricas
  message_count INTEGER DEFAULT 0,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_time TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Configuración
  agent_id TEXT,
  channel TEXT DEFAULT 'web' CHECK (channel IN ('web', 'whatsapp', 'telegram', 'api')),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_openclaw_sessions_client ON openclaw_sessions(client_id);
CREATE INDEX idx_openclaw_sessions_session ON openclaw_sessions(session_id);
CREATE INDEX idx_openclaw_sessions_status ON openclaw_sessions(status);

-- Mensajes de OpenClaw (conversaciones detalladas)
CREATE TABLE openclaw_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES openclaw_sessions(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Contenido del mensaje
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  
  -- Metadatos del mensaje
  model TEXT,
  tokens_used INTEGER,
  latency_ms INTEGER,
  
  -- Tool calls (si aplica)
  tool_calls JSONB,
  tool_results JSONB,
  
  -- Contexto y estado
  context_snapshot JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_openclaw_messages_session ON openclaw_messages(session_id);
CREATE INDEX idx_openclaw_messages_client ON openclaw_messages(client_id);
CREATE INDEX idx_openclaw_messages_created ON openclaw_messages(created_at);

-- Contextos de OpenClaw (memoria de conversación)
CREATE TABLE openclaw_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES openclaw_sessions(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Datos de contexto
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  
  -- TTL para expiración automática
  expires_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_openclaw_contexts_session ON openclaw_contexts(session_id);
CREATE INDEX idx_openclaw_contexts_key ON openclaw_contexts(key);

-- Eventos/Logs de OpenClaw
CREATE TABLE openclaw_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES openclaw_sessions(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL,
  event_data JSONB,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error')),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_openclaw_events_session ON openclaw_events(session_id);
CREATE INDEX idx_openclaw_events_type ON openclaw_events(event_type);
CREATE INDEX idx_openclaw_events_created ON openclaw_events(created_at);

-- ============================================
-- TABLAS CRM (existentes, actualizadas)
-- ============================================

-- Proyectos
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'planning' CHECK (status IN ('planning', 'in_progress', 'review', 'completed', 'cancelled')),
  budget DECIMAL(10,2),
  start_date DATE,
  end_date DATE,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_projects_client ON projects(client_id);
CREATE INDEX idx_projects_status ON projects(status);

-- Conversaciones CRM (unificadas con OpenClaw)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Mensaje simplificado para CRM
  message TEXT NOT NULL,
  channel TEXT DEFAULT 'other' CHECK (channel IN ('telegram', 'email', 'whatsapp', 'openclaw', 'web', 'other')),
  sender_type TEXT DEFAULT 'client' CHECK (sender_type IN ('client', 'agent', 'system', 'bot')),
  
  -- Referencias externas
  telegram_message_id TEXT,
  telegram_chat_id TEXT,
  openclaw_session_id TEXT,
  openclaw_message_id UUID REFERENCES openclaw_messages(id),
  
  -- Raw data para debugging
  raw_data JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_conversations_client ON conversations(client_id);
CREATE INDEX idx_conversations_channel ON conversations(channel);
CREATE INDEX idx_conversations_created ON conversations(created_at);
CREATE INDEX idx_conversations_openclaw ON conversations(openclaw_session_id);

-- Tareas
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date DATE,
  assigned_to UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_client ON tasks(client_id);
CREATE INDEX idx_tasks_status ON tasks(status);

-- Entregables
CREATE TABLE deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'review', 'approved', 'delivered')),
  due_date DATE,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_deliverables_project ON deliverables(project_id);
CREATE INDEX idx_deliverables_client ON deliverables(client_id);

-- Agentes
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT,
  skills TEXT[] DEFAULT '{}',
  avatar_url TEXT,
  hourly_rate DECIMAL(8,2),
  is_active BOOLEAN DEFAULT true,
  openclaw_agent_id TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- VISTAS (Para facilitar queries)
-- ============================================

-- Vista de clientes con resumen de actividad
CREATE VIEW client_activity_summary AS
SELECT 
  c.id,
  c.name,
  c.email,
  c.company,
  c.status,
  c.source,
  c.created_at,
  c.last_interaction_at,
  COUNT(DISTINCT p.id) as project_count,
  COUNT(DISTINCT conv.id) as conversation_count,
  COUNT(DISTINCT os.id) as openclaw_session_count,
  COALESCE(c.lifetime_value, 0) as lifetime_value
FROM clients c
LEFT JOIN projects p ON p.client_id = c.id
LEFT JOIN conversations conv ON conv.client_id = c.id
LEFT JOIN openclaw_sessions os ON os.client_id = c.id
GROUP BY c.id;

-- Vista de sesiones activas con cliente
CREATE VIEW active_sessions_with_clients AS
SELECT 
  os.*,
  c.name as client_name,
  c.email as client_email,
  c.company as client_company
FROM openclaw_sessions os
JOIN clients c ON c.id = os.client_id
WHERE os.status = 'active';

-- ============================================
-- FUNCIONES Y TRIGGERS
-- ============================================

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a todas las tablas
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deliverables_updated_at BEFORE UPDATE ON deliverables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_openclaw_sessions_updated_at BEFORE UPDATE ON openclaw_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_openclaw_contexts_updated_at BEFORE UPDATE ON openclaw_contexts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Cuando se crea un mensaje en OpenClaw, actualizar last_interaction_at del cliente
CREATE OR REPLACE FUNCTION update_client_last_interaction()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE clients 
  SET last_interaction_at = NEW.created_at
  WHERE id = NEW.client_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_client_on_openclaw_message
AFTER INSERT ON openclaw_messages
FOR EACH ROW EXECUTE FUNCTION update_client_last_interaction();

-- Trigger: Cuando se crea una conversación CRM, actualizar last_interaction_at
CREATE TRIGGER update_client_on_conversation
AFTER INSERT ON conversations
FOR EACH ROW EXECUTE FUNCTION update_client_last_interaction();

-- ============================================
-- POLÍTICAS RLS (Row Level Security)
-- ============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE openclaw_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE openclaw_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE openclaw_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE openclaw_events ENABLE ROW LEVEL SECURITY;

-- Política: Permitir todo (para desarrollo)
-- NOTA: En producción, reemplazar con políticas más restrictivas
CREATE POLICY allow_all_clients ON clients FOR ALL USING (true);
CREATE POLICY allow_all_projects ON projects FOR ALL USING (true);
CREATE POLICY allow_all_tasks ON tasks FOR ALL USING (true);
CREATE POLICY allow_all_deliverables ON deliverables FOR ALL USING (true);
CREATE POLICY allow_all_conversations ON conversations FOR ALL USING (true);
CREATE POLICY allow_all_agents ON agents FOR ALL USING (true);
CREATE POLICY allow_all_openclaw_sessions ON openclaw_sessions FOR ALL USING (true);
CREATE POLICY allow_all_openclaw_messages ON openclaw_messages FOR ALL USING (true);
CREATE POLICY allow_all_openclaw_contexts ON openclaw_contexts FOR ALL USING (true);
CREATE POLICY allow_all_openclaw_events ON openclaw_events FOR ALL USING (true);

-- ============================================
-- DATOS DE EJEMPLO
-- ============================================

-- Insertar agentes de ejemplo
INSERT INTO agents (name, email, role, skills, is_active, openclaw_agent_id) VALUES
  ('Sebastian Admin', 'sebastian@inventagency.co', 'Admin', ARRAY['management', 'strategy', 'sales'], true, 'agent_admin'),
  ('AI Assistant', 'ai@inventagency.co', 'AI', ARRAY['automation', 'support', 'openclaw'], true, 'agent_ai'),
  ('Sales Bot', 'sales@inventagency.co', 'Sales', ARRAY['lead_generation', 'qualification'], true, 'agent_sales');

-- Insertar cliente de ejemplo
INSERT INTO clients (name, email, company, status, priority, source) VALUES
  ('Cliente Demo', 'demo@example.com', 'Empresa Demo', 'active', 'high', 'manual');
