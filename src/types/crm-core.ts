// Tipos para CRM Core Mejorado - Contactos 360° + Pipeline

export interface Contact {
  id: string;
  first_name: string;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  
  type: 'lead' | 'prospect' | 'customer' | 'partner' | 'supplier' | 'vendor' | 'influencer' | 'employee';
  status: 'active' | 'inactive' | 'archived' | 'blocked';
  
  organization_id?: string | null;
  job_title?: string | null;
  department?: string | null;
  
  company_name?: string | null;
  industry?: string | null;
  company_size?: 'startup' | 'small' | 'medium' | 'large' | 'enterprise' | null;
  annual_revenue?: number | null;
  website?: string | null;
  linkedin_url?: string | null;
  
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  zip_code?: string | null;
  timezone?: string | null;
  
  lead_score: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  jung_archetype?: 
    | 'hero_entrepreneur' 
    | 'sage_conservative' 
    | 'caregiver_stressed' 
    | 'artist_specialist' 
    | 'ruler_executive' 
    | 'explorer_merchant' 
    | null;
  
  telegram_chat_id?: string | null;
  telegram_username?: string | null;
  whatsapp_number?: string | null;
  openclaw_session_id?: string | null;
  
  source: 'manual' | 'telegram' | 'openclaw' | 'whatsapp' | 'web_form' | 'referral' | 'linkedin' | 'scraped' | 'event' | 'cold_outreach' | 'other';
  source_details?: Record<string, any> | null;
  
  assigned_to?: string | null;
  
  tags: string[];
  custom_fields?: Record<string, any> | null;
  notes?: string | null;
  
  created_at: string;
  updated_at: string;
  last_interaction_at?: string | null;
  last_contact_date?: string | null;
  next_follow_up_date?: string | null;
  
  consent_status?: 'granted' | 'pending' | 'denied' | null;
  consent_date?: string | null;
  
  lifetime_value: number;
  total_deals_won: number;
  total_deals_value: number;
  
  // Joined fields
  organization_name?: string;
  assigned_to_name?: string;
}

export interface Deal {
  id: string;
  contact_id: string;
  name: string;
  description?: string | null;
  
  pipeline_id?: string | null;
  stage_id?: string | null;
  stage_order: number;
  
  value: number;
  currency: 'USD' | 'COP' | 'EUR' | 'MXN' | 'BRL';
  probability: number;
  expected_close_date?: string | null;
  actual_close_date?: string | null;
  
  status: 'open' | 'won' | 'lost' | 'paused';
  lost_reason?: string | null;
  won_reason?: string | null;
  
  competitor?: string | null;
  competitor_notes?: string | null;
  
  owner_id?: string | null;
  team_members: string[];
  
  line_items?: any[] | null;
  
  last_activity_at?: string | null;
  last_activity_type?: string | null;
  
  source?: string | null;
  campaign_id?: string | null;
  tags: string[];
  custom_fields?: Record<string, any> | null;
  
  created_at: string;
  updated_at: string;
  
  // Joined fields
  contact_first_name?: string;
  contact_last_name?: string;
  contact_email?: string;
  contact_company?: string;
  contact_phone?: string;
  stage_name?: string;
  stage_color?: string;
  pipeline_name?: string;
  owner_name?: string;
  weighted_value?: number;
}

export interface Pipeline {
  id: string;
  name: string;
  description?: string | null;
  is_default: boolean;
  is_active: boolean;
  currency: string;
  display_fields?: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  description?: string | null;
  order_index: number;
  color: string;
  default_probability: number;
  auto_move_rules?: any[] | null;
  required_fields?: string[] | null;
  max_deals?: number | null;
  is_active: boolean;
  created_at: string;
  
  // Computed
  deal_count?: number;
  total_value?: number;
}

export interface ActivityLog {
  id: string;
  contact_id?: string | null;
  deal_id?: string | null;
  project_id?: string | null;
  
  activity_type: 
    | 'note' 
    | 'email' 
    | 'call' 
    | 'meeting' 
    | 'task_completed' 
    | 'stage_change' 
    | 'deal_created' 
    | 'deal_won' 
    | 'deal_lost'
    | 'web_visit' 
    | 'document_viewed' 
    | 'proposal_sent'
    | 'conversation' 
    | 'telegram_message' 
    | 'whatsapp_message';
  
  title: string;
  description?: string | null;
  content?: string | null;
  metadata?: Record<string, any> | null;
  performed_by?: string | null;
  
  created_at: string;
  activity_date: string;
  
  // Joined fields
  performed_by_name?: string;
}

export interface KanbanColumn {
  id: string;
  name: string;
  color: string;
  order_index: number;
  deals: Deal[];
  probability: number;
  deal_count: number;
  total_value: number;
}

export interface DealFormData {
  name: string;
  contact_id: string;
  value: number;
  currency: string;
  stage_id: string;
  expected_close_date?: string;
  description?: string;
  probability?: number;
}

export interface ContactFormData {
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  job_title?: string;
  type?: Contact['type'];
  source?: Contact['source'];
  assigned_to?: string;
  notes?: string;
  tags?: string[];
}
