-- ============================================
-- TABLAS DE LEAD MANAGEMENT (Metodología Jung)
-- ============================================

-- Tabla de Leads
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  job_title TEXT,
  
  -- Arquetipo Jung (segmentación psicológica)
  jung_archetype TEXT CHECK (jung_archetype IN (
    'hero_entrepreneur',      -- Emprendedor visionario
    'sage_conservative',       -- Empresario conservador
    'caregiver_stressed',    -- Director de marketing estresado
    'artist_specialist',     -- Especialista independiente
    'ruler_executive',       -- Ejecutivo results-driven
    'explorer_merchant'      -- Comerciante digital ambicioso
  )),
  
  -- Categorización BANT
  budget_level TEXT CHECK (budget_level IN ('high', 'medium', 'low')),
  authority_level TEXT CHECK (authority_level IN ('decision_maker', 'influencer', 'user')),
  need_urgency TEXT CHECK (need_urgency IN ('critical', 'high', 'medium', 'low')),
  timeline TEXT CHECK (timeline IN ('immediate', 'short_term', 'medium_term', 'long_term')),
  
  -- Scoring y priorización
  lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  lead_status TEXT DEFAULT 'cold' CHECK (lead_status IN ('hot', 'warm', 'cold', 'dead', 'converted')),
  priority TEXT DEFAULT 'low' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  
  -- Información de la fuente
  source TEXT DEFAULT 'other' CHECK (source IN (
    'scraped', 'web_form', 'referral', 'linkedin', 'event', 
    'cold_outreach', 'telegram', 'openclaw', 'other'
  )),
  source_url TEXT,
  source_platform TEXT CHECK (source_platform IN (
    'linkedin', 'instagram', 'google_business', 'mercado_libre', 
    'rappi', 'website', 'google_maps', 'directory'
  )),
  
  -- Datos de la empresa/industria
  industry TEXT,
  company_size TEXT CHECK (company_size IN ('startup', 'small', 'medium', 'large', 'enterprise')),
  annual_revenue DECIMAL(12,2),
  location TEXT,
  website TEXT,
  linkedin_url TEXT,
  
  -- Metadatos del scraping
  scraped_data JSONB,
  
  -- Comunicación y seguimiento
  last_contact_date TIMESTAMP WITH TIME ZONE,
  next_follow_up_date TIMESTAMP WITH TIME ZONE,
  contact_attempts INTEGER DEFAULT 0,
  communication_channel TEXT CHECK (communication_channel IN ('email', 'linkedin', 'whatsapp', 'phone')),
  assigned_to UUID REFERENCES agents(id),
  
  -- Conversión
  converted_to_client_id UUID REFERENCES clients(id),
  converted_at TIMESTAMP WITH TIME ZONE,
  conversion_value DECIMAL(10,2),
  
  -- Tags y categorización
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  
  -- GDPR/Consentimiento
  consent_status TEXT CHECK (consent_status IN ('granted', 'pending', 'denied')),
  consent_date TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de Interacciones con Leads
CREATE TABLE lead_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id),
  interaction_type TEXT NOT NULL CHECK (interaction_type IN (
    'email_sent', 'email_opened', 'email_replied',
    'linkedin_message', 'linkedin_view',
    'call_made', 'call_received',
    'whatsapp_sent',
    'meeting_scheduled', 'meeting_completed',
    'website_visit', 'content_download'
  )),
  content TEXT,
  metadata JSONB,
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ÍNDICES PARA LEADS
-- ============================================

CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_archetype ON leads(jung_archetype);
CREATE INDEX idx_leads_score ON leads(lead_score DESC);
CREATE INDEX idx_leads_status ON leads(lead_status);
CREATE INDEX idx_leads_priority ON leads(priority);
CREATE INDEX idx_leads_source ON leads(source);
CREATE INDEX idx_leads_industry ON leads(industry);
CREATE INDEX idx_leads_company ON leads(company);
CREATE INDEX idx_leads_assigned ON leads(assigned_to);
CREATE INDEX idx_leads_follow_up ON leads(next_follow_up_date);
CREATE INDEX idx_leads_converted ON leads(converted_to_client_id);
CREATE INDEX idx_leads_created ON leads(created_at);

CREATE INDEX idx_interactions_lead ON lead_interactions(lead_id);
CREATE INDEX idx_interactions_type ON lead_interactions(interaction_type);
CREATE INDEX idx_interactions_created ON lead_interactions(created_at);

-- ============================================
-- FUNCIONES DE ACTUALIZACIÓN AUTOMÁTICA
-- ============================================

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para actualizar updated_at
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- POLÍTICAS RLS
-- ============================================

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_all_leads ON leads FOR ALL USING (true);
CREATE POLICY allow_all_interactions ON lead_interactions FOR ALL USING (true);

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista de leads activos con scoring
CREATE VIEW active_leads AS
SELECT 
  l.*,
  COALESCE(a.name, 'Sin asignar') as assigned_agent_name,
  COUNT(li.id) as total_interactions
FROM leads l
LEFT JOIN agents a ON l.assigned_to = a.id
LEFT JOIN lead_interactions li ON l.id = li.lead_id
WHERE l.lead_status NOT IN ('dead', 'converted')
GROUP BY l.id, a.name
ORDER BY l.lead_score DESC;

-- Vista de leads por arquetipo
CREATE VIEW leads_by_archetype AS
SELECT 
  jung_archetype,
  COUNT(*) as total_leads,
  AVG(lead_score) as avg_score,
  COUNT(CASE WHEN lead_status = 'hot' THEN 1 END) as hot_count,
  COUNT(CASE WHEN lead_status = 'converted' THEN 1 END) as converted_count
FROM leads
WHERE jung_archetype IS NOT NULL
GROUP BY jung_archetype;
