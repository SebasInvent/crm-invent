-- ============================================
-- CRM INVENT - ESQUEMA COMPLETO DE BASE DE DATOS
-- ============================================

-- Tabla de Clientes
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  status TEXT DEFAULT 'lead' CHECK (status IN ('active', 'inactive', 'lead')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  lifetime_value DECIMAL(10,2) DEFAULT 0,
  
  -- Campos de integración
  telegram_chat_id TEXT,
  telegram_username TEXT,
  openclaw_session_id TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'telegram', 'openclaw', 'web', 'other')),
  last_interaction_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Proyectos
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Entregables (Deliverables)
CREATE TABLE deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'review', 'approved', 'delivered')),
  due_date DATE,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Tareas
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Facturas
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL UNIQUE,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
  issue_date DATE NOT NULL,
  due_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Reuniones
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  meeting_link TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Conversaciones
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  channel TEXT DEFAULT 'other' CHECK (channel IN ('telegram', 'email', 'whatsapp', 'other')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Campos de integración
  telegram_message_id TEXT,
  telegram_chat_id TEXT,
  openclaw_session_id TEXT,
  sender_type TEXT DEFAULT 'client' CHECK (sender_type IN ('client', 'agent', 'system', 'bot')),
  raw_data JSONB
);

-- Tabla de Email Logs
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('sent', 'failed', 'pending')),
  sent_at TIMESTAMP WITH TIME ZONE,
  from_email TEXT,
  template_id TEXT,
  openclaw_message_id TEXT
);

-- Tabla de Agentes
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT,
  skills TEXT[] DEFAULT '{}',
  avatar_url TEXT,
  hourly_rate DECIMAL(8,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Tareas de Agentes
CREATE TABLE agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES agents(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'blocked')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  notes TEXT,
  deliverable_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Entregables de Agentes
CREATE TABLE agent_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_task_id UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT,
  file_path TEXT,
  file_type TEXT,
  file_size INTEGER,
  generated_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES agents(id),
  review_notes TEXT,
  approved_for_send BOOLEAN DEFAULT false,
  approved_at TIMESTAMP WITH TIME ZONE,
  sent_to_client BOOLEAN DEFAULT false,
  sent_at TIMESTAMP WITH TIME ZONE,
  email_log_id UUID REFERENCES email_logs(id),
  client_feedback TEXT,
  client_rating INTEGER CHECK (client_rating >= 1 AND client_rating <= 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Sesiones de Chat (NUEVA)
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id),
  session_type TEXT NOT NULL CHECK (session_type IN ('telegram', 'whatsapp', 'webchat', 'email', 'other')),
  external_session_id TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'archived')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  last_message_at TIMESTAMP WITH TIME ZONE,
  message_count INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ÍNDICES
-- ============================================

-- Índices para clientes
CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_telegram ON clients(telegram_chat_id);
CREATE INDEX idx_clients_openclaw ON clients(openclaw_session_id);
CREATE INDEX idx_clients_source ON clients(source);
CREATE INDEX idx_clients_created ON clients(created_at);

-- Índices para proyectos
CREATE INDEX idx_projects_client ON projects(client_id);
CREATE INDEX idx_projects_status ON projects(status);

-- Índices para conversaciones
CREATE INDEX idx_conversations_client ON conversations(client_id);
CREATE INDEX idx_conversations_channel ON conversations(channel);
CREATE INDEX idx_conversations_created ON conversations(created_at);
CREATE INDEX idx_conversations_session ON conversations(openclaw_session_id);

-- Índices para sesiones de chat
CREATE INDEX idx_chat_sessions_client ON chat_sessions(client_id);
CREATE INDEX idx_chat_sessions_external ON chat_sessions(external_session_id);
CREATE INDEX idx_chat_sessions_status ON chat_sessions(status);

-- Índices para tareas
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status);

-- ============================================
-- POLÍTICAS RLS (Row Level Security)
-- ============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- Política: Permitir todo (para desarrollo)
CREATE POLICY allow_all_clients ON clients FOR ALL USING (true);
CREATE POLICY allow_all_projects ON projects FOR ALL USING (true);
CREATE POLICY allow_all_deliverables ON deliverables FOR ALL USING (true);
CREATE POLICY allow_all_tasks ON tasks FOR ALL USING (true);
CREATE POLICY allow_all_invoices ON invoices FOR ALL USING (true);
CREATE POLICY allow_all_meetings ON meetings FOR ALL USING (true);
CREATE POLICY allow_all_conversations ON conversations FOR ALL USING (true);
CREATE POLICY allow_all_email_logs ON email_logs FOR ALL USING (true);
CREATE POLICY allow_all_agents ON agents FOR ALL USING (true);
CREATE POLICY allow_all_agent_tasks ON agent_tasks FOR ALL USING (true);
CREATE POLICY allow_all_agent_deliverables ON agent_deliverables FOR ALL USING (true);
CREATE POLICY allow_all_chat_sessions ON chat_sessions FOR ALL USING (true);

-- ============================================
-- DATOS DE EJEMPLO (Opcional)
-- ============================================

-- Insertar algunos agentes de ejemplo
INSERT INTO agents (name, email, role, skills, is_active) VALUES
  ('Sebastian Admin', 'sebastian@inventagency.co', 'Admin', ARRAY['management', 'strategy'], true),
  ('AI Assistant', 'ai@inventagency.co', 'AI', ARRAY['automation', 'support'], true);

-- Insertar un cliente de ejemplo
INSERT INTO clients (name, email, company, status, priority, source) VALUES
  ('Cliente Demo', 'demo@example.com', 'Empresa Demo', 'active', 'high', 'manual');
