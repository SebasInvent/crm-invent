# Integración OpenClaw ↔ CRM: Estructura de Oportunidades

## 📊 Diagrama de Estructura

```
┌─────────────────────────────────────────────────────────────────┐
│                         OPPORTUNITY FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   OPENCLAW                    WEBHOOK                    CRM    │
│   ─────────                  ───────                   ───    │
│                                                                 │
│   Conversation                                                │
│   ├─ client.name       ───────┐                              │
│   ├─ client.email      ───────┼──►  contacts                 │
│   ├─ client.phone      ───────┤      ├─ first_name         │
│   └─ client.company    ───────┘      ├─ email               │
│                                        └─ company_name       │
│   Opportunity                                                 │
│   ├─ title             ───────┐                              │
│   ├─ description       ───────┼──►  deals                    │
│   ├─ value             ───────┤      ├─ name               │
│   ├─ stage             ───────┤      ├─ description        │
│   ├─ status            ───────┤      ├─ value              │
│   ├─ tags              ───────┤      ├─ stage_id           │
│   └─ metadata          ───────┘      ├─ status             │
│                                        ├─ source='openclaw' │
│                                        └─ custom_fields     │
│                                              └─ openclaw_id │
│                                                                 │
│   Stage                                                        │
│   ├─ name              ───────┐                              │
│   ├─ order_index       ───────┼──►  pipeline_stages         │
│   └─ probability       ───────┘      ├─ name               │
│                                        ├─ order_index       │
│                                        └─ default_prob      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 🗄️ Estructura de Tablas SQL

### Tabla `deals` (Oportunidades)

```sql
CREATE TABLE deals (
  -- Identificación
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relación con Contacto (REQUERIDO)
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  -- Información básica
  name TEXT NOT NULL,                    -- Ej: "Proyecto Web E-commerce"
  description TEXT,                       -- Detalles del proyecto
  
  -- Pipeline y Etapa
  pipeline_id UUID REFERENCES pipelines(id),
  stage_id UUID REFERENCES pipeline_stages(id),
  
  -- Valor Monetario
  value DECIMAL(10,2) DEFAULT 0,         -- $50,000.00
  currency TEXT DEFAULT 'USD',           -- USD, COP, EUR, MXN, BRL
  
  -- Probabilidad y Fechas
  probability INTEGER DEFAULT 0,         -- 0-100%
  expected_close_date DATE,              -- 2024-12-31
  actual_close_date DATE,                -- Fecha real de cierre
  
  -- Estado
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'paused')),
  lost_reason TEXT,                      -- Razón de pérdida
  won_reason TEXT,                       -- Razón de ganancia
  
  -- Competencia
  competitor TEXT,                     -- "Competidor XYZ"
  competitor_notes TEXT,
  
  -- Equipo
  owner_id UUID REFERENCES agents(id),   -- Responsable
  team_members UUID[] DEFAULT '{}',      -- [agent1_id, agent2_id]
  
  -- Productos/Servicios
  line_items JSONB DEFAULT '[]',
  -- Ejemplo:
  -- [
  --   {"product": "Diseño Web", "quantity": 1, "price": 5000, "total": 5000},
  --   {"product": "SEO", "quantity": 3, "price": 1000, "total": 3000}
  -- ]
  
  -- Tracking de Actividad
  last_activity_at TIMESTAMP WITH TIME ZONE,
  last_activity_type TEXT,
  
  -- Metadata IMPORTANTE para OpenClaw
  source TEXT,                           -- 'openclaw', 'web', 'referral'
  campaign_id TEXT,                      -- ID campaña de email
  tags TEXT[] DEFAULT '{}',              -- ['hot-lead', 'enterprise']
  
  custom_fields JSONB DEFAULT '{}',
  -- Ejemplo para OpenClaw:
  -- {
  --   "openclaw_id": "conv_123456",
  --   "openclaw_conversation_id": "thread_abc",
  --   "openclaw_channel": "whatsapp",
  --   "openclaw_created_at": "2024-01-15T10:30:00Z",
  --   "openclaw_tags": ["urgente", "vip"],
  --   "last_sync": "2024-01-20T14:22:00Z"
  -- }
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Vista `deals_full` (Para mostrar en Pipeline)

```sql
CREATE OR REPLACE VIEW deals_full AS
SELECT 
  d.*,
  -- Datos del contacto
  c.first_name as contact_first_name,
  c.last_name as contact_last_name,
  c.email as contact_email,
  c.company_name as contact_company,
  c.phone as contact_phone,
  
  -- Datos de la etapa
  ps.name as stage_name,
  ps.color as stage_color,
  ps.order_index as pipeline_stage_order,
  ps.default_probability as stage_probability,
  
  -- Datos del pipeline
  p.name as pipeline_name,
  p.currency as pipeline_currency,
  
  -- Datos del agente
  a.name as owner_name,
  a.email as owner_email,
  a.avatar_url as owner_avatar,
  
  -- Valor ponderado
  (d.value * d.probability / 100) as weighted_value
  
FROM deals d
JOIN contacts c ON c.id = d.contact_id
LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
LEFT JOIN pipelines p ON p.id = d.pipeline_id
LEFT JOIN agents a ON a.id = d.owner_id;
```

## 🔄 Eventos del Webhook OpenClaw

### 1. `opportunity.created`

```json
{
  "event": "opportunity.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "id": "conv_123456",
    "title": "Proyecto Web E-commerce",
    "description": "Cliente necesita tienda online con 500 productos",
    
    "client": {
      "name": "Juan Pérez",
      "email": "juan@empresa.com",
      "phone": "+57 300 123 4567",
      "company": "Empresa ABC"
    },
    
    "value": 15000,
    "currency": "USD",
    "stage": "Propuesta",
    
    "source": "openclaw",
    "channel": "whatsapp",
    
    "tags": ["hot-lead", "ecommerce"],
    "expected_close_date": "2024-02-28",
    
    "assignee": {
      "name": "María García",
      "email": "maria@agenciainvent.com"
    },
    
    "line_items": [
      {"product": "Diseño Web", "quantity": 1, "price": 8000},
      {"product": "Desarrollo", "quantity": 1, "price": 5000},
      {"product": "SEO", "quantity": 2, "price": 1000}
    ],
    
    "metadata": {
      "conversation_id": "thread_abc123",
      "channel_id": "wa_business_1",
      "first_message": "Hola, me interesa una web...",
      "ai_summary": "Cliente interesado en e-commerce"
    }
  }
}
```

**Resultado en CRM:**
- Contacto creado: `Juan Pérez`
- Deal creado: `Proyecto Web E-commerce` en etapa `Propuesta`
- Valor: $15,000 USD
- Asignado a: `María García`

### 2. `opportunity.updated`

```json
{
  "event": "opportunity.updated",
  "data": {
    "id": "conv_123456",
    "title": "Proyecto Web E-commerce + App Móvil",
    "value": 25000,
    "tags": ["hot-lead", "ecommerce", "mobile"]
  }
}
```

### 3. `opportunity.stage_changed`

```json
{
  "event": "opportunity.stage_changed",
  "data": {
    "opportunity_id": "conv_123456",
    "previous_stage": "Propuesta",
    "new_stage": "Negociación",
    "changed_by": "María García",
    "changed_at": "2024-01-20T14:30:00Z"
  }
}
```

**Resultado en CRM:**
- Deal movido a etapa `Negociación`
- Probabilidad actualizada automáticamente (según configuración de etapa)
- Actividad registrada en `activity_logs`

### 4. `opportunity.won`

```json
{
  "event": "opportunity.won",
  "data": {
    "id": "conv_123456",
    "closed_at": "2024-01-25T16:45:00Z",
    "reason": "Cliente aceptó propuesta final",
    "final_value": 23000
  }
}
```

**Resultado en CRM:**
- Status: `won`
- Fecha de cierre: `2024-01-25`
- Probabilidad: `100%`
- Actividad: "Oportunidad GANADA 🎉"

### 5. `opportunity.lost`

```json
{
  "event": "opportunity.lost",
  "data": {
    "id": "conv_123456",
    "closed_at": "2024-01-22T10:15:00Z",
    "reason": "Precio fuera de presupuesto",
    "competitor": "Agencia Competencia XYZ"
  }
}
```

**Resultado en CRM:**
- Status: `lost`
- Lost reason: `Precio fuera de presupuesto`
- Competitor: `Agencia Competencia XYZ`
- Probabilidad: `0%`

## 📋 Mapeo de Campos

| OpenClaw | CRM (Supabase) | Tabla |
|----------|---------------|-------|
| `client.name` | `first_name` + `last_name` | contacts |
| `client.email` | `email` | contacts |
| `client.phone` | `phone` | contacts |
| `client.company` | `company_name` | contacts |
| `title` | `name` | deals |
| `description` | `description` | deals |
| `value` | `value` | deals |
| `currency` | `currency` | deals |
| `stage` | `stage_id` (buscar por nombre) | deals |
| `status` | `status` | deals |
| `tags` | `tags` | deals |
| `source` | `source` | deals |
| `metadata` | `custom_fields` | deals |
| `assignee.email` | `owner_id` (buscar agente) | deals |
| `line_items` | `line_items` | deals |
| `expected_close_date` | `expected_close_date` | deals |
| `id` | `custom_fields->openclaw_id` | deals |

## 🎯 Campos Custom Recomendados para OpenClaw

```json
{
  "openclaw_id": "conv_123456",
  "openclaw_conversation_id": "thread_abc",
  "openclaw_channel": "whatsapp",
  "openclaw_created_at": "2024-01-15T10:30:00Z",
  "openclaw_first_message": "Hola, me interesa...",
  "openclaw_ai_summary": "Cliente interesado en e-commerce",
  "openclaw_last_message": "Gracias por la info",
  "openclaw_tags": ["urgente", "vip"],
  "openclaw_source_url": "https://wa.me/573001234567",
  "last_sync": "2024-01-20T14:22:00Z"
}
```

## 📊 Queries Útiles

### Obtener oportunidades de OpenClaw
```sql
SELECT 
  d.name as opportunity,
  d.value,
  d.currency,
  ps.name as stage,
  d.status,
  c.first_name || ' ' || c.last_name as client,
  c.email,
  d.custom_fields->>'openclaw_id' as openclaw_id
FROM deals d
JOIN contacts c ON c.id = d.contact_id
LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
WHERE d.source = 'openclaw'
ORDER BY d.created_at DESC;
```

### Estadísticas de OpenClaw
```sql
SELECT 
  COUNT(*) as total_opportunities,
  SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
  SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost,
  SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open,
  SUM(value) as total_value
FROM deals
WHERE source = 'openclaw';
```

### Pipeline de OpenClaw
```sql
SELECT 
  ps.name as stage,
  COUNT(d.id) as opportunities,
  SUM(d.value) as total_value,
  AVG(d.probability) as avg_probability
FROM deals d
JOIN pipeline_stages ps ON ps.id = d.stage_id
WHERE d.source = 'openclaw' AND d.status = 'open'
GROUP BY ps.name, ps.order_index
ORDER BY ps.order_index;
```

## 🔧 Configuración en OpenClaw

Configura este webhook en OpenClaw:

```
URL: https://tudominio.com/api/webhook/openclaw/deals
Method: POST
Headers: {
  "Content-Type": "application/json"
}
Events: [
  "opportunity.created",
  "opportunity.updated", 
  "opportunity.won",
  "opportunity.lost",
  "opportunity.stage_changed"
]
```

## 📝 Checklist de Integración

- [ ] Schema de Supabase creado (deals, pipeline_stages, pipelines)
- [ ] Webhook `/api/webhook/openclaw/deals` desplegado
- [ ] Variables de entorno configuradas
- [ ] Webhook configurado en panel de OpenClaw
- [ ] Pipeline stages creados en CRM
- [ ] Test: Crear oportunidad en OpenClaw → Verificar en CRM
- [ ] Test: Mover etapa en OpenClaw → Verificar sincronización
- [ ] Test: Ganar oportunidad → Verificar status y actividad
