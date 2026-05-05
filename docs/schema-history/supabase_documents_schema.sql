-- CRM Fase 6: Documentos y Portal de Clientes
-- Schema para Document Management System y Client Portal

-- ============================================
-- ARCHIVOS / DOCUMENTOS
-- ============================================

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Información básica
  name TEXT NOT NULL,
  original_name TEXT,
  description TEXT,
  
  -- Tipo y categorización
  file_type TEXT, -- pdf, doc, image, etc.
  mime_type TEXT,
  category TEXT DEFAULT 'general' CHECK (category IN (
    'general', 'contract', 'invoice', 'proposal', 'project_file', 
    'design', 'report', 'legal', 'financial', 'marketing'
  )),
  
  -- Tamaño y storage
  file_size_bytes BIGINT,
  storage_path TEXT NOT NULL, -- Ruta en Supabase Storage
  storage_bucket TEXT DEFAULT 'documents',
  
  -- Versionado
  version INTEGER DEFAULT 1,
  parent_document_id UUID REFERENCES documents(id), -- Para versiones anteriores
  is_latest_version BOOLEAN DEFAULT true,
  
  -- Relaciones (opcional, puede estar asociado a múltiples entidades)
  contact_id UUID REFERENCES contacts(id),
  project_id UUID REFERENCES projects(id),
  deal_id UUID REFERENCES deals(id),
  invoice_id UUID REFERENCES invoices(id),
  
  -- Permisos y visibilidad
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'internal', 'client', 'public')),
  
  -- Flags
  is_template BOOLEAN DEFAULT false,
  requires_signature BOOLEAN DEFAULT false,
  signature_status TEXT CHECK (signature_status IN ('not_required', 'pending', 'signed', 'rejected')),
  
  -- Metadata
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  
  -- Tracking
  uploaded_by UUID REFERENCES agents(id),
  downloaded_count INTEGER DEFAULT 0,
  viewed_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_contact ON documents(contact_id);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_visibility ON documents(visibility);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_latest ON documents(is_latest_version) WHERE is_latest_version = true;

-- Vista de documentos con info de relaciones
CREATE OR REPLACE VIEW documents_view AS
SELECT 
  d.*,
  c.first_name as contact_first_name,
  c.last_name as contact_last_name,
  c.company_name as contact_company,
  p.name as project_name,
  deal.name as deal_name,
  a.name as uploaded_by_name
FROM documents d
LEFT JOIN contacts c ON c.id = d.contact_id
LEFT JOIN projects p ON p.id = d.project_id
LEFT JOIN deals deal ON deal.id = d.deal_id
LEFT JOIN agents a ON a.id = d.uploaded_by;

-- ============================================
-- CARPETAS (Folder Structure)
-- ============================================

CREATE TABLE IF NOT EXISTS document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Jerarquía
  parent_folder_id UUID REFERENCES document_folders(id),
  
  -- Contexto (puede estar asociado a un proyecto, cliente, etc)
  contact_id UUID REFERENCES contacts(id),
  project_id UUID REFERENCES projects(id),
  
  -- Permisos
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'internal', 'client')),
  
  -- Orden
  order_index INTEGER DEFAULT 0,
  
  created_by UUID REFERENCES agents(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folders_parent ON document_folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_contact ON document_folders(contact_id);
CREATE INDEX IF NOT EXISTS idx_folders_project ON document_folders(project_id);

-- Relación documentos-carpetas
CREATE TABLE IF NOT EXISTS document_folder_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID REFERENCES document_folders(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  added_by UUID REFERENCES agents(id),
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(folder_id, document_id)
);

-- ============================================
-- COMPARTIR DOCUMENTOS (Sharing)
-- ============================================

CREATE TABLE IF NOT EXISTS document_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  
  -- Tipo de share
  share_type TEXT NOT NULL CHECK (share_type IN ('link', 'email', 'client_portal')),
  
  -- Para shares por email
  shared_with_email TEXT,
  shared_with_contact_id UUID REFERENCES contacts(id),
  
  -- Token y expiración
  access_token TEXT UNIQUE, -- Para links públicos
  password_hash TEXT, -- Password opcional
  
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Permisos
  can_download BOOLEAN DEFAULT true,
  can_view BOOLEAN DEFAULT true,
  can_edit BOOLEAN DEFAULT false,
  
  -- Tracking
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP WITH TIME ZONE,
  
  created_by UUID REFERENCES agents(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_shares_document ON document_shares(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_shares_token ON document_shares(access_token);

-- ============================================
-- CLIENT PORTAL - CONFIGURACIÓN
-- ============================================

CREATE TABLE IF NOT EXISTS client_portal_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identificación del portal
  portal_slug TEXT UNIQUE NOT NULL, -- URL única: crm.com/portal/[slug]
  
  contact_id UUID NOT NULL REFERENCES contacts(id),
  
  -- Configuración
  is_active BOOLEAN DEFAULT true,
  password_hash TEXT, -- Si no usa SSO
  
  -- Permisos del portal
  can_view_projects BOOLEAN DEFAULT true,
  can_view_invoices BOOLEAN DEFAULT true,
  can_view_quotes BOOLEAN DEFAULT true,
  can_view_documents BOOLEAN DEFAULT true,
  can_approve_quotes BOOLEAN DEFAULT true,
  can_pay_invoices BOOLEAN DEFAULT true,
  can_create_tickets BOOLEAN DEFAULT true,
  
  -- Branding
  custom_logo_url TEXT,
  primary_color TEXT DEFAULT '#000000',
  
  -- Fechas
  last_login_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_settings_contact ON client_portal_settings(contact_id);
CREATE INDEX IF NOT EXISTS idx_portal_settings_slug ON client_portal_settings(portal_slug);

-- ============================================
-- CLIENT PORTAL - ACTIVIDAD
-- ============================================

CREATE TABLE IF NOT EXISTS client_portal_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  portal_id UUID REFERENCES client_portal_settings(id),
  contact_id UUID REFERENCES contacts(id),
  
  -- Tipo de actividad
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'login', 'view_project', 'view_invoice', 'view_quote', 'view_document',
    'download_document', 'approve_quote', 'reject_quote', 'pay_invoice',
    'create_ticket', 'comment', 'signature_request_viewed', 'document_signed'
  )),
  
  -- Detalles
  description TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- IP y user agent para seguridad
  ip_address TEXT,
  user_agent TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_activity_portal ON client_portal_activity(portal_id);
CREATE INDEX IF NOT EXISTS idx_portal_activity_contact ON client_portal_activity(contact_id);
CREATE INDEX IF NOT EXISTS idx_portal_activity_type ON client_portal_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_portal_activity_created ON client_portal_activity(created_at DESC);

-- ============================================
-- FIRMAS ELECTRÓNICAS
-- ============================================

CREATE TABLE IF NOT EXISTS document_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  
  -- Firmante
  signer_contact_id UUID REFERENCES contacts(id),
  signer_name TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  
  -- Estado
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'signed', 'declined', 'expired')),
  
  -- Campos de firma
  signature_data TEXT, -- URL de imagen de firma o datos
  signature_ip TEXT,
  signature_timestamp TIMESTAMP WITH TIME ZONE,
  
  -- Request
  request_sent_at TIMESTAMP WITH TIME ZONE,
  request_message TEXT,
  
  -- Expiración
  expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit trail
  audit_trail JSONB DEFAULT '[]',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signatures_document ON document_signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_signatures_status ON document_signatures(status);
CREATE INDEX IF NOT EXISTS idx_signatures_contact ON document_signatures(signer_contact_id);

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista de documentos por cliente
CREATE OR REPLACE VIEW contact_documents_view AS
SELECT 
  d.*,
  c.first_name,
  c.last_name,
  c.company_name,
  COUNT(ds.id) as share_count,
  COUNT(CASE WHEN ds.share_type = 'client_portal' THEN 1 END) as portal_share_count
FROM documents d
LEFT JOIN contacts c ON c.id = d.contact_id
LEFT JOIN document_shares ds ON ds.document_id = d.id
WHERE d.contact_id IS NOT NULL
GROUP BY d.id, c.first_name, c.last_name, c.company_name;

-- Vista de actividad del portal resumida
CREATE OR REPLACE VIEW portal_activity_summary AS
SELECT 
  cpa.portal_id,
  cpa.contact_id,
  c.first_name,
  c.last_name,
  c.company_name,
  COUNT(*) as total_activities,
  COUNT(CASE WHEN cpa.activity_type = 'login' THEN 1 END) as login_count,
  COUNT(CASE WHEN cpa.activity_type LIKE 'view_%' THEN 1 END) as views_count,
  COUNT(CASE WHEN cpa.activity_type LIKE 'download_%' THEN 1 END) as downloads_count,
  MAX(cpa.created_at) as last_activity_at
FROM client_portal_activity cpa
LEFT JOIN contacts c ON c.id = cpa.contact_id
GROUP BY cpa.portal_id, cpa.contact_id, c.first_name, c.last_name, c.company_name;

-- ============================================
-- TRIGGERS Y FUNCIONES
-- ============================================

-- Trigger: Actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_doc_folders_updated_at ON document_folders;
CREATE TRIGGER update_doc_folders_updated_at BEFORE UPDATE ON document_folders 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_portal_settings_updated_at ON client_portal_settings;
CREATE TRIGGER update_portal_settings_updated_at BEFORE UPDATE ON client_portal_settings 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_signatures_updated_at ON document_signatures;
CREATE TRIGGER update_signatures_updated_at BEFORE UPDATE ON document_signatures 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Cuando se sube una nueva versión, marcar la anterior como no latest
CREATE OR REPLACE FUNCTION update_document_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_document_id IS NOT NULL THEN
    UPDATE documents 
    SET is_latest_version = false
    WHERE id = NEW.parent_document_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_doc_version ON documents;
CREATE TRIGGER trigger_update_doc_version
AFTER INSERT ON documents
FOR EACH ROW WHEN (NEW.parent_document_id IS NOT NULL)
EXECUTE FUNCTION update_document_version();

-- Trigger: Actualizar contador de descargas
CREATE OR REPLACE FUNCTION increment_download_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE documents 
  SET downloaded_count = downloaded_count + 1
  WHERE id = NEW.document_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS
-- ============================================

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_folder_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_signatures ENABLE ROW LEVEL SECURITY;

-- Políticas básicas
DROP POLICY IF EXISTS allow_all_documents ON documents;
CREATE POLICY allow_all_documents ON documents FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_folders ON document_folders;
CREATE POLICY allow_all_folders ON document_folders FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_folder_items ON document_folder_items;
CREATE POLICY allow_all_folder_items ON document_folder_items FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_doc_shares ON document_shares;
CREATE POLICY allow_all_doc_shares ON document_shares FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_portal_settings ON client_portal_settings;
CREATE POLICY allow_all_portal_settings ON client_portal_settings FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_portal_activity ON client_portal_activity;
CREATE POLICY allow_all_portal_activity ON client_portal_activity FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_signatures ON document_signatures;
CREATE POLICY allow_all_signatures ON document_signatures FOR ALL USING (true);

-- ============================================
-- DATOS INICIALES
-- ============================================

-- Carpetas de ejemplo
INSERT INTO document_folders (name, description, category, visibility, order_index) VALUES
('Contratos', 'Contratos con clientes y proveedores', 'legal', 'internal', 0),
('Propuestas', 'Cotizaciones y propuestas enviadas', 'proposal', 'internal', 1),
('Diseños', 'Archivos de diseño gráfico', 'design', 'internal', 2),
('Facturas', 'Facturas emitidas', 'financial', 'internal', 3),
('Recursos', 'Templates y recursos reutilizables', 'general', 'internal', 4)
ON CONFLICT DO NOTHING;
