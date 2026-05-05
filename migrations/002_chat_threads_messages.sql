-- ============================================================
-- PHASE 1: Sistema de Conversaciones (Bot dentro del CRM)
-- ============================================================
-- Ejecutar en Supabase Dashboard → SQL Editor
-- https://supabase.com/dashboard/project/syuxxszyvzfjqkvwojla/sql/new

-- Tabla de threads (uno por número de teléfono)
CREATE TABLE IF NOT EXISTS chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  channel text DEFAULT 'whatsapp',
  bot_type text DEFAULT 'invent' CHECK (bot_type IN ('invent', 'bmac', 'manual')),
  contact_name text,
  bot_active boolean DEFAULT true,
  status text DEFAULT 'active' CHECK (status IN ('active', 'qualified', 'closed', 'cold')),
  last_message_preview text,
  last_message_at timestamptz DEFAULT now(),
  lead_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabla de mensajes individuales
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES chat_threads(id) ON DELETE CASCADE,
  phone text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender text NOT NULL CHECK (sender IN ('customer', 'bot', 'human')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS chat_threads_last_message_idx ON chat_threads(last_message_at DESC);
CREATE INDEX IF NOT EXISTS chat_threads_status_idx ON chat_threads(status);
CREATE INDEX IF NOT EXISTS chat_threads_bot_type_idx ON chat_threads(bot_type);
CREATE INDEX IF NOT EXISTS chat_messages_thread_idx ON chat_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_phone_idx ON chat_messages(phone, created_at DESC);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_chat_threads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_threads_updated_at ON chat_threads;
CREATE TRIGGER chat_threads_updated_at
  BEFORE UPDATE ON chat_threads
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_threads_updated_at();

-- Habilitar Realtime para que el CRM reciba actualizaciones en vivo
ALTER PUBLICATION supabase_realtime ADD TABLE chat_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- View útil para la página de conversaciones
CREATE OR REPLACE VIEW chat_threads_with_stats AS
SELECT
  t.*,
  (SELECT count(*) FROM chat_messages WHERE thread_id = t.id) as total_messages,
  (SELECT content FROM chat_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1) as last_message
FROM chat_threads t;
