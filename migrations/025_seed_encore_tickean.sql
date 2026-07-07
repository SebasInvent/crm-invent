-- 025_seed_encore_tickean.sql
--
-- Da de alta Encore (POS bares/discotecas) y Tickean (boletería de
-- eventos) como productos, cada uno con su pipeline por defecto y sus
-- etapas — para que los leads nightlife de la Máquina de Adquisición
-- tengan un embudo donde caer.
--
-- Idempotente: reejecutar es seguro (mismo patrón guard-on-existence
-- que 007_seed_products_pipelines.sql).

-- ─── 1. Productos ─────────────────────────────────────────────────
INSERT INTO products (slug, name, tagline, target_market, price_model, status, color, icon)
VALUES
  ('encore',  'Encore',  'POS todo-en-uno para bares y discotecas', 'Bares y discotecas LATAM',     '$325K–992K COP/mes',  'active', '#f43f5e', '🍸'),
  ('tickean', 'Tickean', 'Boletería para eventos en vivo',          'Organizadores y venues LATAM', 'Comisión por ticket', 'active', '#8b5cf6', '🎟️')
ON CONFLICT (slug) DO NOTHING;

-- ─── 2. Pipeline por defecto para cada producto nuevo ─────────────
INSERT INTO pipelines (name, product_id, is_default, is_active)
SELECT p.name || ' Pipeline', p.id, TRUE, TRUE
FROM products p
WHERE p.slug IN ('encore', 'tickean')
  AND NOT EXISTS (
    SELECT 1 FROM pipelines pl WHERE pl.product_id = p.id AND pl.is_default = TRUE
  );

UPDATE products p
SET default_pipeline_id = pl.id
FROM pipelines pl
WHERE pl.product_id = p.id
  AND pl.is_default = TRUE
  AND p.slug IN ('encore', 'tickean')
  AND p.default_pipeline_id IS NULL;

-- ─── 3. Etapas Encore — embudo SaaS con trial (bares) ─────────────
DO $$
DECLARE pid UUID; pip_id UUID;
BEGIN
  SELECT id INTO pid FROM products WHERE slug = 'encore';
  SELECT id INTO pip_id FROM pipelines WHERE product_id = pid AND is_default = TRUE LIMIT 1;

  IF pip_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pipeline_stages WHERE pipeline_id = pip_id
  ) THEN
    INSERT INTO pipeline_stages (pipeline_id, name, default_probability, order_index, color, is_active)
    VALUES
      (pip_id, 'Nuevo Lead',    10,  1, '#71717a', TRUE),
      (pip_id, 'Contactado',    25,  2, '#60a5fa', TRUE),
      (pip_id, 'Demo agendada', 45,  3, '#a78bfa', TRUE),
      (pip_id, 'Trial activo',  70,  4, '#fbbf24', TRUE),
      (pip_id, 'Cliente',       100, 5, '#34d399', TRUE),
      (pip_id, 'Perdido',       0,   6, '#f87171', TRUE);
  END IF;
END $$;

-- ─── 4. Etapas Tickean — embudo de adopción (organizadores) ───────
DO $$
DECLARE pid UUID; pip_id UUID;
BEGIN
  SELECT id INTO pid FROM products WHERE slug = 'tickean';
  SELECT id INTO pip_id FROM pipelines WHERE product_id = pid AND is_default = TRUE LIMIT 1;

  IF pip_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pipeline_stages WHERE pipeline_id = pip_id
  ) THEN
    INSERT INTO pipeline_stages (pipeline_id, name, default_probability, order_index, color, is_active)
    VALUES
      (pip_id, 'Nuevo Lead',     10,  1, '#71717a', TRUE),
      (pip_id, 'Contactado',     30,  2, '#60a5fa', TRUE),
      (pip_id, 'Cuenta creada',  55,  3, '#a78bfa', TRUE),
      (pip_id, 'Publicó evento', 80,  4, '#fbbf24', TRUE),
      (pip_id, 'Vendiendo',      100, 5, '#34d399', TRUE),
      (pip_id, 'Perdido',        0,   6, '#f87171', TRUE);
  END IF;
END $$;
