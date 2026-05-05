// Tipos para API REST y Marketplace - Fase 8

// API Keys
export interface ApiKey {
  id: string;
  name: string;
  description?: string;
  
  key_hash: string;
  key_prefix: string;
  
  agent_id?: string;
  
  scopes: string[]; // ['read:contacts', 'write:deals', 'admin:*']
  
  rate_limit_per_minute: number;
  rate_limit_per_hour: number;
  rate_limit_per_day: number;
  
  last_used_at?: string;
  request_count_total: number;
  request_count_this_month: number;
  
  is_active: boolean;
  expires_at?: string;
  
  allowed_ips: string[];
  
  created_at: string;
  updated_at: string;
  created_by?: string;
  
  // Joined
  agent_name?: string;
  created_by_name?: string;
  
  // UI only - se muestra una sola vez al crear
  plain_key?: string;
}

// API Request Logs
export interface ApiRequestLog {
  id: string;
  api_key_id?: string;
  
  method: string;
  path: string;
  query_params?: Record<string, any>;
  
  status_code?: number;
  response_time_ms?: number;
  
  request_body?: string;
  response_body?: string;
  
  ip_address?: string;
  user_agent?: string;
  
  error_message?: string;
  error_stack?: string;
  
  created_at: string;
  
  // Joined
  api_key_name?: string;
}

// Webhooks
export interface Webhook {
  id: string;
  name: string;
  description?: string;
  
  endpoint_url: string;
  secret?: string;
  
  events: string[]; // ['contact.created', 'deal.won']
  
  is_active: boolean;
  
  retry_count: number;
  retry_interval_seconds: number;
  
  last_triggered_at?: string;
  last_response_status?: number;
  last_error?: string;
  
  success_count: number;
  failure_count: number;
  
  created_by?: string;
  created_at: string;
  updated_at: string;
  
  // Joined
  created_by_name?: string;
  delivery_success_rate?: number;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  
  event_type: string;
  payload: Record<string, any>;
  
  request_body?: Record<string, any>;
  response_status?: number;
  response_body?: string;
  
  attempt_number: number;
  delivered_at?: string;
  
  error_message?: string;
  
  created_at: string;
  
  // Joined
  webhook_name?: string;
}

// Integraciones (Marketplace)
export interface Integration {
  id: string;
  name: string;
  slug: string;
  description?: string;
  short_description?: string;
  
  category: 
    | 'communication' 
    | 'email' 
    | 'calendar' 
    | 'payment' 
    | 'accounting' 
    | 'storage' 
    | 'social' 
    | 'automation' 
    | 'analytics' 
    | 'crm' 
    | 'custom';
  
  provider_name: string;
  provider_website?: string;
  provider_logo_url?: string;
  
  integration_type: 'oauth' | 'api_key' | 'webhook' | 'iframe';
  
  oauth_authorize_url?: string;
  oauth_token_url?: string;
  oauth_scopes: string[];
  
  config_fields: IntegrationConfigField[];
  
  documentation_url?: string;
  setup_instructions?: string;
  
  featured_order?: number;
  rating_average?: number;
  rating_count: number;
  install_count: number;
  
  is_free: boolean;
  price_monthly?: number;
  price_yearly?: number;
  
  status: 'pending' | 'active' | 'deprecated' | 'removed';
  
  version: string;
  min_crm_version?: string;
  
  created_by?: string;
  created_at: string;
  updated_at: string;
  
  // Joined
  created_by_name?: string;
  is_installed?: boolean;
  install_status?: string;
}

export interface IntegrationConfigField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'password';
  required: boolean;
  label: string;
  description?: string;
  options?: { value: string; label: string }[];
  default?: any;
}

export interface IntegrationInstall {
  id: string;
  integration_id: string;
  installed_by?: string;
  
  config: Record<string, any>;
  config_encrypted?: string;
  
  access_token_encrypted?: string;
  refresh_token_encrypted?: string;
  token_expires_at?: string;
  
  status: 'active' | 'paused' | 'error' | 'uninstalled';
  last_error?: string;
  last_sync_at?: string;
  
  webhook_id?: string;
  
  installed_at: string;
  uninstalled_at?: string;
  updated_at: string;
  
  // Joined
  integration_name?: string;
  integration_logo?: string;
  installed_by_name?: string;
}

// System Events
export interface SystemEvent {
  id: string;
  event_type: string;
  
  entity_type: string;
  entity_id: string;
  
  payload: Record<string, any>;
  
  triggered_by?: string;
  source: 'api' | 'webhook' | 'ui' | 'integration' | 'system';
  
  processed: boolean;
  processed_at?: string;
  
  created_at: string;
  
  // Joined
  triggered_by_name?: string;
}

// API Usage Stats
export interface ApiUsageStats {
  api_key_id: string;
  total_requests: number;
  successful_requests: number;
  error_requests: number;
  avg_response_time: number;
  max_response_time: number;
  first_request_at?: string;
  last_request_at?: string;
  
  // Joined
  api_key_name?: string;
}

export interface ApiEndpointUsage {
  path: string;
  method: string;
  request_count: number;
  unique_keys: number;
  avg_response_time: number;
  success_count: number;
  error_count: number;
}

// Formularios
export interface ApiKeyFormData {
  name: string;
  description?: string;
  scopes: string[];
  expires_at?: string;
  rate_limit_per_minute?: number;
  rate_limit_per_hour?: number;
  rate_limit_per_day?: number;
  allowed_ips?: string[];
}

export interface WebhookFormData {
  name: string;
  description?: string;
  endpoint_url: string;
  secret?: string;
  events: string[];
  retry_count?: number;
  retry_interval_seconds?: number;
}

export interface IntegrationInstallForm {
  config: Record<string, any>;
}

// Filtros
export interface ApiLogFilter {
  api_key_id?: string;
  method?: string;
  path?: string;
  status_code?: number;
  date_from?: string;
  date_to?: string;
  error_only?: boolean;
}

export interface IntegrationFilter {
  category?: Integration['category'];
  status?: string;
  is_free?: boolean;
  featured_only?: boolean;
  search?: string;
}

// Categorías para UI
export const INTEGRATION_CATEGORIES = {
  communication: { label: 'Comunicación', icon: 'MessageSquare' },
  email: { label: 'Email', icon: 'Mail' },
  calendar: { label: 'Calendario', icon: 'Calendar' },
  payment: { label: 'Pagos', icon: 'CreditCard' },
  accounting: { label: 'Contabilidad', icon: 'Calculator' },
  storage: { label: 'Almacenamiento', icon: 'HardDrive' },
  social: { label: 'Redes Sociales', icon: 'Share2' },
  automation: { label: 'Automatización', icon: 'Zap' },
  analytics: { label: 'Analytics', icon: 'BarChart' },
  crm: { label: 'CRM', icon: 'Users' },
  custom: { label: 'Personalizado', icon: 'Settings' }
};
