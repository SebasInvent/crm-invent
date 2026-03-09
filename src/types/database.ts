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
}

export interface EmailLog {
  id: string;
  client_id: string;
  to_email: string;
  subject: string;
  status: 'sent' | 'failed' | 'pending';
  sent_at: string;
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
    };
  };
};
