-- 007_seed_products_pipelines.sql
--
-- Seeds the 8 Invent products with sane defaults + a default pipeline
-- per product + stages tailored to the type of motion (SaaS funnel,
-- transactional funnel, custom-software funnel).
--
-- Then backfills ALL existing data into the `invent-custom` product
-- so the kanban that ran on the legacy single-pipeline-no-product
-- setup continues to render its 112 deals correctly when filtered by
-- product=invent-custom.
--
-- Idempotent. Re-running this migration is safe — every section
-- guards on existence first.

-- ─── 1. Insert products ───────────────────────────────────────────
INSERT INTO products (slug, name, tagline, target_market, price_model, status, color, icon)
VALUES
  ('dental-os',   'Dental OS',                       'OS vertical para clínicas dentales', 'Clínicas dentales LATAM',  '$1-3K/mes',     'active', '#06b6d4', '🦷'),
  ('foody',       'Foody',                           '— pendiente —',                       NULL,                       NULL,            'idea',   '#f97316', '🍔'),
  ('el-sonar',    'El Sonar',                        '— pendiente —',                       NULL,                       NULL,            'idea',   '#a855f7', '📡'),
  ('veralix',     'Veralix',                         '— pendiente —',                       NULL,                       NULL,            'idea',   '#10b981', '✦'),
  ('mowi',        'Mowi',                            '— pendiente —',                       NULL,                       NULL,            'idea',   '#ec4899', '🌊'),
  ('ios-bogota',  'The iOS Bogotá',                  'Servicios y reparación iPhone',       'Usuarios iPhone Bogotá',   'Transaccional', 'active', '#64748b', '📱'),
  ('buna-market', 'Buna Market',                     '— pendiente —',                       NULL,                       NULL,            'beta',   '#92400e', '☕'),
  ('invent-custom', 'Invent Agency — Custom',        'Software a medida para empresas',     'Enterprise LATAM',         '$15K+ proyecto','active', '#ffffff', '⚡')
ON CONFLICT (slug) DO NOTHING;

-- ─── 2. One default pipeline per product ──────────────────────────
INSERT INTO pipelines (name, product_id, is_default, is_active)
SELECT
  p.name || ' Pipeline',
  p.id,
  TRUE,
  TRUE
FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM pipelines pl WHERE pl.product_id = p.id AND pl.is_default = TRUE
);

-- Set default_pipeline_id on each product
UPDATE products p
SET default_pipeline_id = pl.id
FROM pipelines pl
WHERE pl.product_id = p.id
  AND pl.is_default = TRUE
  AND p.default_pipeline_id IS NULL;

-- ─── 3. Stages: SaaS funnel for the SaaS products ─────────────────
DO $$
DECLARE prod RECORD; pip_id UUID;
BEGIN
  FOR prod IN
    SELECT id FROM products
    WHERE slug IN ('dental-os','foody','el-sonar','veralix','mowi','buna-market')
  LOOP
    SELECT id INTO pip_id
    FROM pipelines
    WHERE product_id = prod.id AND is_default = TRUE
    LIMIT 1;

    IF pip_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pipeline_stages WHERE pipeline_id = pip_id
    ) THEN
      INSERT INTO pipeline_stages (pipeline_id, name, default_probability, order_index, color, is_active)
      VALUES
        (pip_id, 'Nuevo Lead',     10,  1, '#71717a', TRUE),
        (pip_id, 'Demo agendada',  30,  2, '#60a5fa', TRUE),
        (pip_id, 'Demo entregada', 50,  3, '#a78bfa', TRUE),
        (pip_id, 'Trial activo',   75,  4, '#fbbf24', TRUE),
        (pip_id, 'Cliente',        100, 5, '#34d399', TRUE),
        (pip_id, 'Perdido',        0,   6, '#f87171', TRUE);
    END IF;
  END LOOP;
END $$;

-- ─── 4. Stages: transactional funnel for ios-bogota ────────────────
DO $$
DECLARE pid UUID; pip_id UUID;
BEGIN
  SELECT id INTO pid FROM products WHERE slug = 'ios-bogota';
  SELECT id INTO pip_id FROM pipelines WHERE product_id = pid AND is_default = TRUE LIMIT 1;

  IF pip_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pipeline_stages WHERE pipeline_id = pip_id
  ) THEN
    INSERT INTO pipeline_stages (pipeline_id, name, default_probability, order_index, color, is_active)
    VALUES
      (pip_id, 'Nueva consulta', 20,  1, '#71717a', TRUE),
      (pip_id, 'Cotizado',       50,  2, '#60a5fa', TRUE),
      (pip_id, 'Aceptado',       90,  3, '#fbbf24', TRUE),
      (pip_id, 'Completado',     100, 4, '#34d399', TRUE),
      (pip_id, 'Perdido',        0,   5, '#f87171', TRUE);
  END IF;
END $$;

-- ─── 5. Stages: custom-software funnel for invent-custom ───────────
DO $$
DECLARE pid UUID; pip_id UUID;
BEGIN
  SELECT id INTO pid FROM products WHERE slug = 'invent-custom';
  SELECT id INTO pip_id FROM pipelines WHERE product_id = pid AND is_default = TRUE LIMIT 1;

  IF pip_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pipeline_stages WHERE pipeline_id = pip_id
  ) THEN
    INSERT INTO pipeline_stages (pipeline_id, name, default_probability, order_index, color, is_active)
    VALUES
      (pip_id, 'Nuevo Lead',      10,  1, '#71717a', TRUE),
      (pip_id, 'Calificación',    25,  2, '#60a5fa', TRUE),
      (pip_id, 'Propuesta',       50,  3, '#a78bfa', TRUE),
      (pip_id, 'Negociación',     75,  4, '#fbbf24', TRUE),
      (pip_id, 'Cerrado Ganado',  100, 5, '#34d399', TRUE),
      (pip_id, 'Cerrado Perdido', 0,   6, '#f87171', TRUE);
  END IF;
END $$;

-- ─── 6. Backfill: legacy stages → invent-custom pipeline ──────────
-- The pipeline_stages from the original schema have NO pipeline_id
-- (or a legacy default one). Migrate them to the invent-custom
-- pipeline so the existing kanban filtered by product=invent-custom
-- still shows them. Skip if they already have a pipeline_id matching
-- one of our new pipelines.
DO $$
DECLARE invent_pip UUID;
BEGIN
  SELECT id INTO invent_pip FROM pipelines
  WHERE product_id = (SELECT id FROM products WHERE slug = 'invent-custom')
    AND is_default = TRUE
  LIMIT 1;

  IF invent_pip IS NOT NULL THEN
    UPDATE pipeline_stages
    SET pipeline_id = invent_pip
    WHERE pipeline_id IS NULL;
  END IF;
END $$;

-- ─── 7. Backfill: existing deals → invent-custom (best-guess) ─────
-- Most existing deals are the 112 stale enterprise scrapes. Tag them
-- with invent-custom so the kanban filtered by product shows them.
-- Users can re-tag individual deals later via the API.
UPDATE deals
SET product_id = (SELECT id FROM products WHERE slug = 'invent-custom')
WHERE product_id IS NULL;

-- Same for contacts (118 of them, mostly the enterprise leads scraped)
UPDATE contacts
SET product_id = (SELECT id FROM products WHERE slug = 'invent-custom')
WHERE product_id IS NULL;

-- ─── 8. Re-tag chat_threads by bot_type → product ─────────────────
-- chat_threads.bot_type already encodes the product (one bot per
-- product in n8n). Map them when possible.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chat_threads') THEN
    UPDATE chat_threads ct
    SET product_id = p.id
    FROM products p
    WHERE ct.product_id IS NULL
      AND (
        (ct.bot_type = 'invent'      AND p.slug = 'invent-custom') OR
        (ct.bot_type = 'dental'      AND p.slug = 'dental-os')     OR
        (ct.bot_type = 'dental_os'   AND p.slug = 'dental-os')     OR
        (ct.bot_type = 'foody'       AND p.slug = 'foody')         OR
        (ct.bot_type = 'sonar'       AND p.slug = 'el-sonar')      OR
        (ct.bot_type = 'veralix'     AND p.slug = 'veralix')       OR
        (ct.bot_type = 'mowi'        AND p.slug = 'mowi')          OR
        (ct.bot_type = 'iosbogota'   AND p.slug = 'ios-bogota')    OR
        (ct.bot_type = 'ios_bogota'  AND p.slug = 'ios-bogota')    OR
        (ct.bot_type = 'buna'        AND p.slug = 'buna-market')   OR
        (ct.bot_type = 'buna_market' AND p.slug = 'buna-market')
      );
  END IF;
END $$;
