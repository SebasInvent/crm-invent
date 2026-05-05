-- CRM Fase 3: Hub de Comunicaciones - Unified Inbox Schema
-- Bandeja de entrada unificada para todos los canales

-- ============================================
-- CANALES DE COMUNICACIÓN (Channels)
-- ============================================

CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Información básica
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'email', 'whatsapp', 'telegram', 'instagram', 'facebook', 
    'webchat', 'sms', 'phone', 'linkedin', 'twitter', 'other'
  )),
  
  -- Configuración de conexión (encriptada o en JSON seguro)
  config JSONB DEFAULT '{}',
  
  -- Credenciales (almacenadas de forma segura)
  credentials_encrypted TEXT,
  
  -- Estado
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error', 'pending_setup')),
  last_error TEXT,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  
  -- Webhook URL para recibir mensajes
  webhook_url TEXT,
  webhook_secret TEXT,
  
  -- Configuración de horario
  business_hours JSONB DEFAULT '{"monday":{"start":"09:00","end":"18:00"},"tuesday":{"start":"09:00","end":"18:00"},"wednesday":{"start":"09:00","end":"18:00"},"thursday":{"start":"09:00","end":"18:00"},"friday":{"start":"09:00","end":"18:00"},"saturday":null,"sunday":null}',
  timezone TEXT DEFAULT 'America/Bogota',
  
  -- Auto-respuestas
  auto_reply_enabled BOOLEAN DEFAULT false,
  auto_reply_message TEXT,
  auto_reply_outside_hours BOOLEAN DEFAULT false,
  
  -- Metadata
  created_by UUID REFERENCES agents(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);
CREATE INDEX IF NOT EXISTS idx_channels_status ON channels(status);

-- ============================================
-- MENSAJES UNIFICADOS (Unified Inbox)
-- ============================================

CREATE TABLE IF NOT EXISTS unified_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Canal de origen
  channel_id UUID REFERENCES channels(id),
  channel_type TEXT NOT NULL,
  
  -- Conversación/thread
  conversation_id UUID,
  thread_id TEXT, -- ID externo del thread (ej: chat_id de Telegram)
  
  -- Remitente (interno o externo)
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  
  -- Contacto relacionado
  contact_id UUID REFERENCES contacts(id),
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  
  -- IDs externos
  external_message_id TEXT, -- ID del mensaje en el canal externo
  external_sender_id TEXT,  -- ID del remitente en el canal externo
  external_sender_name TEXT,
  
  -- Contenido del mensaje
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'template', 'interactive')),
  content TEXT NOT NULL,
  content_html TEXT, -- Versión HTML si aplica
  
  -- Media adjunta
  media_urls TEXT[],
  media_captions TEXT[],
  
  -- Metadata adicional
  metadata JSONB DEFAULT '{}',
  
  -- Estado del mensaje
  status TEXT DEFAULT 'received' CHECK (status IN (
    'received', 'delivered', 'read', 'sent', 'failed', 
    'pending', 'archived', 'spam', 'flagged'
  )),
  
  -- Asignación y seguimiento
  assigned_to UUID REFERENCES agents(id),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  tags TEXT[] DEFAULT '{}',
  
  -- Respuesta relacionada (para threads)
  reply_to_message_id UUID REFERENCES unified_messages(id),
  
  -- Timestamps
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para unified_messages
CREATE INDEX IF NOT EXISTS idx_unified_messages_channel ON unified_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_unified_messages_contact ON unified_messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_unified_messages_conversation ON unified_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_unified_messages_direction ON unified_messages(direction);
CREATE INDEX IF NOT EXISTS idx_unified_messages_status ON unified_messages(status);
CREATE INDEX IF NOT EXISTS idx_unified_messages_assigned ON unified_messages(assigned_to);
CREATE INDEX IF NOT EXISTS idx_unified_messages_created ON unified_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unified_messages_thread ON unified_messages(thread_id);

-- Full text search
CREATE INDEX IF NOT EXISTS idx_unified_messages_search ON unified_messages USING gin(to_tsvector('spanish', content));

-- ============================================
-- CONVERSACIONES (Threads)
-- ============================================

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Participantes
  contact_id UUID REFERENCES contacts(id),
  channel_id UUID REFERENCES channels(id),
  thread_id TEXT, -- ID externo
  
  -- Título y contexto
  subject TEXT,
  summary TEXT,
  
  -- Estado
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'spam', 'closed')),
  
  -- Última actividad
  last_message_at TIMESTAMP WITH TIME ZONE,
  last_message_preview TEXT,
  last_message_direction TEXT,
  
  -- Contadores
  message_count INTEGER DEFAULT 0,
  unread_count INTEGER DEFAULT 0,
  
  -- Asignación
  assigned_to UUID REFERENCES agents(id),
  
  -- Tags y metadata
  tags TEXT[] DEFAULT '{}',
  source_url TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);

-- ============================================
-- PLANTILLAS DE MENSAJES
-- ============================================

CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Canal y uso
  channel_types TEXT[] DEFAULT '{}', -- ['whatsapp', 'telegram', 'email']
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'greeting', 'follow_up', 'closing', 'support', 'sales', 'marketing')),
  
  -- Contenido
  subject TEXT, -- Para email
  content TEXT NOT NULL,
  content_html TEXT, -- Para email con formato
  
  -- Variables dinámicas
  variables JSONB DEFAULT '[]', -- [{"name": "first_name", "type": "string", "required": true}]
  
  -- Opciones
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false, -- No se puede borrar
  requires_approval BOOLEAN DEFAULT false,
  
  -- Metadata
  usage_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES agents(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_templates_category ON message_templates(category);
CREATE INDEX IF NOT EXISTS idx_message_templates_active ON message_templates(is_active);

-- ============================================
-- CONFIGURACIÓN DE AUTOMATIZACIONES
-- ============================================

CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Condiciones (JSON para flexibilidad)
  conditions JSONB NOT NULL, -- {"channel_type": "whatsapp", "keywords": ["presupuesto", "precio"], "contact_tags": ["lead"]}
  
  -- Acciones
  actions JSONB NOT NULL, -- [{"type": "assign_agent", "agent_id": "..."}, {"type": "send_template", "template_id": "..."}]
  
  -- Estado
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  
  -- Contadores
  trigger_count INTEGER DEFAULT 0,
  
  created_by UUID REFERENCES agents(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista de inbox unificado con info del contacto
CREATE OR REPLACE VIEW inbox_view AS
SELECT 
  m.*,
  c.first_name as contact_first_name,
  c.last_name as contact_last_name,
  c.email as contact_email,
  c.phone as contact_phone,
  c.company_name as contact_company,
  c.type as contact_type,
  ch.name as channel_name,
  ch.type as channel_type,
  a.name as assigned_to_name,
  a.email as assigned_to_email
FROM unified_messages m
LEFT JOIN contacts c ON c.id = m.contact_id
LEFT JOIN channels ch ON ch.id = m.channel_id
LEFT JOIN agents a ON a.id = m.assigned_to;

-- Vista de conversaciones enriquecida
CREATE OR REPLACE VIEW conversations_view AS
SELECT 
  conv.*,
  c.first_name as contact_first_name,
  c.last_name as contact_last_name,
  c.email as contact_email,
  c.company_name as contact_company,
  c.lead_score as contact_lead_score,
  ch.name as channel_name,
  ch.type as channel_type,
  a.name as assigned_to_name,
  CASE 
    WHEN conv.unread_count > 0 THEN 'unread'
    WHEN conv.status = 'active' THEN 'active'
    ELSE 'closed'
  END as ui_status
FROM conversations conv
LEFT JOIN contacts c ON c.id = conv.contact_id
LEFT JOIN channels ch ON ch.id = conv.channel_id
LEFT JOIN agents a ON a.id = conv.assigned_to;

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

DROP TRIGGER IF EXISTS update_channels_updated_at ON channels;
CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_unified_messages_updated_at ON unified_messages;
CREATE TRIGGER update_unified_messages_updated_at BEFORE UPDATE ON unified_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_message_templates_updated_at ON message_templates;
CREATE TRIGGER update_message_templates_updated_at BEFORE UPDATE ON message_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Cuando llega un mensaje nuevo, actualizar o crear conversación
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
DECLARE
  existing_conv_id UUID;
BEGIN
  -- Buscar conversación existente
  SELECT id INTO existing_conv_id
  FROM conversations
  WHERE contact_id = NEW.contact_id 
    AND channel_id = NEW.channel_id
    AND thread_id = NEW.thread_id
    AND status = 'active'
  ORDER BY updated_at DESC
  LIMIT 1;
  
  IF existing_conv_id IS NOT NULL THEN
    -- Actualizar conversación existente
    UPDATE conversations SET
      last_message_at = NEW.received_at,
      last_message_preview = LEFT(NEW.content, 100),
      last_message_direction = NEW.direction,
      message_count = message_count + 1,
      unread_count = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END,
      updated_at = NOW()
    WHERE id = existing_conv_id;
    
    NEW.conversation_id = existing_conv_id;
  ELSE
    -- Crear nueva conversación
    INSERT INTO conversations (
      contact_id, channel_id, thread_id, subject,
      last_message_at, last_message_preview, last_message_direction,
      message_count, unread_count, created_at, updated_at
    ) VALUES (
      NEW.contact_id, NEW.channel_id, NEW.thread_id, 
      CASE WHEN NEW.message_type = 'email' THEN NEW.content ELSE NULL END,
      NEW.received_at, LEFT(NEW.content, 100), NEW.direction,
      1, CASE WHEN NEW.direction = 'inbound' THEN 1 ELSE 0 END,
      NOW(), NOW()
    )
    RETURNING id INTO NEW.conversation_id;
  END IF;
  
  -- Actualizar last_interaction_at del contacto
  UPDATE contacts SET
    last_interaction_at = NEW.received_at,
    updated_at = NOW()
  WHERE id = NEW.contact_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON unified_messages;
CREATE TRIGGER trigger_update_conversation_on_message
BEFORE INSERT ON unified_messages
FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();

-- ============================================
-- RLS (Row Level Security)
-- ============================================

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE unified_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;

-- Políticas básicas (para desarrollo)
DROP POLICY IF EXISTS allow_all_channels ON channels;
CREATE POLICY allow_all_channels ON channels FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_unified_messages ON unified_messages;
CREATE POLICY allow_all_unified_messages ON unified_messages FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_conversations ON conversations;
CREATE POLICY allow_all_conversations ON conversations FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_message_templates ON message_templates;
CREATE POLICY allow_all_message_templates ON message_templates FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_automation_rules ON automation_rules;
CREATE POLICY allow_all_automation_rules ON automation_rules FOR ALL USING (true);

-- ============================================
-- DATOS INICIALES
-- ============================================

-- Canales de ejemplo
INSERT INTO channels (name, type, status, auto_reply_enabled, auto_reply_message) VALUES
('Email General', 'email', 'pending_setup', false, NULL),
('WhatsApp Business', 'whatsapp', 'pending_setup', true, '¡Gracias por contactarnos! Un agente te responderá pronto. 🚀'),
('Telegram Bot', 'telegram', 'active', true, 'Hola! Soy el asistente de Agencia Invent. ¿En qué puedo ayudarte?'),
('WebChat OpenClaw', 'webchat', 'active', false, NULL),
('Instagram DM', 'instagram', 'pending_setup', false, NULL);

-- Plantillas de ejemplo
INSERT INTO message_templates (name, description, channel_types, category, content, variables, is_active) VALUES
(
  'Saludo Inicial',
  'Mensaje de bienvenida para nuevos contactos',
  ARRAY['whatsapp', 'telegram', 'webchat'],
  'greeting',
  '¡Hola {{first_name}}! 👋 Gracias por contactar a Agencia Invent. Soy tu asistente personal y estoy aquí para ayudarte con cualquier consulta sobre nuestros servicios. ¿En qué puedo ayudarte hoy?',
  '[{"name": "first_name", "type": "string", "required": false, "default": "there"}]'::jsonb,
  true
),
(
  'Seguimiento Post-Reunión',
  'Mensaje después de una llamada o reunión',
  ARRAY['email', 'whatsapp'],
  'follow_up',
  'Hola {{first_name}},\n\nFue un placer conversar contigo hoy. Como acordamos, te envío el resumen de nuestra reunión y los siguientes pasos:\n\n{{meeting_summary}}\n\n¿Tienes alguna pregunta adicional?\n\nSaludos,\n{{agent_name}}',
  '[{"name": "first_name", "required": true}, {"name": "meeting_summary", "required": true}, {"name": "agent_name", "required": true}]'::jsonb,
  true
),
(
  'Propuesta Enviada',
  'Notificación cuando se envía una propuesta',
  ARRAY['email', 'whatsapp'],
  'sales',
  'Hola {{first_name}},\n\nTu propuesta para {{project_name}} está lista.\n\nValor: ${{proposal_value}}\nVálida hasta: {{valid_until}}\n\nPuedes revisarla aquí: {{proposal_link}}\n\n¿Tienes preguntas? Estoy aquí para ayudarte.',
  '[{"name": "first_name", "required": true}, {"name": "project_name", "required": true}, {"name": "proposal_value", "required": true}, {"name": "valid_until", "required": true}, {"name": "proposal_link", "required": true}]'::jsonb,
  true
),
(
  'Recordatorio de Pago',
  'Recordatorio amigable de factura pendiente',
  ARRAY['email', 'whatsapp'],
  'general',
  'Hola {{first_name}},\n\nTe recordamos amablemente que la factura #{{invoice_number}} por ${{amount}} vence el {{due_date}}.\n\nPuedes pagar aquí: {{payment_link}}\n\nSi ya realizaste el pago, por favor ignora este mensaje.',
  '[{"name": "first_name", "required": true}, {"name": "invoice_number", "required": true}, {"name": "amount", "required": true}, {"name": "due_date", "required": true}, {"name": "payment_link", "required": true}]'::jsonb,
  true
),
(
  'Encuesta de Satisfacción',
  'Solicitud de feedback post-proyecto',
  ARRAY['email', 'whatsapp'],
  'general',
  '¡Hola {{first_name}}! 🎉\n\nTu proyecto {{project_name}} ha sido completado. Nos encantaría saber tu opinión para seguir mejorando.\n\n¿Podrías tomar 2 minutos para completar esta breve encuesta?\n{{survey_link}}\n\n¡Gracias por confiar en nosotros!',
  '[{"name": "first_name", "required": true}, {"name": "project_name", "required": true}, {"name": "survey_link", "required": true}]'::jsonb,
  true
);
