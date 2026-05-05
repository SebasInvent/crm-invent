// Tipos para Documentos y Portal de Clientes - Fase 6

// Documentos
export interface Document {
  id: string;
  name: string;
  original_name?: string;
  description?: string;
  
  file_type?: string;
  mime_type?: string;
  category: 'general' | 'contract' | 'invoice' | 'proposal' | 'project_file' | 'design' | 'report' | 'legal' | 'financial' | 'marketing';
  
  file_size_bytes?: number;
  storage_path: string;
  storage_bucket: string;
  
  version: number;
  parent_document_id?: string;
  is_latest_version: boolean;
  
  contact_id?: string;
  project_id?: string;
  deal_id?: string;
  invoice_id?: string;
  
  visibility: 'private' | 'internal' | 'client' | 'public';
  
  is_template: boolean;
  requires_signature: boolean;
  signature_status?: 'not_required' | 'pending' | 'signed' | 'rejected';
  
  tags: string[];
  metadata?: Record<string, any>;
  
  uploaded_by?: string;
  downloaded_count: number;
  viewed_count: number;
  
  created_at: string;
  updated_at: string;
  
  // Joined
  contact_first_name?: string;
  contact_last_name?: string;
  contact_company?: string;
  project_name?: string;
  deal_name?: string;
  uploaded_by_name?: string;
  
  // URL firmada
  url?: string;
}

// Carpetas
export interface DocumentFolder {
  id: string;
  name: string;
  description?: string;
  
  parent_folder_id?: string;
  
  contact_id?: string;
  project_id?: string;
  
  visibility: 'private' | 'internal' | 'client';
  
  order_index: number;
  
  created_by?: string;
  created_at: string;
  updated_at: string;
  
  // Joined
  parent_folder_name?: string;
  contact_name?: string;
  project_name?: string;
  created_by_name?: string;
  document_count?: number;
}

// Items de carpeta (relación)
export interface DocumentFolderItem {
  id: string;
  folder_id: string;
  document_id: string;
  added_by?: string;
  added_at: string;
}

// Compartir documentos
export interface DocumentShare {
  id: string;
  document_id: string;
  
  share_type: 'link' | 'email' | 'client_portal';
  
  shared_with_email?: string;
  shared_with_contact_id?: string;
  
  access_token?: string;
  password_hash?: string;
  
  expires_at?: string;
  
  can_download: boolean;
  can_view: boolean;
  can_edit: boolean;
  
  access_count: number;
  last_accessed_at?: string;
  
  created_by?: string;
  created_at: string;
  
  // Joined
  document_name?: string;
  shared_with_name?: string;
}

// Configuración del Portal de Clientes
export interface ClientPortalSetting {
  id: string;
  portal_slug: string;
  contact_id: string;
  
  is_active: boolean;
  password_hash?: string;
  
  can_view_projects: boolean;
  can_view_invoices: boolean;
  can_view_quotes: boolean;
  can_view_documents: boolean;
  can_approve_quotes: boolean;
  can_pay_invoices: boolean;
  can_create_tickets: boolean;
  
  custom_logo_url?: string;
  primary_color: string;
  
  last_login_at?: string;
  expires_at?: string;
  
  created_at: string;
  updated_at: string;
  
  // Joined
  contact_first_name?: string;
  contact_last_name?: string;
  contact_company?: string;
  contact_email?: string;
}

// Actividad del Portal
export interface ClientPortalActivity {
  id: string;
  portal_id?: string;
  contact_id?: string;
  
  activity_type: 
    | 'login' | 'view_project' | 'view_invoice' | 'view_quote' | 'view_document'
    | 'download_document' | 'approve_quote' | 'reject_quote' | 'pay_invoice'
    | 'create_ticket' | 'comment' | 'signature_request_viewed' | 'document_signed';
  
  description?: string;
  metadata?: Record<string, any>;
  
  ip_address?: string;
  user_agent?: string;
  
  created_at: string;
  
  // Joined
  contact_name?: string;
  project_name?: string;
  document_name?: string;
}

// Firmas electrónicas
export interface DocumentSignature {
  id: string;
  document_id: string;
  
  signer_contact_id?: string;
  signer_name: string;
  signer_email: string;
  
  status: 'pending' | 'viewed' | 'signed' | 'declined' | 'expired';
  
  signature_data?: string;
  signature_ip?: string;
  signature_timestamp?: string;
  
  request_sent_at?: string;
  request_message?: string;
  
  expires_at?: string;
  
  audit_trail?: any[];
  
  created_at: string;
  updated_at: string;
  
  // Joined
  document_name?: string;
}

// Formularios
export interface DocumentUploadForm {
  file: File;
  name?: string;
  description?: string;
  category: Document['category'];
  visibility: Document['visibility'];
  contact_id?: string;
  project_id?: string;
  deal_id?: string;
  tags?: string[];
  is_template?: boolean;
  requires_signature?: boolean;
}

export interface FolderFormData {
  name: string;
  description?: string;
  parent_folder_id?: string;
  contact_id?: string;
  project_id?: string;
  visibility: DocumentFolder['visibility'];
}

// Filtros
export interface DocumentFilter {
  category?: Document['category'];
  visibility?: Document['visibility'];
  contact_id?: string;
  project_id?: string;
  uploaded_by?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  tags?: string[];
}

// Estadísticas
export interface DocumentStats {
  total_documents: number;
  total_size_bytes: number;
  documents_by_category: Record<string, number>;
  recent_uploads: number;
  most_downloaded: Document[];
}
