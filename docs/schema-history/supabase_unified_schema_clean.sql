-- Schema Unificado OpenClaw + CRM Invent
-- Ejecutar en Supabase SQL Editor

-- Tabla clients
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  company TEXT,
  phone TEXT,
  status TEXT DEFAULT 'lead' CHECK (status IN ('active', 'inactive', 'lead')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  lifetime_value DECIMAL(10,2) DEFAULT 0,
  openclaw_session_id TEXT UNIQUE,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'openclaw', 'telegram', 'web', 'whatsapp', 'other')),
  last_interaction_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla openclaw_sessions
CREATE TABLE openclaw_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  session_id TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended', 'archived')),
  context JSONB DEFAULT '{}',
  message_count INTEGER DEFAULT 0,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_time TIMESTAMP WITH TIME ZONE,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  agent_id TEXT,
  channel TEXT DEFAULT 'web' CHECK (channel IN ('web', 'whatsapp', 'telegram', 'api')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla openclaw_messages
CREATE TABLE openclaw_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES openclaw_sessions(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  model TEXT,
  tokens_used INTEGER,
  latency_ms INTEGER,
  tool_calls JSONB,
  tool_results JSONB,
  context_snapshot JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla openclaw_contexts
CREATE TABLE openclaw_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES openclaw_sessions(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla openclaw_events
CREATE TABLE openclaw_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES openclaw_sessions(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla projects
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

-- Tabla conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  channel TEXT DEFAULT 'other' CHECK (channel IN ('telegram', 'email', 'whatsapp', 'openclaw', 'web', 'other')),
  sender_type TEXT DEFAULT 'client' CHECK (sender_type IN ('client', 'agent', 'system', 'bot')),
  telegram_message_id TEXT,
  telegram_chat_id TEXT,
  openclaw_session_id TEXT,
  openclaw_message_id UUID REFERENCES openclaw_messages(id),
  raw_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla tasks
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

-- Tabla deliverables
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

-- Tabla agents
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

-- Indices
CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_telegram ON clients(telegram_chat_id);
CREATE INDEX idx_clients_openclaw ON clients(openclaw_session_id);
CREATE INDEX idx_clients_source ON clients(source);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_created ON clients(created_at);

CREATE INDEX idx_openclaw_sessions_client ON openclaw_sessions(client_id);
CREATE INDEX idx_openclaw_sessions_session ON openclaw_sessions(session_id);
CREATE INDEX idx_openclaw_sessions_status ON openclaw_sessions(status);

CREATE INDEX idx_openclaw_messages_session ON openclaw_messages(session_id);
CREATE INDEX idx_openclaw_messages_client ON openclaw_messages(client_id);
CREATE INDEX idx_openclaw_messages_created ON openclaw_messages(created_at);

CREATE INDEX idx_openclaw_contexts_session ON openclaw_contexts(session_id);
CREATE INDEX idx_openclaw_contexts_key ON openclaw_contexts(key);

CREATE INDEX idx_openclaw_events_session ON openclaw_events(session_id);
CREATE INDEX idx_openclaw_events_type ON openclaw_events(event_type);
CREATE INDEX idx_openclaw_events_created ON openclaw_events(created_at);

CREATE INDEX idx_projects_client ON projects(client_id);
CREATE INDEX idx_projects_status ON projects(status);

CREATE INDEX idx_conversations_client ON conversations(client_id);
CREATE INDEX idx_conversations_channel ON conversations(channel);
CREATE INDEX idx_conversations_created ON conversations(created_at);
CREATE INDEX idx_conversations_openclaw ON conversations(openclaw_session_id);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_client ON tasks(client_id);
CREATE INDEX idx_tasks_status ON tasks(status);

CREATE INDEX idx_deliverables_project ON deliverables(project_id);
CREATE INDEX idx_deliverables_client ON deliverables(client_id);

-- Funciones
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_client_last_interaction()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE clients SET last_interaction_at = NEW.created_at WHERE id = NEW.client_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
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

CREATE TRIGGER update_client_on_openclaw_message
AFTER INSERT ON openclaw_messages
FOR EACH ROW EXECUTE FUNCTION update_client_last_interaction();

CREATE TRIGGER update_client_on_conversation
AFTER INSERT ON conversations
FOR EACH ROW EXECUTE FUNCTION update_client_last_interaction();

-- RLS
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

-- Datos de ejemplo
INSERT INTO agents (name, email, role, skills, is_active, openclaw_agent_id) VALUES
  ('Sebastian Admin', 'sebastian@inventagency.co', 'Admin', ARRAY['management', 'strategy', 'sales'], true, 'agent_admin'),
  ('AI Assistant', 'ai@inventagency.co', 'AI', ARRAY['automation', 'support', 'openclaw'], true, 'agent_ai'),
  ('Sales Bot', 'sales@inventagency.co', 'Sales', ARRAY['lead_generation', 'qualification'], true, 'agent_sales');

INSERT INTO clients (name, email, company, status, priority, source) VALUES
  ('Cliente Demo', 'demo@example.com', 'Empresa Demo', 'active', 'high', 'manual');
