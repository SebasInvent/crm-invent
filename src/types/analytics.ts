// Tipos para Analytics y ML - Fase 7

// Métricas Diarias
export interface DailyMetric {
  id: string;
  date: string;
  
  new_contacts: number;
  new_leads: number;
  converted_leads: number;
  
  new_deals: number;
  deals_won: number;
  deals_lost: number;
  deals_value_won: number;
  
  new_projects: number;
  projects_completed: number;
  hours_logged: number;
  
  invoices_issued: number;
  revenue: number;
  payments_received: number;
  
  messages_received: number;
  messages_sent: number;
  conversations_started: number;
  
  portal_logins: number;
  documents_downloaded: number;
  quotes_approved: number;
  
  // Calculados
  conversion_rate: number;
  avg_deal_value: number;
  
  created_at: string;
}

// Predicciones ML
export interface MLPrediction {
  id: string;
  prediction_type: 
    | 'deal_win_probability' 
    | 'lead_conversion_probability'
    | 'churn_risk'
    | 'revenue_forecast'
    | 'project_delay_risk'
    | 'optimal_contact_time'
    | 'customer_lifetime_value'
    | 'next_best_action';
  
  entity_type: string;
  entity_id?: string;
  
  predicted_value: number;
  confidence_score: number;
  
  features_used?: Record<string, any>;
  explanation?: string;
  
  status: 'active' | 'validated' | 'incorrect' | 'expired';
  
  actual_value?: number;
  validated_at?: string;
  validated_by?: string;
  
  prediction_date: string;
  valid_until?: string;
  
  model_version?: string;
  
  created_at: string;
  
  // Joined
  entity_name?: string;
  validated_by_name?: string;
}

// Insights Automáticos
export interface AutomatedInsight {
  id: string;
  
  category: 
    | 'sales_trend'
    | 'anomaly_detected'
    | 'performance_alert'
    | 'opportunity_spotted'
    | 'risk_warning'
    | 'efficiency_tip'
    | 'customer_behavior'
    | 'competitor_activity';
  
  severity: 'info' | 'warning' | 'critical' | 'positive';
  
  title: string;
  description: string;
  
  metric_name?: string;
  metric_value?: number;
  metric_change_percentage?: number;
  
  affected_entity_type?: string;
  affected_entity_ids?: string[];
  
  recommended_action?: string;
  action_taken: boolean;
  action_taken_by?: string;
  action_taken_at?: string;
  
  dismissed: boolean;
  dismissed_by?: string;
  dismissed_at?: string;
  
  generated_by: 'rule' | 'ml_model' | 'hybrid';
  
  created_at: string;
  
  // Joined
  action_taken_by_name?: string;
}

// Reportes Guardados
export interface SavedReport {
  id: string;
  name: string;
  description?: string;
  
  report_type: 
    | 'sales_performance'
    | 'revenue_analysis'
    | 'pipeline_health'
    | 'team_performance'
    | 'customer_acquisition'
    | 'custom';
  
  config: Record<string, any>;
  filters?: Record<string, any>;
  
  is_scheduled: boolean;
  schedule_frequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  last_sent_at?: string;
  
  chart_type: 'line' | 'bar' | 'pie' | 'table' | 'mixed';
  
  created_by?: string;
  created_at: string;
  updated_at: string;
  
  // Joined
  created_by_name?: string;
}

// Vistas Analíticas
export interface PipelineAnalytics {
  stage_id: string;
  stage_name: string;
  order_index: number;
  color: string;
  default_probability: number;
  
  deals_count: number;
  total_value: number;
  avg_value: number;
  avg_probability: number;
  new_this_week: number;
  updated_this_week: number;
}

export interface AgentPerformance {
  agent_id: string;
  agent_name: string;
  agent_email?: string;
  
  total_deals: number;
  won_deals: number;
  lost_deals: number;
  revenue_won: number;
  win_rate: number;
  
  quotes_sent: number;
  quotes_accepted: number;
  
  hours_logged: number;
  
  assigned_tasks: number;
  completed_tasks: number;
}

export interface CustomerCohort {
  cohort_month: string;
  new_contacts: number;
  converted_in_month: number;
  total_revenue: number;
}

// Dashboard Stats
export interface DashboardStats {
  // Contadores
  total_contacts: number;
  total_deals: number;
  total_projects: number;
  
  // Revenue
  revenue_this_month: number;
  revenue_last_month: number;
  revenue_change_percentage: number;
  
  // Deals
  deals_won_this_month: number;
  deals_lost_this_month: number;
  avg_deal_value: number;
  
  // Pipeline
  pipeline_value: number;
  
  // Conversión
  lead_conversion_rate: number;
  quote_acceptance_rate: number;
  
  // Actividad
  messages_this_week: number;
  hours_logged_this_week: number;
  
  // Tendencias (para charts)
  revenue_trend: { date: string; value: number }[];
  deals_trend: { date: string; value: number }[];
  leads_trend: { date: string; value: number }[];
}

// Filtros de Reportes
export interface ReportFilter {
  date_range?: 'today' | 'this_week' | 'this_month' | 'this_quarter' | 'this_year' | 'custom';
  date_from?: string;
  date_to?: string;
  agent_id?: string;
  contact_id?: string;
  project_id?: string;
  stage_id?: string;
}

// KPI Cards
export interface KPICard {
  title: string;
  value: number | string;
  change?: number;
  changeLabel?: string;
  icon: any;
  color: string;
}

// Chart Data
export interface ChartDataPoint {
  name: string;
  value: number;
  [key: string]: any;
}
