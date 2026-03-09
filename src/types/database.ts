export interface Client {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  status: 'active' | 'inactive' | 'lead';
  priority: 'low' | 'medium' | 'high';
  lifetime_value: number;
  created_at: string;
  // Campos para integración con Telegram y OpenClaw
  telegram_chat_id?: string | null;
  telegram_username?: string | null;
  openclaw_session_id?: string | null;
  source?: 'manual' | 'telegram' | 'openclaw' | 'web' | 'other';
  last_interaction_at?: string | null;
  metadata?: Record<string, any> | null;
}

export interface Project {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  status: 'planning' | 'in_progress' | 'review' | 'completed' | 'cancelled';
  budget: number | null;
  start_date: string | null;
  end_date: string | null;
  progress: number;
  created_at: string;
}

export interface Deliverable {
  id: string;
  project_id: string;
  client_id: string;
  name: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'review' | 'approved' | 'delivered';
  due_date: string | null;
  file_url: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  client_id: string;
  project_id: string | null;
  invoice_number: string;
  total_amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  issue_date: string;
  due_date: string | null;
  created_at: string;
}

export interface Meeting {
  id: string;
  client_id: string;
  project_id: string | null;
  title: string;
  scheduled_at: string;
  meeting_link: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  created_at: string;
}

export interface Conversation {
  id: string;
  client_id: string;
  message: string;
  channel: 'telegram' | 'email' | 'whatsapp' | 'other';
  created_at: string;
  // Campos adicionales para integraciones
  telegram_message_id?: string | null;
  telegram_chat_id?: string | null;
  openclaw_session_id?: string | null;
  sender_type?: 'client' | 'agent' | 'system' | 'bot';
  raw_data?: Record<string, any> | null;
}

export interface EmailLog {
  id: string;
  client_id: string;
  to_email: string;
  subject: string;
  status: 'sent' | 'failed' | 'pending';
  sent_at: string;
  // Campos adicionales
  from_email?: string | null;
  template_id?: string | null;
  openclaw_message_id?: string | null;
}

// Tipo para sesiones de chat (main sessions de OpenClaw/Sincronía)
export interface ChatSession {
  id: string;
  client_id: string;
  agent_id?: string | null;
  session_type: 'telegram' | 'whatsapp' | 'webchat' | 'email' | 'other';
  external_session_id: string; // ID de la sesión en Telegram/OpenClaw
  status: 'active' | 'closed' | 'archived';
  started_at: string;
  ended_at?: string | null;
  last_message_at?: string | null;
  message_count: number;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

// Agent Management Types
export interface Agent {
  id: string;
  name: string;
  email: string;
  role: string | null;
  skills: string[];
  avatar_url: string | null;
  hourly_rate: number | null;
  is_active: boolean;
  created_at: string;
}

export interface AgentTask {
  id: string;
  task_id: string;
  agent_id: string;
  assigned_by: string | null;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  status: 'assigned' | 'in_progress' | 'completed' | 'blocked';
  priority: 'low' | 'medium' | 'high';
  notes: string | null;
  deliverable_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentDeliverable {
  id: string;
  agent_task_id: string;
  client_id: string;
  project_id: string;
  agent_id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  file_path: string | null;
  file_type: string | null;
  file_size: number | null;
  generated_at: string;
  reviewed_by: string | null;
  review_notes: string | null;
  approved_for_send: boolean;
  approved_at: string | null;
  sent_to_client: boolean;
  sent_at: string | null;
  email_log_id: string | null;
  client_feedback: string | null;
  client_rating: number | null;
  created_at: string;
  updated_at: string;
}

// Lead Management - Basado en metodología Jung
export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  
  // Arquetipo Jung (segmentación psicológica)
  jung_archetype: 
    | 'hero_entrepreneur'       // Emprendedor visionario
    | 'sage_conservative'       // Empresario conservador
    | 'caregiver_stressed'      // Director de marketing estresado
    | 'artist_specialist'       // Especialista independiente
    | 'ruler_executive'         // Ejecutivo results-driven
    | 'explorer_merchant'       // Comerciante digital ambicioso
    | null;
  
  // Categorización BANT
  budget_level: 'high' | 'medium' | 'low' | null;
  authority_level: 'decision_maker' | 'influencer' | 'user' | null;
  need_urgency: 'critical' | 'high' | 'medium' | 'low' | null;
  timeline: 'immediate' | 'short_term' | 'medium_term' | 'long_term' | null;
  
  // Scoring y priorización
  lead_score: number; // 0-100
  lead_status: 'hot' | 'warm' | 'cold' | 'dead' | 'converted';
  priority: 'critical' | 'high' | 'medium' | 'low';
  
  // Información de la fuente
  source: 'scraped' | 'web_form' | 'referral' | 'linkedin' | 'event' | 'cold_outreach' | 'telegram' | 'openclaw' | 'other';
  source_url: string | null; // URL de donde se scrapeó
  source_platform: 'linkedin' | 'instagram' | 'google_business' | 'mercado_libre' | 'rappi' | 'website' | 'google_maps' | 'directory' | null;
  
  // Datos de la empresa/industria
  industry: string | null;
  company_size: 'startup' | 'small' | 'medium' | 'large' | 'enterprise' | null;
  annual_revenue: number | null;
  location: string | null;
  website: string | null;
  linkedin_url: string | null;
  
  // Metadatos del scraping
  scraped_data: {
    raw_text?: string;
    social_profiles?: string[];
    technologies?: string[];
    competitors?: string[];
    employees_count?: number;
    founded_year?: number;
  } | null;
  
  // Comunicación y seguimiento
  last_contact_date: string | null;
  next_follow_up_date: string | null;
  contact_attempts: number;
  communication_channel: 'email' | 'linkedin' | 'whatsapp' | 'phone' | null;
  assigned_to: string | null; // ID del agente
  
  // Conversión
  converted_to_client_id: string | null;
  converted_at: string | null;
  conversion_value: number | null;
  
  // Tags y categorización
  tags: string[];
  notes: string | null;
  
  // GDPR/Consentimiento
  consent_status: 'granted' | 'pending' | 'denied' | null;
  consent_date: string | null;
  
  created_at: string;
  updated_at: string;
}

// Interacciones con leads (emails, llamadas, etc.)
export interface LeadInteraction {
  id: string;
  lead_id: string;
  agent_id: string | null;
  interaction_type: 'email_sent' | 'email_opened' | 'email_replied' | 'linkedin_message' | 'linkedin_view' | 'call_made' | 'call_received' | 'whatsapp_sent' | 'meeting_scheduled' | 'meeting_completed' | 'website_visit' | 'content_download';
  content: string | null;
  metadata: {
    email_subject?: string;
    email_body?: string;
    call_duration?: number;
    call_recording_url?: string;
    meeting_link?: string;
    page_visited?: string;
    content_title?: string;
  } | null;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  created_at: string;
}

export interface DashboardStats {
  activeClients: number;
  activeProjects: number;
  monthlyRevenue: number;
  pendingTasks: number;
}

export interface PipelineData {
  name: string;
  value: number;
}

// Database type for Supabase client
export type Database = {
  public: {
    Tables: {
      clients: {
        Row: Client;
        Insert: Omit<Client, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Client>;
      };
      projects: {
        Row: Project;
        Insert: Omit<Project, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Project>;
      };
      deliverables: {
        Row: Deliverable;
        Insert: Omit<Deliverable, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Deliverable>;
      };
      tasks: {
        Row: Task;
        Insert: Omit<Task, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Task>;
      };
      invoices: {
        Row: Invoice;
        Insert: Omit<Invoice, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Invoice>;
      };
      meetings: {
        Row: Meeting;
        Insert: Omit<Meeting, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Meeting>;
      };
      conversations: {
        Row: Conversation;
        Insert: Omit<Conversation, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Conversation>;
      };
      email_logs: {
        Row: EmailLog;
        Insert: Omit<EmailLog, 'id' | 'sent_at'> & { id?: string; sent_at?: string };
        Update: Partial<EmailLog>;
      };
      agents: {
        Row: Agent;
        Insert: Omit<Agent, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Agent>;
      };
      agent_tasks: {
        Row: AgentTask;
        Insert: Omit<AgentTask, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<AgentTask>;
      };
      agent_deliverables: {
        Row: AgentDeliverable;
        Insert: Omit<AgentDeliverable, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<AgentDeliverable>;
      };
      chat_sessions: {
        Row: ChatSession;
        Insert: Omit<ChatSession, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<ChatSession>;
      };
      leads: {
        Row: Lead;
        Insert: Omit<Lead, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Lead>;
      };
      lead_interactions: {
        Row: LeadInteraction;
        Insert: Omit<LeadInteraction, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<LeadInteraction>;
      };
    };
  };
};
