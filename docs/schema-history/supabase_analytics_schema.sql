-- CRM Fase 7: Analytics e Inteligencia con AI/ML
-- Schema para métricas, KPIs y ML predictions

-- ============================================
-- MÉTRICAS DIARIAS (Time-series data)
-- ============================================

CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  date DATE NOT NULL,
  
  -- Contactos y Leads
  new_contacts INTEGER DEFAULT 0,
  new_leads INTEGER DEFAULT 0,
  converted_leads INTEGER DEFAULT 0,
  
  -- Deals
  new_deals INTEGER DEFAULT 0,
  deals_won INTEGER DEFAULT 0,
  deals_lost INTEGER DEFAULT 0,
  deals_value_won DECIMAL(12,2) DEFAULT 0,
  
  -- Proyectos
  new_projects INTEGER DEFAULT 0,
  projects_completed INTEGER DEFAULT 0,
  hours_logged DECIMAL(8,2) DEFAULT 0,
  
  -- Finanzas
  invoices_issued INTEGER DEFAULT 0,
  revenue DECIMAL(12,2) DEFAULT 0,
  payments_received DECIMAL(12,2) DEFAULT 0,
  
  -- Comunicaciones
  messages_received INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  conversations_started INTEGER DEFAULT 0,
  
  -- Portal
  portal_logins INTEGER DEFAULT 0,
  documents_downloaded INTEGER DEFAULT 0,
  quotes_approved INTEGER DEFAULT 0,
  
  -- Calculados
  conversion_rate DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN new_leads > 0 THEN (converted_leads::DECIMAL / new_leads * 100) ELSE 0 END
  ) STORED,
  
  avg_deal_value DECIMAL(12,2) GENERATED ALWAYS AS (
    CASE WHEN deals_won > 0 THEN (deals_value_won / deals_won) ELSE 0 END
  ) STORED,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(date)
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics(date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date_range ON daily_metrics(date) 
  WHERE date >= CURRENT_DATE - INTERVAL '90 days';

-- ============================================
-- PREDICCIONES ML
-- ============================================

CREATE TABLE IF NOT EXISTS ml_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tipo de predicción
  prediction_type TEXT NOT NULL CHECK (prediction_type IN (
    'deal_win_probability',
    'lead_conversion_probability',
    'churn_risk',
    'revenue_forecast',
    'project_delay_risk',
    'optimal_contact_time',
    'customer_lifetime_value',
    'next_best_action'
  )),
  
  -- Entidad relacionada
  entity_type TEXT NOT NULL, -- 'deal', 'contact', 'project', 'global'
  entity_id UUID,
  
  -- Valor de la predicción
  predicted_value DECIMAL(10,4),
  confidence_score DECIMAL(5,2), -- 0-100
  
  -- Features usadas (para debugging)
  features_used JSONB,
  
  -- Interpretación
  explanation TEXT,
  
  -- Estado
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'validated', 'incorrect', 'expired')),
  
  -- Feedback (si el usuario validó/corregió)
  actual_value DECIMAL(10,4),
  validated_at TIMESTAMP WITH TIME ZONE,
  validated_by UUID REFERENCES agents(id),
  
  -- Fechas
  prediction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  valid_until TIMESTAMP WITH TIME ZONE,
  
  model_version TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_predictions_type ON ml_predictions(prediction_type);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_entity ON ml_predictions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_date ON ml_predictions(prediction_date DESC);
CREATE INDEX IF NOT EXISTS idx_ml_predictions_status ON ml_predictions(status);

-- ============================================
-- INSIGHTS AUTOMÁTICOS
-- ============================================

CREATE TABLE IF NOT EXISTS automated_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Categoría del insight
  category TEXT NOT NULL CHECK (category IN (
    'sales_trend',
    'anomaly_detected',
    'performance_alert',
    'opportunity_spotted',
    'risk_warning',
    'efficiency_tip',
    'customer_behavior',
    'competitor_activity'
  )),
  
  -- Severidad
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical', 'positive')),
  
  -- Título y descripción
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  
  -- Métricas relacionadas
  metric_name TEXT,
  metric_value DECIMAL(12,2),
  metric_change_percentage DECIMAL(8,2),
  
  -- Entidades afectadas
  affected_entity_type TEXT,
  affected_entity_ids UUID[],
  
  -- Acción recomendada
  recommended_action TEXT,
  action_taken BOOLEAN DEFAULT false,
  action_taken_by UUID REFERENCES agents(id),
  action_taken_at TIMESTAMP WITH TIME ZONE,
  
  -- Si fue visto/descartado
  dismissed BOOLEAN DEFAULT false,
  dismissed_by UUID REFERENCES agents(id),
  dismissed_at TIMESTAMP WITH TIME ZONE,
  
  -- ML-generated o Rule-based
  generated_by TEXT DEFAULT 'rule' CHECK (generated_by IN ('rule', 'ml_model', 'hybrid')),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insights_category ON automated_insights(category);
CREATE INDEX IF NOT EXISTS idx_insights_severity ON automated_insights(severity);
CREATE INDEX IF NOT EXISTS idx_insights_created ON automated_insights(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insights_dismissed ON automated_insights(dismissed) WHERE dismissed = false;

-- ============================================
-- REPORTES GUARDADOS
-- ============================================

CREATE TABLE IF NOT EXISTS saved_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Tipo y configuración
  report_type TEXT NOT NULL CHECK (report_type IN (
    'sales_performance',
    'revenue_analysis',
    'pipeline_health',
    'team_performance',
    'customer_acquisition',
    'custom'
  )),
  
  -- Configuración JSON
  config JSONB NOT NULL DEFAULT '{}',
  
  -- Filtros aplicados
  filters JSONB DEFAULT '{}',
  
  -- Schedule automático
  is_scheduled BOOLEAN DEFAULT false,
  schedule_frequency TEXT CHECK (schedule_frequency IN ('daily', 'weekly', 'monthly', 'quarterly')),
  last_sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Visualización preferida
  chart_type TEXT DEFAULT 'line' CHECK (chart_type IN ('line', 'bar', 'pie', 'table', 'mixed')),
  
  created_by UUID REFERENCES agents(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_type ON saved_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_saved_reports_created_by ON saved_reports(created_by);

-- ============================================
-- VISTAS ANALÍTICAS
-- ============================================

-- Vista de resumen de pipeline
CREATE OR REPLACE VIEW pipeline_analytics_view AS
SELECT 
  ps.id as stage_id,
  ps.name as stage_name,
  ps.order_index,
  ps.color,
  ps.default_probability,
  
  COUNT(d.id) as deals_count,
  SUM(d.value) as total_value,
  AVG(d.value) as avg_value,
  AVG(d.probability) as avg_probability,
  
  -- Deals nuevos esta semana
  COUNT(CASE WHEN d.created_at >= date_trunc('week', CURRENT_DATE) THEN 1 END) as new_this_week,
  
  -- Deals movidos a esta etapa esta semana
  COUNT(CASE WHEN d.updated_at >= date_trunc('week', CURRENT_DATE) THEN 1 END) as updated_this_week

FROM pipeline_stages ps
LEFT JOIN deals d ON d.stage_id = ps.id AND d.status = 'open'
WHERE ps.is_active = true
GROUP BY ps.id, ps.name, ps.order_index, ps.color, ps.default_probability
ORDER BY ps.order_index;

-- Vista de performance de agentes
CREATE OR REPLACE VIEW agent_performance_view AS
SELECT 
  a.id as agent_id,
  a.name as agent_name,
  a.email as agent_email,
  
  -- Deals
  COUNT(DISTINCT d.id) as total_deals,
  COUNT(DISTINCT CASE WHEN d.status = 'won' THEN d.id END) as won_deals,
  COUNT(DISTINCT CASE WHEN d.status = 'lost' THEN d.id END) as lost_deals,
  COALESCE(SUM(CASE WHEN d.status = 'won' THEN d.value END), 0) as revenue_won,
  
  -- Tasa de conversión
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN d.status IN ('won', 'lost') THEN d.id END) > 0 
    THEN COUNT(DISTINCT CASE WHEN d.status = 'won' THEN d.id END)::DECIMAL / 
         COUNT(DISTINCT CASE WHEN d.status IN ('won', 'lost') THEN d.id END) * 100
    ELSE 0 
  END as win_rate,
  
  -- Cotizaciones
  COUNT(DISTINCT q.id) as quotes_sent,
  COUNT(DISTINCT CASE WHEN q.status IN ('accepted', 'converted') THEN q.id END) as quotes_accepted,
  
  -- Tiempo
  COALESCE(SUM(te.duration_minutes), 0)/60 as hours_logged,
  
  -- Tareas
  COUNT(DISTINCT t.id) as assigned_tasks,
  COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks

FROM agents a
LEFT JOIN deals d ON d.assigned_to = a.id
LEFT JOIN quotes q ON q.agent_id = a.id
LEFT JOIN time_entries te ON te.agent_id = a.id AND te.created_at >= date_trunc('month', CURRENT_DATE)
LEFT JOIN tasks t ON t.assigned_to = a.id AND t.deleted_at IS NULL
GROUP BY a.id, a.name, a.email;

-- Vista de cohorte de clientes
CREATE OR REPLACE VIEW customer_cohort_view AS
WITH first_contact AS (
  SELECT 
    contact_id,
    MIN(created_at) as first_deal_date,
    MIN(CASE WHEN status = 'won' THEN created_at END) as first_won_date
  FROM deals
  GROUP BY contact_id
)
SELECT 
  date_trunc('month', fc.first_deal_date) as cohort_month,
  COUNT(DISTINCT fc.contact_id) as new_contacts,
  COUNT(DISTINCT fc.first_won_date) as converted_in_month,
  
  -- Revenue por cohorte
  COALESCE(SUM(d.value), 0) as total_revenue

FROM first_contact fc
LEFT JOIN deals d ON d.contact_id = fc.contact_id AND d.status = 'won'
GROUP BY date_trunc('month', fc.first_deal_date)
ORDER BY cohort_month DESC;

-- ============================================
-- FUNCIONES AUXILIARES
-- ============================================

-- Función para calcular métricas de un período
CREATE OR REPLACE FUNCTION calculate_period_metrics(
  start_date DATE,
  end_date DATE
)
RETURNS TABLE (
  metric_name TEXT,
  current_value DECIMAL(12,2),
  previous_value DECIMAL(12,2),
  change_percentage DECIMAL(8,2)
) AS $$
BEGIN
  RETURN QUERY
  WITH current_period AS (
    SELECT 
      SUM(new_contacts) as contacts,
      SUM(new_deals) as deals,
      SUM(deals_value_won) as revenue,
      SUM(new_leads) as leads,
      SUM(converted_leads) as conversions
    FROM daily_metrics
    WHERE date BETWEEN start_date AND end_date
  ),
  previous_period AS (
    SELECT 
      SUM(new_contacts) as contacts,
      SUM(new_deals) as deals,
      SUM(deals_value_won) as revenue,
      SUM(new_leads) as leads,
      SUM(converted_leads) as conversions
    FROM daily_metrics
    WHERE date BETWEEN (start_date - (end_date - start_date)) AND (start_date - INTERVAL '1 day')
  )
  SELECT 
    'contacts'::TEXT,
    COALESCE(cp.contacts, 0)::DECIMAL(12,2),
    COALESCE(pp.contacts, 0)::DECIMAL(12,2),
    CASE WHEN pp.contacts > 0 THEN ((cp.contacts - pp.contacts)::DECIMAL / pp.contacts * 100)::DECIMAL(8,2) ELSE 0 END
  FROM current_period cp, previous_period pp
  
  UNION ALL
  
  SELECT 
    'deals',
    COALESCE(cp.deals, 0),
    COALESCE(pp.deals, 0),
    CASE WHEN pp.deals > 0 THEN ((cp.deals - pp.deals)::DECIMAL / pp.deals * 100)::DECIMAL(8,2) ELSE 0 END
  FROM current_period cp, previous_period pp
  
  UNION ALL
  
  SELECT 
    'revenue',
    COALESCE(cp.revenue, 0),
    COALESCE(pp.revenue, 0),
    CASE WHEN pp.revenue > 0 THEN ((cp.revenue - pp.revenue)::DECIMAL / pp.revenue * 100)::DECIMAL(8,2) ELSE 0 END
  FROM current_period cp, previous_period pp;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS
-- ============================================

ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE automated_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_daily_metrics ON daily_metrics;
CREATE POLICY allow_all_daily_metrics ON daily_metrics FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_ml_predictions ON ml_predictions;
CREATE POLICY allow_all_ml_predictions ON ml_predictions FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_insights ON automated_insights;
CREATE POLICY allow_all_insights ON automated_insights FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_saved_reports ON saved_reports;
CREATE POLICY allow_all_saved_reports ON saved_reports FOR ALL USING (true);

-- ============================================
-- DATOS INICIALES - MÉTRICAS DEMO
-- ============================================

-- Generar 30 días de métricas de ejemplo
INSERT INTO daily_metrics (
  date, new_contacts, new_leads, converted_leads, 
  new_deals, deals_won, deals_lost, deals_value_won,
  invoices_issued, revenue, messages_received, messages_sent
)
SELECT 
  CURRENT_DATE - i,
  floor(random() * 5 + 1)::INTEGER, -- 1-6 nuevos contactos
  floor(random() * 3 + 1)::INTEGER, -- 1-4 nuevos leads
  floor(random() * 2)::INTEGER, -- 0-2 conversiones
  floor(random() * 3)::INTEGER, -- 0-3 nuevos deals
  floor(random() * 2)::INTEGER, -- 0-2 deals ganados
  floor(random() * 1)::INTEGER, -- 0-1 deals perdidos
  (random() * 5000 + 1000)::DECIMAL(12,2), -- $1000-6000 en deals
  floor(random() * 2 + 1)::INTEGER, -- 1-3 facturas
  (random() * 8000 + 2000)::DECIMAL(12,2), -- $2000-10000 revenue
  floor(random() * 20 + 5)::INTEGER, -- 5-25 mensajes recibidos
  floor(random() * 15 + 5)::INTEGER -- 5-20 mensajes enviados
FROM generate_series(0, 29) as i
ON CONFLICT (date) DO NOTHING;
