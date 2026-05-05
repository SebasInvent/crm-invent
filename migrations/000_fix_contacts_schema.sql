-- ============================================================================
-- FIX: Agregar columnas faltantes a tabla contacts antes de migración
-- ============================================================================

-- Agregar columnas que pueden faltar si contacts fue creado con schema antiguo
ALTER TABLE contacts 
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS lead_source TEXT,
  ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS interaction_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS legacy_client_id UUID;

-- Si first_name es NULL (tabla antigua tenía 'name'), migrar esos datos primero
UPDATE contacts 
SET first_name = COALESCE(
  (custom_fields->>'original_name'), 
  SPLIT_PART(email, '@', 1),
  'Sin'
)
WHERE first_name IS NULL;

UPDATE contacts
SET last_name = COALESCE(
  (custom_fields->>'original_last_name'),
  'Nombre'
)
WHERE last_name IS NULL;

-- Asegurar que tenemos valores por defecto para campos requeridos
UPDATE contacts SET type = 'lead' WHERE type IS NULL;
UPDATE contacts SET status = 'active' WHERE status IS NULL;
UPDATE contacts SET lead_status = 'new' WHERE lead_status IS NULL;
UPDATE contacts SET created_at = NOW() WHERE created_at IS NULL;
UPDATE contacts SET updated_at = NOW() WHERE updated_at IS NULL;

-- Verificar estructura actual
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'contacts'
ORDER BY ordinal_position;
