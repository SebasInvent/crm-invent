// Tipos para Módulo de Finanzas - Fase 5

// Productos/Servicios
export interface Product {
  id: string;
  name: string;
  description?: string;
  type: 'product' | 'service' | 'subscription' | 'bundle';
  category?: string;
  
  unit_price: number;
  cost_price?: number;
  currency: string;
  
  tax_rate: number;
  tax_inclusive: boolean;
  
  is_recurring: boolean;
  recurring_interval?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  
  track_inventory: boolean;
  stock_quantity: number;
  low_stock_threshold: number;
  
  is_active: boolean;
  
  created_at: string;
  updated_at: string;
}

// Quotes / Cotizaciones
export interface Quote {
  id: string;
  quote_number: string;
  
  contact_id?: string;
  deal_id?: string;
  project_id?: string;
  agent_id?: string;
  
  // Snapshot cliente
  client_name?: string;
  client_email?: string;
  client_company?: string;
  client_tax_id?: string;
  
  // Totales
  subtotal: number;
  discount_amount: number;
  discount_percentage: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  
  valid_until?: string;
  
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired' | 'converted' | 'cancelled';
  
  notes?: string;
  terms_and_conditions?: string;
  
  converted_to_deal_id?: string;
  converted_to_project_id?: string;
  converted_at?: string;
  
  template_id?: string;
  
  created_at: string;
  updated_at: string;
  
  // Joined
  contact_first_name?: string;
  contact_last_name?: string;
  contact_email?: string;
  contact_company?: string;
  agent_name?: string;
  item_count?: number;
  total_quantity?: number;
}

export interface QuoteLineItem {
  id: string;
  quote_id: string;
  product_id?: string;
  
  description: string;
  
  quantity: number;
  unit_price: number;
  
  discount_percentage: number;
  discount_amount: number;
  
  tax_rate: number;
  tax_amount: number;
  
  line_total: number;
  order_index: number;
  
  created_at: string;
  
  // Joined
  product_name?: string;
}

// Facturas
export interface Invoice {
  id: string;
  invoice_number: string;
  series: string;
  
  contact_id?: string;
  quote_id?: string;
  project_id?: string;
  deal_id?: string;
  agent_id?: string;
  
  // Snapshot cliente
  client_name?: string;
  client_email?: string;
  client_company?: string;
  client_address?: string;
  client_tax_id?: string;
  
  // Totales
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  
  // Fechas
  issue_date: string;
  due_date?: string;
  paid_date?: string;
  
  status: 'draft' | 'sent' | 'viewed' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled' | 'refunded' | 'void';
  
  payment_method?: string;
  payment_reference?: string;
  
  // Recurrencia
  is_recurring: boolean;
  parent_invoice_id?: string;
  subscription_id?: string;
  
  notes?: string;
  terms?: string;
  footer_notes?: string;
  
  sent_at?: string;
  sent_count: number;
  
  created_at: string;
  updated_at: string;
  
  // Joined
  contact_first_name?: string;
  contact_last_name?: string;
  contact_email?: string;
  contact_company?: string;
  agent_name?: string;
  item_count?: number;
  balance_due?: number;
}

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  product_id?: string;
  time_entry_id?: string;
  
  description: string;
  
  quantity: number;
  unit_price: number;
  unit?: string;
  
  discount_percentage: number;
  tax_rate: number;
  tax_amount: number;
  
  line_total: number;
  order_index: number;
  
  created_at: string;
  
  // Joined
  product_name?: string;
}

// Suscripciones
export interface Subscription {
  id: string;
  contact_id?: string;
  product_id?: string;
  
  plan_name: string;
  description?: string;
  
  amount: number;
  currency: string;
  
  billing_interval: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  billing_day?: number;
  
  start_date: string;
  end_date?: string;
  next_billing_date: string;
  last_billing_date?: string;
  
  status: 'active' | 'paused' | 'cancelled' | 'expired' | 'trial';
  
  cancelled_at?: string;
  cancellation_reason?: string;
  
  max_billings?: number;
  current_billing_count: number;
  
  payment_method_id?: string;
  
  created_at: string;
  updated_at: string;
  
  // Joined
  contact_first_name?: string;
  contact_last_name?: string;
  contact_email?: string;
  product_name?: string;
  days_until_billing?: number;
}

// Pagos
export interface Payment {
  id: string;
  invoice_id?: string;
  
  amount: number;
  currency: string;
  
  payment_method: 'cash' | 'check' | 'bank_transfer' | 'credit_card' | 'debit_card' | 'stripe' | 'paypal' | 'mercadopago' | 'wire_transfer' | 'other';
  
  transaction_id?: string;
  reference_number?: string;
  
  payment_date: string;
  
  notes?: string;
  
  gateway?: string;
  gateway_response?: Record<string, any>;
  
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  
  created_at: string;
  updated_at: string;
  
  // Joined
  invoice_number?: string;
  contact_name?: string;
}

// Formularios
export interface QuoteFormData {
  contact_id: string;
  deal_id?: string;
  valid_until?: string;
  notes?: string;
  terms_and_conditions?: string;
  line_items: QuoteLineItemFormData[];
  discount_percentage?: number;
}

export interface QuoteLineItemFormData {
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percentage?: number;
  tax_rate?: number;
}

export interface InvoiceFormData {
  contact_id: string;
  quote_id?: string;
  project_id?: string;
  due_date?: string;
  notes?: string;
  terms?: string;
  line_items: InvoiceLineItemFormData[];
}

export interface InvoiceLineItemFormData {
  product_id?: string;
  time_entry_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  unit?: string;
  discount_percentage?: number;
  tax_rate?: number;
}

// Filtros
export interface QuoteFilter {
  status?: string;
  contact_id?: string;
  agent_id?: string;
  date_from?: string;
  date_to?: string;
  valid_until_from?: string;
  valid_until_to?: string;
}

export interface InvoiceFilter {
  status?: string;
  contact_id?: string;
  date_from?: string;
  date_to?: string;
  due_date_from?: string;
  due_date_to?: string;
  overdue_only?: boolean;
}

// Estadísticas del dashboard
export interface FinanceDashboardStats {
  total_revenue_this_month: number;
  total_revenue_this_quarter: number;
  total_outstanding: number;
  total_overdue: number;
  
  quotes_pending: number;
  quotes_accepted_this_month: number;
  
  invoices_draft: number;
  invoices_sent: number;
  invoices_paid_this_month: number;
  
  active_subscriptions: number;
  monthly_recurring_revenue: number;
}
