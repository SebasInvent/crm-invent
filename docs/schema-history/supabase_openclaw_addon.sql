-- Schema OpenClaw - Solo tablas nuevas (clients ya existe)
-- Ejecutar en Supabase SQL Editor

-- Tablas OpenClaw (nuevas)
CREATE TABLE IF NOT EXISTS openclaw_sessions (
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

CREATE TABLE IF NOT EXISTS openclaw_messages (
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

CREATE TABLE IF NOT EXISTS openclaw_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES openclaw_sessions(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS openclaw_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES openclaw_sessions(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Modificar tabla clients existente para agregar campo openclaw_session_id si no existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'openclaw_session_id') THEN
    ALTER TABLE clients ADD COLUMN openclaw_session_id TEXT UNIQUE;
  END IF;
END $$;

-- Modificar tabla conversations para agregar campos de OpenClaw si no existen
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'openclaw_session_id') THEN
    ALTER TABLE conversations ADD COLUMN openclaw_session_id TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'openclaw_message_id') THEN
    ALTER TABLE conversations ADD COLUMN openclaw_message_id UUID;
  END IF;
END $$;

-- Modificar tabla agents para agregar campo openclaw_agent_id si no existe
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'openclaw_agent_id') THEN
    ALTER TABLE agents ADD COLUMN openclaw_agent_id TEXT UNIQUE;
  END IF;
END $$;

-- Indices
CREATE INDEX IF NOT EXISTS idx_openclaw_sessions_client ON openclaw_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_openclaw_sessions_session ON openclaw_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_openclaw_sessions_status ON openclaw_sessions(status);

CREATE INDEX IF NOT EXISTS idx_openclaw_messages_session ON openclaw_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_openclaw_messages_client ON openclaw_messages(client_id);
CREATE INDEX IF NOT EXISTS idx_openclaw_messages_created ON openclaw_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_openclaw_contexts_session ON openclaw_contexts(session_id);
CREATE INDEX IF NOT EXISTS idx_openclaw_contexts_key ON openclaw_contexts(key);

CREATE INDEX IF NOT EXISTS idx_openclaw_events_session ON openclaw_events(session_id);
CREATE INDEX IF NOT EXISTS idx_openclaw_events_type ON openclaw_events(event_type);
CREATE INDEX IF NOT EXISTS idx_openclaw_events_created ON openclaw_events(created_at);

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

-- Triggers para tablas nuevas
DROP TRIGGER IF EXISTS update_openclaw_sessions_updated_at ON openclaw_sessions;
CREATE TRIGGER update_openclaw_sessions_updated_at BEFORE UPDATE ON openclaw_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_openclaw_contexts_updated_at ON openclaw_contexts;
CREATE TRIGGER update_openclaw_contexts_updated_at BEFORE UPDATE ON openclaw_contexts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_on_openclaw_message ON openclaw_messages;
CREATE TRIGGER update_client_on_openclaw_message
AFTER INSERT ON openclaw_messages
FOR EACH ROW EXECUTE FUNCTION update_client_last_interaction();

-- RLS para tablas nuevas
ALTER TABLE openclaw_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE openclaw_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE openclaw_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE openclaw_events ENABLE ROW LEVEL SECURITY;

-- Eliminar policies si existen y recrear
DROP POLICY IF EXISTS allow_all_openclaw_sessions ON openclaw_sessions;
DROP POLICY IF EXISTS allow_all_openclaw_messages ON openclaw_messages;
DROP POLICY IF EXISTS allow_all_openclaw_contexts ON openclaw_contexts;
DROP POLICY IF EXISTS allow_all_openclaw_events ON openclaw_events;

CREATE POLICY allow_all_openclaw_sessions ON openclaw_sessions FOR ALL USING (true);
CREATE POLICY allow_all_openclaw_messages ON openclaw_messages FOR ALL USING (true);
CREATE POLICY allow_all_openclaw_contexts ON openclaw_contexts FOR ALL USING (true);
CREATE POLICY allow_all_openclaw_events ON openclaw_events FOR ALL USING (true);

-- Agregar agentes de OpenClaw si no existen
INSERT INTO agents (name, email, role, skills, is_active, openclaw_agent_id) 
SELECT 'AI Assistant', 'ai@inventagency.co', 'AI', ARRAY['automation', 'support', 'openclaw'], true, 'agent_ai'
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE email = 'ai@inventagency.co');

INSERT INTO agents (name, email, role, skills, is_active, openclaw_agent_id) 
SELECT 'Sales Bot', 'sales@inventagency.co', 'Sales', ARRAY['lead_generation', 'qualification'], true, 'agent_sales'
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE email = 'sales@inventagency.co');
