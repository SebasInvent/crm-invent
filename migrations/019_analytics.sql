-- 019_analytics.sql
--
-- Sprint 1I — Analytics. La página /dashboard/analytics consulta daily_metrics,
-- automated_insights y pipeline_analytics_view, ninguno en prod. Se construyen
-- como VISTAS que agregan datos REALES (deals, contactos, leads, mensajes), así
-- los gráficos muestran información de verdad sin job de agregación.
-- Idempotente.

-- ─── pipeline_analytics_view: deals por etapa del embudo invent-custom ──
CREATE OR REPLACE VIEW pipeline_analytics_view AS
SELECT
  s.id           AS stage_id,
  s.name         AS stage_name,
  s.color        AS color,
  s.order_index  AS order_index,
  COUNT(d.id)                  AS deals_count,
  COALESCE(SUM(d.value), 0)    AS total_value,
  COALESCE(AVG(d.value), 0)    AS avg_value
FROM pipeline_stages s
JOIN pipelines pl ON pl.id = s.pipeline_id
JOIN products p   ON p.id = pl.product_id AND p.slug = 'invent-custom'
LEFT JOIN deals d ON d.stage_id = s.id AND d.status = 'open'
GROUP BY s.id, s.name, s.color, s.order_index;

-- ─── daily_metrics: serie de 60 días con agregados reales ──────────
CREATE OR REPLACE VIEW daily_metrics AS
SELECT
  gs::date AS date,
  (SELECT COUNT(*)  FROM deals    WHERE status = 'won' AND updated_at::date = gs::date)            AS deals_won,
  COALESCE((SELECT SUM(value) FROM deals WHERE status = 'won' AND updated_at::date = gs::date), 0) AS revenue,
  (SELECT COUNT(*)  FROM contacts WHERE created_at::date = gs::date)                                AS new_contacts,
  (SELECT COUNT(*)  FROM leads    WHERE created_at::date = gs::date)                                AS new_leads,
  (SELECT COUNT(*)  FROM leads    WHERE lead_status = 'converted' AND updated_at::date = gs::date)  AS converted_leads,
  (SELECT COUNT(*)  FROM chat_messages WHERE direction = 'inbound'  AND created_at::date = gs::date) AS messages_received,
  (SELECT COUNT(*)  FROM chat_messages WHERE direction = 'outbound' AND created_at::date = gs::date) AS messages_sent
FROM generate_series(CURRENT_DATE - INTERVAL '60 days', CURRENT_DATE, INTERVAL '1 day') AS gs;

-- ─── automated_insights: tabla para insights (vacía por ahora) ─────
CREATE TABLE IF NOT EXISTS automated_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'opportunity_spotted',
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info','positive','warning','critical')),
  recommended_action TEXT,
  metadata JSONB DEFAULT '{}',
  dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE automated_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all_automated_insights ON automated_insights;
CREATE POLICY allow_all_automated_insights ON automated_insights FOR ALL USING (true);
