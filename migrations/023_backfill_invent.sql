-- 023_backfill_invent.sql — Multi-tenant F1: crea la org de Invent y asigna
-- TODA la data existente (single-tenant hoy) a esa org. Correr DESPUÉS de
-- 020/021. La data se vuelve invisible si queda org_id NULL cuando se active la
-- RLS estricta (F3) — por eso esto va antes. Idempotente.

-- 1) Org de Invent + owner + profile (el usuario ya existía antes del trigger)
INSERT INTO organizations (name, slug, owner_user_id, owner_email)
SELECT 'Invent Agency', 'invent',
       (SELECT id FROM auth.users WHERE email = 'inventagency20@gmail.com'),
       'inventagency20@gmail.com'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug = 'invent');

INSERT INTO organization_members (org_id, user_id, role)
SELECT o.id, u.id, 'owner'
FROM organizations o
JOIN auth.users u ON u.email = 'inventagency20@gmail.com'
WHERE o.slug = 'invent'
ON CONFLICT (org_id, user_id) DO NOTHING;

INSERT INTO profiles (id, email, full_name, active_org_id, role)
SELECT u.id, u.email, 'Invent Agency',
       (SELECT id FROM organizations WHERE slug='invent'), 'owner'
FROM auth.users u WHERE u.email = 'inventagency20@gmail.com'
ON CONFLICT (id) DO UPDATE
  SET active_org_id = COALESCE(profiles.active_org_id, EXCLUDED.active_org_id),
      role = 'owner';

-- 2) Backfill de raíces → org de Invent
DO $$
DECLARE t text; v_org uuid;
  raices text[] := ARRAY[
    'contacts','deals','leads','projects','pipelines','channels',
    'message_templates','conversations','unified_messages','chat_threads',
    'chat_messages','quotes','invoices','payments','meetings',
    'agent_deliverables','integration_installs','automated_insights','notes',
    'activity_logs','email_logs','documents','document_folders','campaigns',
    'saved_views','agents','api_keys','api_request_logs'
  ];
BEGIN
  SELECT id INTO v_org FROM organizations WHERE slug='invent';
  IF v_org IS NULL THEN RAISE EXCEPTION 'org invent no existe'; END IF;
  FOREACH t IN ARRAY raices LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=t AND column_name='org_id') THEN
      EXECUTE format('UPDATE %I SET org_id=$1 WHERE org_id IS NULL', t) USING v_org;
    END IF;
  END LOOP;
END $$;

-- 3) Backfill de hijas derivando del padre (consistencia, no asumir Invent)
DO $$
BEGIN
  IF to_regclass('public.quote_line_items') IS NOT NULL THEN
    UPDATE quote_line_items li SET org_id=q.org_id FROM quotes q
      WHERE q.id=li.quote_id AND li.org_id IS NULL;
  END IF;
  IF to_regclass('public.invoice_line_items') IS NOT NULL THEN
    UPDATE invoice_line_items li SET org_id=i.org_id FROM invoices i
      WHERE i.id=li.invoice_id AND li.org_id IS NULL;
  END IF;
  IF to_regclass('public.pipeline_stages') IS NOT NULL THEN
    UPDATE pipeline_stages s SET org_id=p.org_id FROM pipelines p
      WHERE p.id=s.pipeline_id AND s.org_id IS NULL;
  END IF;
END $$;
