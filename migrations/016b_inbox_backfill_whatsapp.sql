-- 016b_inbox_backfill_whatsapp.sql
--
-- Backfill OPCIONAL: lleva los hilos de WhatsApp existentes (chat_threads /
-- chat_messages) al Inbox unificado, para que las conversaciones reales
-- aparezcan en /dashboard/inbox. Correr DESPUÉS de 016.
--
-- Idempotente: usa external_message_id = chat_messages.id para no duplicar, y
-- NOT EXISTS para las conversaciones. Desactiva el trigger durante la carga.

-- 1. Una conversación por hilo de WhatsApp
INSERT INTO conversations
  (channel_id, thread_id, subject, status, last_message_at, last_message_preview, message_count, unread_count, created_at, updated_at)
SELECT
  (SELECT id FROM channels WHERE type = 'whatsapp' ORDER BY created_at LIMIT 1),
  ct.phone,
  COALESCE(NULLIF(btrim(ct.contact_name), ''), ct.phone),
  'active',
  ct.last_message_at,
  ct.last_message_preview,
  (SELECT count(*) FROM chat_messages cm WHERE cm.thread_id = ct.id),
  0,
  ct.created_at,
  NOW()
FROM chat_threads ct
WHERE NOT EXISTS (
  SELECT 1 FROM conversations c
  WHERE c.thread_id = ct.phone
    AND c.channel_id = (SELECT id FROM channels WHERE type = 'whatsapp' ORDER BY created_at LIMIT 1)
);

-- 2. Mensajes (trigger off para que no recree conversaciones)
ALTER TABLE unified_messages DISABLE TRIGGER trigger_update_conversation_on_message;

INSERT INTO unified_messages
  (channel_id, channel_type, conversation_id, thread_id, direction, content, external_message_id, message_type, status, received_at, created_at)
SELECT
  conv.channel_id, 'whatsapp', conv.id, ct.phone, cm.direction, cm.content, cm.id::text, 'text',
  CASE WHEN cm.direction = 'inbound' THEN 'received' ELSE 'sent' END,
  cm.created_at, cm.created_at
FROM chat_messages cm
JOIN chat_threads ct ON ct.id = cm.thread_id
JOIN conversations conv
  ON conv.thread_id = ct.phone
 AND conv.channel_id = (SELECT id FROM channels WHERE type = 'whatsapp' ORDER BY created_at LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM unified_messages um WHERE um.external_message_id = cm.id::text
);

ALTER TABLE unified_messages ENABLE TRIGGER trigger_update_conversation_on_message;

-- 3. Reconciliar contadores
UPDATE conversations c
SET message_count = (SELECT count(*) FROM unified_messages um WHERE um.conversation_id = c.id)
WHERE c.channel_id = (SELECT id FROM channels WHERE type = 'whatsapp' ORDER BY created_at LIMIT 1);
