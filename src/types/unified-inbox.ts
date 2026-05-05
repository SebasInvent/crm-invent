// Tipos para Unified Inbox - Hub de Comunicaciones

export type ChannelType = 'email' | 'whatsapp' | 'telegram' | 'instagram' | 'facebook' | 'webchat' | 'sms' | 'phone' | 'linkedin' | 'twitter' | 'other';
export type MessageDirection = 'inbound' | 'outbound' | 'internal';
export type MessageStatus = 'received' | 'delivered' | 'read' | 'sent' | 'failed' | 'pending' | 'archived' | 'spam' | 'flagged';
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact' | 'template' | 'interactive';
export type ConversationStatus = 'active' | 'archived' | 'spam' | 'closed';
export type ChannelStatus = 'active' | 'inactive' | 'error' | 'pending_setup';

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  config?: Record<string, any>;
  credentials_encrypted?: string;
  status: ChannelStatus;
  last_error?: string;
  last_sync_at?: string;
  webhook_url?: string;
  webhook_secret?: string;
  business_hours?: Record<string, { start: string; end: string } | null>;
  timezone: string;
  auto_reply_enabled: boolean;
  auto_reply_message?: string;
  auto_reply_outside_hours: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
  
  // Computed
  unread_count?: number;
  message_count?: number;
}

export interface UnifiedMessage {
  id: string;
  channel_id?: string;
  channel_type: ChannelType;
  conversation_id?: string;
  thread_id?: string;
  direction: MessageDirection;
  
  contact_id?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  
  external_message_id?: string;
  external_sender_id?: string;
  external_sender_name?: string;
  
  message_type: MessageType;
  content: string;
  content_html?: string;
  
  media_urls?: string[];
  media_captions?: string[];
  
  metadata?: Record<string, any>;
  
  status: MessageStatus;
  
  assigned_to?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags: string[];
  
  reply_to_message_id?: string;
  
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  received_at: string;
  created_at: string;
  updated_at: string;
  
  // Joined fields
  channel_name?: string;
  contact_first_name?: string;
  contact_last_name?: string;
  contact_company?: string;
  assigned_to_name?: string;
  reply_to_content?: string;
}

export interface Conversation {
  id: string;
  contact_id?: string;
  channel_id?: string;
  thread_id?: string;
  
  subject?: string;
  summary?: string;
  
  status: ConversationStatus;
  
  last_message_at?: string;
  last_message_preview?: string;
  last_message_direction?: MessageDirection;
  
  message_count: number;
  unread_count: number;
  
  assigned_to?: string;
  
  tags: string[];
  source_url?: string;
  
  created_at: string;
  updated_at: string;
  
  // Joined fields
  contact_first_name?: string;
  contact_last_name?: string;
  contact_email?: string;
  contact_company?: string;
  contact_lead_score?: number;
  channel_name?: string;
  channel_type?: ChannelType;
  assigned_to_name?: string;
  ui_status?: 'unread' | 'active' | 'closed';
}

export interface MessageTemplate {
  id: string;
  name: string;
  description?: string;
  
  channel_types: ChannelType[];
  category: 'general' | 'greeting' | 'follow_up' | 'closing' | 'support' | 'sales' | 'marketing';
  
  subject?: string;
  content: string;
  content_html?: string;
  
  variables: TemplateVariable[];
  
  is_active: boolean;
  is_system: boolean;
  requires_approval: boolean;
  
  usage_count: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  required: boolean;
  default?: string;
  description?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  
  is_active: boolean;
  priority: number;
  
  trigger_count: number;
  
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AutomationCondition {
  field: string;
  operator: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'regex' | 'in' | 'greater_than' | 'less_than';
  value: any;
}

export interface AutomationAction {
  type: 'assign_agent' | 'send_template' | 'add_tag' | 'remove_tag' | 'set_priority' | 'move_to_pipeline' | 'webhook' | 'notify';
  params: Record<string, any>;
}

export interface SendMessageData {
  conversation_id?: string;
  contact_id?: string;
  channel_id?: string;
  content: string;
  message_type?: MessageType;
  media_urls?: string[];
  template_id?: string;
  template_variables?: Record<string, string>;
  reply_to_message_id?: string;
}

export interface ConversationFilter {
  channel_type?: ChannelType;
  channel_id?: string;
  assigned_to?: string;
  status?: ConversationStatus;
  tags?: string[];
  priority?: string;
  search?: string;
  unread_only?: boolean;
  date_from?: string;
  date_to?: string;
}

export interface ChannelStats {
  channel_id: string;
  channel_name: string;
  channel_type: ChannelType;
  total_messages: number;
  unread_messages: number;
  conversations_count: number;
  avg_response_time?: number;
  last_message_at?: string;
}
