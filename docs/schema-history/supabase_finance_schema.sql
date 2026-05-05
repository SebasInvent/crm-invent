-- CRM Fase 5: Módulo de Finanzas
-- Quotes, facturación recurrente, integraciones de pago

-- ============================================
-- CATALOGO DE PRODUCTOS/SERVICIOS
-- ============================================

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Tipo y categorización
  type TEXT NOT NULL DEFAULT 'service' CHECK (type IN ('product', 'service', 'subscription', 'bundle')),
  category TEXT,
  
  -- Precios
  unit_price DECIMAL(10,2) NOT NULL,
  cost_price DECIMAL(10,2), -- Costo interno
  currency TEXT DEFAULT 'USD' CHECK (currency IN ('USD', 'COP', 'EUR', 'MXN', 'BRL')),
  
  -- Impuestos
  tax_rate DECIMAL(5,2) DEFAULT 0, -- Porcentaje
  tax_inclusive BOOLEAN DEFAULT false, -- Si el precio incluye impuestos
  
  -- Configuración
  is_recurring BOOLEAN DEFAULT false,
  recurring_interval TEXT CHECK (recurring_interval IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  
  -- Inventario (para productos físicos)
  track_inventory BOOLEAN DEFAULT false,
  stock_quantity INTEGER DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 10,
  
  -- Estado
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

-- ============================================
-- QUOTES / PROPUESTAS / COTIZACIONES
-- ============================================

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Número de cotización (generado automáticamente)
  quote_number TEXT UNIQUE NOT NULL,
  
  -- Relaciones
  contact_id UUID REFERENCES contacts(id),
  deal_id UUID REFERENCES deals(id),
  project_id UUID REFERENCES projects(id),
  
  -- Agente responsable
  agent_id UUID REFERENCES agents(id),
  
  -- Información del cliente (snapshot)
  client_name TEXT,
  client_email TEXT,
  client_company TEXT,
  client_tax_id TEXT, -- NIT/RUT/CIF
  
  -- Totales
  subtotal DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  discount_percentage DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  
  -- Vigencia
  valid_until DATE,
  
  -- Estado
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'sent', 'viewed', 'accepted', 'rejected', 
    'expired', 'converted', 'cancelled'
  )),
  
  -- Notas y términos
  notes TEXT,
  terms_and_conditions TEXT,
  
  -- Conversión
  converted_to_deal_id UUID,
  converted_to_project_id UUID,
  converted_at TIMESTAMP WITH TIME ZONE,
  
  -- Template y branding
  template_id UUID,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_contact ON quotes(contact_id);
CREATE INDEX IF NOT EXISTS idx_quotes_deal ON quotes(deal_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_valid_until ON quotes(valid_until);

-- Líneas de cotización
CREATE TABLE IF NOT EXISTS quote_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  
  -- Producto (opcional, puede ser línea libre)
  product_id UUID REFERENCES products(id),
  
  -- Descripción
  description TEXT NOT NULL,
  
  -- Cantidad y precio
  quantity DECIMAL(10,3) DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  
  -- Descuentos
  discount_percentage DECIMAL(5,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  
  -- Impuestos
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  
  -- Total línea
  line_total DECIMAL(12,2) NOT NULL,
  
  -- Orden
  order_index INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_line_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_product ON quote_line_items(product_id);

-- ============================================
-- FACTURAS / INVOICES
-- ============================================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Número de factura
  invoice_number TEXT UNIQUE NOT NULL,
  
  -- Serie (para facturación por series)
  series TEXT DEFAULT 'A',
  
  -- Relaciones
  contact_id UUID REFERENCES contacts(id),
  quote_id UUID REFERENCES quotes(id),
  project_id UUID REFERENCES projects(id),
  deal_id UUID REFERENCES deals(id),
  
  -- Agente
  agent_id UUID REFERENCES agents(id),
  
  -- Información del cliente (snapshot)
  client_name TEXT,
  client_email TEXT,
  client_company TEXT,
  client_address TEXT,
  client_tax_id TEXT,
  
  -- Totales
  subtotal DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) DEFAULT 0,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  amount_due DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  
  -- Fechas importantes
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  paid_date DATE,
  
  -- Estado
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'sent', 'viewed', 'partially_paid', 'paid', 
    'overdue', 'cancelled', 'refunded', 'void'
  )),
  
  -- Pagos
  payment_method TEXT,
  payment_reference TEXT, -- Referencia de pago externo
  
  -- Recurrencia
  is_recurring BOOLEAN DEFAULT false,
  parent_invoice_id UUID REFERENCES invoices(id), -- Factura padre si es recurrente
  subscription_id UUID, -- Link a suscripción
  
  -- Notas
  notes TEXT,
  terms TEXT,
  footer_notes TEXT,
  
  -- Enviado
  sent_at TIMESTAMP WITH TIME ZONE,
  sent_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_contact ON invoices(contact_id);
CREATE INDEX IF NOT EXISTS idx_invoices_quote ON invoices(quote_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date);

-- Líneas de factura
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  
  -- Producto o time entry
  product_id UUID REFERENCES products(id),
  time_entry_id UUID REFERENCES time_entries(id),
  
  -- Descripción
  description TEXT NOT NULL,
  
  -- Cantidad y precio
  quantity DECIMAL(10,3) DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  unit TEXT, -- horas, unidades, etc.
  
  -- Descuentos e impuestos
  discount_percentage DECIMAL(5,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  
  -- Total
  line_total DECIMAL(12,2) NOT NULL,
  
  -- Orden
  order_index INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_line_items(invoice_id);

-- ============================================
-- SUSCRIPCIONES / RECURRING BILLING
-- ============================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  contact_id UUID REFERENCES contacts(id),
  
  -- Producto/Servicio suscrito
  product_id UUID REFERENCES products(id),
  
  -- Configuración
  plan_name TEXT NOT NULL,
  description TEXT,
  
  -- Precio
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  
  -- Recurrencia
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  billing_day INTEGER, -- Día del mes/semana para facturar
  
  -- Fechas
  start_date DATE NOT NULL,
  end_date DATE, -- NULL = indefinido
  next_billing_date DATE NOT NULL,
  last_billing_date DATE,
  
  -- Estado
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'expired', 'trial')),
  
  -- Cancelación
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT,
  
  -- Límites
  max_billings INTEGER, -- NULL = indefinido
  current_billing_count INTEGER DEFAULT 0,
  
  -- Pagos
  payment_method_id UUID, -- Referencia a método de pago guardado
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_contact ON subscriptions(contact_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing ON subscriptions(next_billing_date);

-- ============================================
-- PAGOS RECIBIDOS
-- ============================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  invoice_id UUID REFERENCES invoices(id),
  
  -- Monto
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  
  -- Método de pago
  payment_method TEXT NOT NULL CHECK (payment_method IN (
    'cash', 'check', 'bank_transfer', 'credit_card', 'debit_card',
    'stripe', 'paypal', 'mercadopago', 'wire_transfer', 'other'
  )),
  
  -- Referencia externa
  transaction_id TEXT,
  reference_number TEXT,
  
  -- Fecha
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Notas
  notes TEXT,
  
  -- Gateway de pago (para integraciones)
  gateway TEXT, -- 'stripe', 'paypal', 'mercadopago'
  gateway_response JSONB,
  
  -- Estado
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(payment_method);

-- ============================================
-- VISTAS Y REPORTES
-- ============================================

-- Vista de quotes con totales calculados
CREATE OR REPLACE VIEW quotes_view AS
SELECT 
  q.*,
  c.first_name as contact_first_name,
  c.last_name as contact_last_name,
  c.email as contact_email,
  c.company_name as contact_company,
  a.name as agent_name,
  COUNT(qi.id) as item_count,
  SUM(qi.quantity) as total_quantity
FROM quotes q
LEFT JOIN contacts c ON c.id = q.contact_id
LEFT JOIN agents a ON a.id = q.agent_id
LEFT JOIN quote_line_items qi ON qi.quote_id = q.id
GROUP BY q.id, c.first_name, c.last_name, c.email, c.company_name, a.name;

-- Vista de invoices con info de contacto
CREATE OR REPLACE VIEW invoices_view AS
SELECT 
  i.*,
  c.first_name as contact_first_name,
  c.last_name as contact_last_name,
  c.email as contact_email,
  c.company_name as contact_company,
  a.name as agent_name,
  COUNT(ii.id) as item_count,
  (i.total_amount - i.amount_paid) as balance_due
FROM invoices i
LEFT JOIN contacts c ON c.id = i.contact_id
LEFT JOIN agents a ON a.id = i.agent_id
LEFT JOIN invoice_line_items ii ON ii.invoice_id = i.id
GROUP BY i.id, c.first_name, c.last_name, c.email, c.company_name, a.name;

-- Vista de facturas pendientes de pago
CREATE OR REPLACE VIEW invoices_overdue_view AS
SELECT 
  i.*,
  c.first_name as contact_first_name,
  c.last_name as contact_last_name,
  c.email as contact_email,
  c.company_name as contact_company,
  (i.total_amount - i.amount_paid) as balance_due,
  CURRENT_DATE - i.due_date as days_overdue
FROM invoices i
LEFT JOIN contacts c ON c.id = i.contact_id
WHERE i.status IN ('sent', 'partially_paid')
  AND i.due_date < CURRENT_DATE;

-- Vista de suscripciones activas próximas a facturar
CREATE OR REPLACE VIEW subscriptions_upcoming_view AS
SELECT 
  s.*,
  c.first_name as contact_first_name,
  c.last_name as contact_last_name,
  c.email as contact_email,
  p.name as product_name,
  (s.next_billing_date - CURRENT_DATE) as days_until_billing
FROM subscriptions s
LEFT JOIN contacts c ON c.id = s.contact_id
LEFT JOIN products p ON p.id = s.product_id
WHERE s.status = 'active'
  AND s.next_billing_date <= CURRENT_DATE + INTERVAL '7 days';

-- ============================================
-- TRIGGERS Y FUNCIONES
-- ============================================

-- Trigger: Actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_quotes_updated_at ON quotes;
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Generar número de cotización automáticamente
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
DECLARE
  year_text TEXT;
  sequence_number INTEGER;
BEGIN
  IF NEW.quote_number IS NULL THEN
    year_text := to_char(CURRENT_DATE, 'YYYY');
    
    -- Obtener el siguiente número
    SELECT COALESCE(MAX(CAST(SUBSTRING(quote_number FROM 'QT-[0-9]{4}-([0-9]+)') AS INTEGER)), 0) + 1
    INTO sequence_number
    FROM quotes
    WHERE quote_number LIKE 'QT-' || year_text || '-%';
    
    NEW.quote_number := 'QT-' || year_text || '-' || LPAD(sequence_number::TEXT, 5, '0');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_quote_number ON quotes;
CREATE TRIGGER trigger_generate_quote_number
BEFORE INSERT ON quotes
FOR EACH ROW EXECUTE FUNCTION generate_quote_number();

-- Trigger: Generar número de factura automáticamente
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  year_text TEXT;
  sequence_number INTEGER;
BEGIN
  IF NEW.invoice_number IS NULL THEN
    year_text := to_char(CURRENT_DATE, 'YYYY');
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'INV-[0-9]{4}-([0-9]+)') AS INTEGER)), 0) + 1
    INTO sequence_number
    FROM invoices
    WHERE invoice_number LIKE 'INV-' || year_text || '-%';
    
    NEW.invoice_number := 'INV-' || year_text || '-' || LPAD(sequence_number::TEXT, 5, '0');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_generate_invoice_number ON invoices;
CREATE TRIGGER trigger_generate_invoice_number
BEFORE INSERT ON invoices
FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

-- Trigger: Actualizar status de factura cuando se registra pago
CREATE OR REPLACE FUNCTION update_invoice_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  invoice_total DECIMAL(12,2);
  total_paid DECIMAL(12,2);
BEGIN
  -- Obtener total de la factura
  SELECT total_amount INTO invoice_total
  FROM invoices WHERE id = NEW.invoice_id;
  
  -- Calcular total pagado
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM payments
  WHERE invoice_id = NEW.invoice_id
    AND status = 'completed'
    AND id != NEW.id;
  
  total_paid := total_paid + NEW.amount;
  
  -- Actualizar factura
  UPDATE invoices SET
    amount_paid = total_paid,
    amount_due = invoice_total - total_paid,
    status = CASE 
      WHEN total_paid >= invoice_total THEN 'paid'
      WHEN total_paid > 0 THEN 'partially_paid'
      ELSE status
    END,
    paid_date = CASE 
      WHEN total_paid >= invoice_total THEN NEW.payment_date
      ELSE paid_date
    END,
    updated_at = NOW()
  WHERE id = NEW.invoice_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_invoice_on_payment ON payments;
CREATE TRIGGER trigger_update_invoice_on_payment
AFTER INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION update_invoice_on_payment();

-- ============================================
-- RLS
-- ============================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Políticas básicas
DROP POLICY IF EXISTS allow_all_products ON products;
CREATE POLICY allow_all_products ON products FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_quotes ON quotes;
CREATE POLICY allow_all_quotes ON quotes FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_quote_items ON quote_line_items;
CREATE POLICY allow_all_quote_items ON quote_line_items FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_invoices ON invoices;
CREATE POLICY allow_all_invoices ON invoices FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_invoice_items ON invoice_line_items;
CREATE POLICY allow_all_invoice_items ON invoice_line_items FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_subscriptions ON subscriptions;
CREATE POLICY allow_all_subscriptions ON subscriptions FOR ALL USING (true);

DROP POLICY IF EXISTS allow_all_payments ON payments;
CREATE POLICY allow_all_payments ON payments FOR ALL USING (true);

-- ============================================
-- DATOS INICIALES
-- ============================================

-- Productos/Servicios de ejemplo
INSERT INTO products (name, description, type, category, unit_price, currency, tax_rate, is_recurring, recurring_interval) VALUES
('Diseño de Logo', 'Creación de identidad visual completa con 3 propuestas y revisiones ilimitadas', 'service', 'Branding', 1500.00, 'USD', 0, false, NULL),
('Desarrollo Web - Landing Page', 'Landing page responsive con SEO básico y formularios', 'service', 'Desarrollo Web', 2500.00, 'USD', 0, false, NULL),
('Desarrollo Web - E-commerce', 'Tienda online completa con pasarela de pagos', 'service', 'Desarrollo Web', 8000.00, 'USD', 0, false, NULL),
('Community Manager - Plan Básico', 'Gestión de 2 redes sociales, 12 posts/mes', 'service', 'Marketing', 800.00, 'USD', 0, true, 'monthly'),
('Community Manager - Plan Pro', 'Gestión de 4 redes sociales, 20 posts/mes, 2 campañas ads', 'service', 'Marketing', 1500.00, 'USD', 0, true, 'monthly'),
('Consultoría Estratégica', 'Sesión de consultoría de marketing de 2 horas', 'service', 'Consultoría', 500.00, 'USD', 0, false, NULL),
('Hosting y Mantenimiento', 'Hosting VPS + mantenimiento mensual del sitio', 'service', 'Infraestructura', 150.00, 'USD', 0, true, 'monthly'),
('Fotografía de Producto', 'Sesión de fotografía profesional (10 fotos)', 'service', 'Producción', 1200.00, 'USD', 0, false, NULL),
('Video Corporativo', 'Video de 2-3 minutos con guion, filmación y edición', 'service', 'Producción', 3500.00, 'USD', 0, false, NULL),
('Rediseño de Marca', 'Actualización completa de identidad visual existente', 'service', 'Branding', 3000.00, 'USD', 0, false, NULL)
ON CONFLICT DO NOTHING;
