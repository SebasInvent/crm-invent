-- 012_fix_deals_full_and_remap.sql
--
-- Arregla el Pipeline que mostraba 0 deals pese a tener 112 tagueados a
-- invent-custom. Dos causas:
--
--   1. La vista `deals_full` usa `SELECT d.*`. Postgres congela la lista de
--      columnas al CREAR la vista, así que la columna `product_id` (agregada
--      después por 006) NO quedó en la vista. El Pipeline filtra
--      `deals_full.product_id` → fallaba → 0 deals. Hay que recrear la vista
--      (DROP + CREATE, porque CREATE OR REPLACE no permite reordenar columnas).
--
--   2. Los 112 deals legacy apuntan a etapas (stage_id) de un pipeline viejo,
--      no a las etapas nuevas de invent-custom que sembró 007. Se reubican al
--      embudo de invent-custom, mapeando cada deal a la etapa nueva de
--      order_index más cercano al de su etapa vieja.
--
-- Idempotente. Seguro de re-correr.

-- ─── FIX 1: recrear deals_full incluyendo product_id (vía d.*) ──────
DROP VIEW IF EXISTS deals_full;
CREATE VIEW deals_full AS
SELECT
  d.*,
  c.first_name   AS contact_first_name,
  c.last_name    AS contact_last_name,
  c.email        AS contact_email,
  c.company_name AS contact_company,
  c.phone        AS contact_phone,
  ps.name        AS stage_name,
  ps.color       AS stage_color,
  ps.order_index AS pipeline_stage_order,
  p.name         AS pipeline_name,
  a.name         AS owner_name,
  (d.value * d.probability / 100) AS weighted_value
FROM deals d
JOIN contacts c ON c.id = d.contact_id
LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
LEFT JOIN pipelines p ON p.id = d.pipeline_id
LEFT JOIN agents a ON a.id = d.owner_id;

-- ─── FIX 2: reubicar deals legacy al embudo de invent-custom ───────
WITH inv AS (
  SELECT pl.id AS pipeline_id
  FROM pipelines pl
  JOIN products p ON p.id = pl.product_id
  WHERE p.slug = 'invent-custom' AND pl.is_default = true
  LIMIT 1
),
inv_stages AS (
  SELECT id, order_index
  FROM pipeline_stages
  WHERE pipeline_id = (SELECT pipeline_id FROM inv)
)
UPDATE deals d
SET stage_id = (
      SELECT i.id FROM inv_stages i
      ORDER BY abs(i.order_index - COALESCE(
        (SELECT os.order_index FROM pipeline_stages os WHERE os.id = d.stage_id), 1)),
        i.order_index
      LIMIT 1
    ),
    pipeline_id = (SELECT pipeline_id FROM inv)
WHERE d.product_id = (SELECT id FROM products WHERE slug = 'invent-custom')
  AND d.status = 'open'
  AND (d.stage_id IS NULL OR d.stage_id NOT IN (SELECT id FROM inv_stages));
