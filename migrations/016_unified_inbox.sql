-- 016_unified_inbox.sql
--
-- Sprint 1C — Inbox unificado. La página /dashboard/inbox espera channels,
-- unified_messages, message_templates + vistas conversations_view / inbox_view,
-- ninguno en prod. Además `conversations` en prod es la tabla LEGACY (telegram:
-- client_id/message/channel), distinta a la unificada — se alinea con ALTER.
--
-- Esto deja la página FUNCIONAL (canales + plantillas visibles, enviar registra
-- mensajes, mensajes entrantes crean conversación). El backfill histórico de
-- WhatsApp (chat_threads → conversations) va en un paso aparte.
--
-- RLS con USING(true): la página usa el cliente anon, igual que el resto del CRM.
-- Idempotente.

-- ─── channels ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('email','whatsapp','telegram','instagram','facebook','webchat','sms','phone','linkedin','twitter','other')),
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','error','pending_setup')),
  webhook_url TEXT,
  auto_reply_enabled BOOLEAN DEFAULT false,
  auto_reply_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);

-- ─── unified_messages ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unified_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id),
  channel_type TEXT,
  conversation_id UUID,
  thread_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound','internal')),
  contact_id UUID,
  contact_name TEXT,
  external_message_id TEXT,
  message_type TEXT DEFAULT 'text',
  content TEXT NOT NULL,
  media_urls TEXT[],
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'received',
  assigned_to UUID,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_um_conversation ON unified_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_um_created ON unified_messages(created_at DESC);

-- ─── message_templates ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  channel_types TEXT[] DEFAULT '{}',
  category TEXT DEFAULT 'general',
  subject TEXT,
  content TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Alinear la tabla `conversations` legacy con la unificada ──────
ALTER TABLE conversations ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE conversations ALTER COLUMN message DROP NOT NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS contact_id UUID;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel_id UUID;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS thread_id TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_preview TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_direction TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_to UUID;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);

-- ─── Vistas (lo que consulta la página) ────────────────────────────
-- Solo conversaciones unificadas (channel_id NOT NULL) — excluye filas legacy.
CREATE OR REPLACE VIEW conversations_view AS
SELECT
  conv.id, conv.contact_id, conv.channel_id, conv.thread_id, conv.subject, conv.status,
  conv.last_message_at, conv.last_message_preview, conv.last_message_direction,
  conv.message_count, conv.unread_count, conv.assigned_to, conv.tags, conv.created_at, conv.updated_at,
  COALESCE(c.first_name, conv.subject) AS contact_first_name,
  c.last_name    AS contact_last_name,
  c.email        AS contact_email,
  c.company_name AS contact_company,
  ch.name        AS channel_name,
  ch.type        AS channel_type,
  a.name         AS assigned_to_name
FROM conversations conv
LEFT JOIN contacts c ON c.id = conv.contact_id
LEFT JOIN channels ch ON ch.id = conv.channel_id
LEFT JOIN agents a ON a.id = conv.assigned_to
WHERE conv.channel_id IS NOT NULL;

CREATE OR REPLACE VIEW inbox_view AS
SELECT
  m.*,
  c.first_name   AS contact_first_name,
  c.last_name    AS contact_last_name,
  c.email        AS contact_email,
  c.company_name AS contact_company,
  ch.name        AS channel_name,
  a.name         AS assigned_to_name
FROM unified_messages m
LEFT JOIN contacts c ON c.id = m.contact_id
LEFT JOIN channels ch ON ch.id = m.channel_id
LEFT JOIN agents a ON a.id = m.assigned_to;

-- ─── Trigger: al insertar mensaje, mantener la conversación ────────
-- Respeta conversation_id si viene (envío desde la UI); si no, busca/crea.
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
DECLARE existing_conv_id UUID;
BEGIN
  IF NEW.conversation_id IS NOT NULL THEN
    UPDATE conversations SET
      last_message_at = COALESCE(NEW.received_at, NOW()),
      last_message_preview = LEFT(NEW.content, 100),
      last_message_direction = NEW.direction,
      message_count = COALESCE(message_count, 0) + 1,
      unread_count = CASE WHEN NEW.direction = 'inbound' THEN COALESCE(unread_count, 0) + 1 ELSE unread_count END,
      updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
  END IF;

  SELECT id INTO existing_conv_id FROM conversations
  WHERE channel_id = NEW.channel_id
    AND ((NEW.contact_id IS NOT NULL AND contact_id = NEW.contact_id)
      OR (NEW.thread_id IS NOT NULL AND thread_id = NEW.thread_id))
  ORDER BY updated_at DESC NULLS LAST LIMIT 1;

  IF existing_conv_id IS NOT NULL THEN
    UPDATE conversations SET
      last_message_at = COALESCE(NEW.received_at, NOW()),
      last_message_preview = LEFT(NEW.content, 100),
      last_message_direction = NEW.direction,
      message_count = COALESCE(message_count, 0) + 1,
      unread_count = CASE WHEN NEW.direction = 'inbound' THEN COALESCE(unread_count, 0) + 1 ELSE unread_count END,
      updated_at = NOW()
    WHERE id = existing_conv_id;
    NEW.conversation_id = existing_conv_id;
  ELSE
    INSERT INTO conversations (contact_id, channel_id, thread_id, last_message_at, last_message_preview, last_message_direction, message_count, unread_count, status)
    VALUES (NEW.contact_id, NEW.channel_id, NEW.thread_id, COALESCE(NEW.received_at, NOW()), LEFT(NEW.content, 100), NEW.direction, 1, CASE WHEN NEW.direction = 'inbound' THEN 1 ELSE 0 END, 'active')
    RETURNING id INTO NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON unified_messages;
CREATE TRIGGER trigger_update_conversation_on_message
  BEFORE INSERT ON unified_messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();

-- ─── RLS (USING true — cliente anon, como el resto del CRM) ────────
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE unified_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_channels ON channels;
CREATE POLICY allow_all_channels ON channels FOR ALL USING (true);
DROP POLICY IF EXISTS allow_all_unified_messages ON unified_messages;
CREATE POLICY allow_all_unified_messages ON unified_messages FOR ALL USING (true);
DROP POLICY IF EXISTS allow_all_conversations ON conversations;
CREATE POLICY allow_all_conversations ON conversations FOR ALL USING (true);
DROP POLICY IF EXISTS allow_all_message_templates ON message_templates;
CREATE POLICY allow_all_message_templates ON message_templates FOR ALL USING (true);

-- ─── Seed de canales + plantillas (idempotente) ────────────────────
INSERT INTO channels (name, type, status)
SELECT v.name, v.type, v.status FROM (VALUES
  ('Email General','email','active'),
  ('WhatsApp Business','whatsapp','active'),
  ('Telegram Bot','telegram','active'),
  ('WebChat','webchat','active')
) AS v(name, type, status)
WHERE NOT EXISTS (SELECT 1 FROM channels ch WHERE ch.type = v.type);

INSERT INTO message_templates (name, description, channel_types, category, content, is_active)
SELECT v.name, v.description, v.channel_types, v.category, v.content, true FROM (VALUES
  ('Saludo Inicial','Bienvenida para nuevos contactos', ARRAY['whatsapp','telegram','webchat'], 'greeting', '¡Hola! 👋 Gracias por contactar a Invent Agency. ¿En qué puedo ayudarte hoy?'),
  ('Seguimiento','Follow-up tras una conversación', ARRAY['whatsapp','email'], 'follow_up', 'Hola, quería retomar nuestra conversación. ¿Tienes unos minutos esta semana?'),
  ('Recordatorio de pago','Recordatorio de factura', ARRAY['whatsapp','email'], 'general', 'Hola, te recordamos amablemente que tienes una factura próxima a vencer. Cualquier duda, aquí estamos.')
) AS v(name, description, channel_types, category, content)
WHERE NOT EXISTS (SELECT 1 FROM message_templates t WHERE t.name = v.name);
