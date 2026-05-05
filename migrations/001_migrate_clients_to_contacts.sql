-- ============================================================================
-- MIGRACIÓN: Datos de tabla 'clients' (antigua) a 'contacts' (nueva)
-- Fecha: 2024-01-20
-- Objetivo: Consolidar sistema de contactos en tabla única
-- ============================================================================

-- PASO 0: Verificar que las tablas existen
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clients') THEN
    RAISE EXCEPTION 'La tabla clients no existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contacts') THEN
    RAISE EXCEPTION 'La tabla contacts no existe';
  END IF;
END $$;

-- 1. PRIMERO: Crear columna de mapeo temporal si no existe
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS legacy_client_id UUID;

-- 2. MIGRAR clientes existentes de 'clients' a 'contacts'
-- Solo migra si no existe ya un contacto con el mismo email
INSERT INTO contacts (
  id,
  first_name,
  last_name,
  email,
  phone,
  company_name,
  type,
  status,
  lead_source,
  last_interaction_at,
  created_at,
  updated_at,
  legacy_client_id,
  custom_fields
)
SELECT 
  gen_random_uuid() as id,
  -- Separar nombre en first_name y last_name
  CASE 
    WHEN c.name IS NULL OR c.name = '' THEN 'Sin'
    WHEN POSITION(' ' IN c.name) > 0 THEN SPLIT_PART(c.name, ' ', 1)
    ELSE c.name
  END as first_name,
  CASE 
    WHEN c.name IS NULL OR c.name = '' THEN 'Nombre'
    WHEN POSITION(' ' IN c.name) > 0 THEN SUBSTRING(c.name FROM POSITION(' ' IN c.name) + 1)
    ELSE ''
  END as last_name,
  -- Email
  COALESCE(c.email, 'temp_' || c.id || '@placeholder.com') as email,
  -- Teléfono
  c.phone,
  -- Compañía (clients usa 'company', contacts usa 'company_name')
  c.company as company_name,
  -- Tipo y status
  CASE 
    WHEN c.status = 'lead' THEN 'lead'
    WHEN c.status = 'active' THEN 'prospect'
    WHEN c.status = 'inactive' THEN 'inactive'
    ELSE COALESCE(c.status, 'lead')
  END as type,
  'active' as status,
  -- Fuente del lead
  COALESCE(c.source, 'migration') as lead_source,
  -- Timestamps
  COALESCE(c.last_interaction_at, c.created_at, NOW()) as last_interaction_at,
  COALESCE(c.created_at, NOW()) as created_at,
  COALESCE(c.created_at, NOW()) as updated_at,
  -- Guardar referencia al ID antiguo
  c.id as legacy_client_id,
  -- Metadata de migración
  jsonb_build_object(
    'migrated_from_clients', true,
    'original_status', c.status,
    'original_priority', c.priority,
    'original_lifetime_value', c.lifetime_value,
    'telegram_chat_id', c.telegram_chat_id,
    'telegram_username', c.telegram_username,
    'openclaw_session_id', c.openclaw_session_id,
    'original_metadata', c.metadata
  ) as custom_fields
FROM clients c
WHERE c.email IS NOT NULL 
  AND c.email NOT IN (
    -- Excluir emails que ya existen en contacts
    SELECT email FROM contacts WHERE email IS NOT NULL
  )
  AND c.email NOT LIKE 'temp_%@placeholder.com'
ON CONFLICT DO NOTHING;

-- 3. MIGRAR clientes SIN email (usando phone como identificador único)
INSERT INTO contacts (
  id,
  first_name,
  last_name,
  email,
  phone,
  company_name,
  type,
  status,
  lead_source,
  last_interaction_at,
  created_at,
  updated_at,
  legacy_client_id,
  custom_fields
)
SELECT 
  gen_random_uuid() as id,
  CASE 
    WHEN c.name IS NULL OR c.name = '' THEN 'Sin'
    WHEN POSITION(' ' IN c.name) > 0 THEN SPLIT_PART(c.name, ' ', 1)
    ELSE c.name
  END as first_name,
  CASE 
    WHEN c.name IS NULL OR c.name = '' THEN 'Nombre'
    WHEN POSITION(' ' IN c.name) > 0 THEN SUBSTRING(c.name FROM POSITION(' ' IN c.name) + 1)
    ELSE ''
  END as last_name,
  -- Generar email temporal basado en phone
  'phone_' || REGEXP_REPLACE(COALESCE(c.phone, 'unknown'), '[^0-9]', '', 'g') || '@placeholder.com' as email,
  c.phone,
  c.company as company_name,
  CASE 
    WHEN c.status = 'lead' THEN 'lead'
    WHEN c.status = 'active' THEN 'prospect'
    WHEN c.status = 'inactive' THEN 'inactive'
    ELSE COALESCE(c.status, 'lead')
  END as type,
  'active' as status,
  COALESCE(c.source, 'migration') as lead_source,
  COALESCE(c.last_interaction_at, c.created_at, NOW()) as last_interaction_at,
  COALESCE(c.created_at, NOW()) as created_at,
  COALESCE(c.created_at, NOW()) as updated_at,
  c.id as legacy_client_id,
  jsonb_build_object(
    'migrated_from_clients', true,
    'original_status', c.status,
    'original_priority', c.priority,
    'no_email_original', true,
    'telegram_chat_id', c.telegram_chat_id,
    'telegram_username', c.telegram_username,
    'openclaw_session_id', c.openclaw_session_id,
    'original_metadata', c.metadata
  ) as custom_fields
FROM clients c
WHERE (c.email IS NULL OR c.email LIKE 'temp_%@placeholder.com')
  AND c.phone IS NOT NULL
  AND c.phone NOT IN (
    -- Excluir phones que ya existen en contacts
    SELECT phone FROM contacts WHERE phone IS NOT NULL
  )
ON CONFLICT DO NOTHING;

-- 4. ACTUALIZAR referencias en tablas hijas

-- 4.1 Actualizar chat_sessions
UPDATE chat_sessions cs
SET client_id = (
  SELECT c.id 
  FROM contacts c 
  WHERE c.legacy_client_id = cs.client_id
)
WHERE cs.client_id IN (SELECT id FROM clients)
  AND EXISTS (
    SELECT 1 FROM contacts c WHERE c.legacy_client_id = cs.client_id
  );

-- 4.2 Actualizar conversations
UPDATE conversations conv
SET client_id = (
  SELECT c.id 
  FROM contacts c 
  WHERE c.legacy_client_id = conv.client_id
)
WHERE conv.client_id IN (SELECT id FROM clients)
  AND EXISTS (
    SELECT 1 FROM contacts c WHERE c.legacy_client_id = conv.client_id
  );

-- 4.3 Actualizar deals (si usaban client_id)
-- Nota: deals usa contact_id, verificar si hay referencias viejas
-- Si deals tenía client_id anteriormente, actualizarlo
-- Por ahora deals ya usa contact_id, no necesita cambio

-- 5. VERIFICACIÓN: Contar registros migrados
SELECT 
  'Clientes originales (clients)' as tabla,
  COUNT(*) as total
FROM clients
UNION ALL
SELECT 
  'Contactos migrados' as tabla,
  COUNT(*) as total
FROM contacts 
WHERE custom_fields->>'migrated_from_clients' = 'true'
UNION ALL
SELECT 
  'Contactos totales' as tabla,
  COUNT(*) as total
FROM contacts;

-- 6. ÍNDICES recomendados para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_contacts_legacy_id 
ON contacts(legacy_client_id) 
WHERE legacy_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_migrated 
ON contacts((custom_fields->>'migrated_from_clients')) 
WHERE custom_fields->>'migrated_from_clients' = 'true';

-- 7. FUNCIÓN: Buscar contacto por email o legacy_id
CREATE OR REPLACE FUNCTION find_contact_by_email_or_legacy(
  p_email TEXT,
  p_legacy_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_contact_id UUID;
BEGIN
  -- Buscar por email primero
  SELECT id INTO v_contact_id
  FROM contacts
  WHERE email = p_email
  LIMIT 1;
  
  -- Si no encuentra, buscar por legacy_client_id
  IF v_contact_id IS NULL AND p_legacy_id IS NOT NULL THEN
    SELECT id INTO v_contact_id
    FROM contacts
    WHERE legacy_client_id = p_legacy_id
    LIMIT 1;
  END IF;
  
  RETURN v_contact_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- NOTAS:
-- 1. Ejecutar este script en un ambiente de prueba primero
-- 2. Hacer backup de la base de datos antes de ejecutar en producción
-- 3. Verificar que los triggers no interfieran con la migración
-- 4. Después de verificar la migración, se puede eliminar la columna legacy_client_id
-- ============================================================================
