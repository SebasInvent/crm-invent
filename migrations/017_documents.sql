-- 017_documents.sql
--
-- Sprint 1D — Documentos. La página /dashboard/documents ya está completa
-- (sube a Storage, inserta en `documents`, crea carpetas, signed URLs) pero
-- faltan las tablas `documents` / `document_folders`, la vista `documents_view`
-- y el BUCKET de Storage `documents` con sus políticas.
--
-- La página usa el cliente anon directo para Storage y DB, así que las
-- políticas son permisivas (USING true), igual que el resto del CRM.
-- Idempotente.

-- ─── documents ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  original_name TEXT,
  description TEXT,
  file_type TEXT,
  mime_type TEXT,
  file_size_bytes BIGINT,
  storage_path TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'documents',
  category TEXT DEFAULT 'general',
  visibility TEXT DEFAULT 'internal' CHECK (visibility IN ('internal','client','public')),
  is_latest_version BOOLEAN DEFAULT true,
  version INT DEFAULT 1,
  contact_id UUID,
  project_id UUID,
  folder_id UUID,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS documents_created_idx ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS documents_folder_idx ON documents(folder_id);

-- ─── document_folders ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_folder_id UUID REFERENCES document_folders(id) ON DELETE CASCADE,
  visibility TEXT DEFAULT 'internal',
  order_index INT DEFAULT 0,
  document_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Vista que consulta la página ──────────────────────────────────
CREATE OR REPLACE VIEW documents_view AS
SELECT
  d.*,
  c.company_name AS contact_company,
  c.first_name   AS contact_first_name,
  c.last_name    AS contact_last_name
FROM documents d
LEFT JOIN contacts c ON c.id = d.contact_id;

-- ─── RLS de las tablas (USING true — cliente anon) ─────────────────
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_documents ON documents;
CREATE POLICY allow_all_documents ON documents FOR ALL USING (true);
DROP POLICY IF EXISTS allow_all_document_folders ON document_folders;
CREATE POLICY allow_all_document_folders ON document_folders FOR ALL USING (true);

-- ─── Bucket de Storage + políticas ─────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "documents_bucket_all" ON storage.objects;
CREATE POLICY "documents_bucket_all" ON storage.objects
  FOR ALL USING (bucket_id = 'documents') WITH CHECK (bucket_id = 'documents');
