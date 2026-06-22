-- 020_tenancy.sql — Multi-tenant F1: workspaces (orgs) + membresías + profiles + invitaciones
--
-- Cada usuario tiene su propio workspace (organization) aislado y puede invitar
-- colaboradores. La data se scopea por `org_id` (columna nueva, NO la
-- `contacts.organization_id` existente). RLS por membresía.
--
-- Esta migración SOLO crea las tablas/funciones de tenancy. NO activa el
-- aislamiento todavía (eso es F3 / 024). Idempotente.

-- ─── organizations (workspaces) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text UNIQUE,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_email   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── organization_members (usuario ↔ org, con rol) ─────────────────
CREATE TABLE IF NOT EXISTS organization_members (
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member'
             CHECK (role IN ('owner','admin','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org  ON organization_members(org_id);

-- ─── profiles (1:1 con auth.users; org activa + rol) ───────────────
CREATE TABLE IF NOT EXISTS profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text,
  full_name     text,
  active_org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  role          text DEFAULT 'member',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── organization_invites ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  token       text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24),'hex'),
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','accepted','revoked','expired')),
  invited_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_invites_email ON organization_invites(lower(email));
CREATE INDEX IF NOT EXISTS idx_org_invites_org   ON organization_invites(org_id);

-- ─── Helper de membresía (para RLS; SECURITY DEFINER evita recursión) ──
CREATE OR REPLACE FUNCTION user_org_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM organization_members WHERE user_id = auth.uid();
$$;

-- ─── ensure_profile: red de seguridad (crea workspace+profile si falta) ──
-- Parametrizada por usuario (se llama desde el callback con service-role).
-- Idempotente: si el usuario ya tiene org/profile, no hace nada nuevo.
CREATE OR REPLACE FUNCTION ensure_profile(p_user_id uuid, p_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_name text;
BEGIN
  v_name := COALESCE(NULLIF(split_part(COALESCE(p_email,''),'@',1),''), 'Mi');

  -- ¿ya es miembro de alguna org? usa esa como activa.
  SELECT org_id INTO v_org FROM organization_members WHERE user_id = p_user_id LIMIT 1;

  IF v_org IS NULL THEN
    -- ¿tiene invitación pendiente? entonces NO crear org propia (se unirá al aceptar).
    IF NOT EXISTS (SELECT 1 FROM organization_invites
                   WHERE lower(email)=lower(COALESCE(p_email,'')) AND status='pending') THEN
      INSERT INTO organizations (name, owner_user_id, owner_email)
      VALUES (v_name || ' Workspace', p_user_id, p_email)
      RETURNING id INTO v_org;
      INSERT INTO organization_members (org_id, user_id, role)
      VALUES (v_org, p_user_id, 'owner')
      ON CONFLICT (org_id, user_id) DO NOTHING;
    END IF;
  END IF;

  INSERT INTO profiles (id, email, full_name, active_org_id, role)
  VALUES (p_user_id, p_email, v_name, v_org, CASE WHEN v_org IS NULL THEN 'member' ELSE 'owner' END)
  ON CONFLICT (id) DO UPDATE
    SET active_org_id = COALESCE(profiles.active_org_id, EXCLUDED.active_org_id),
        email = COALESCE(profiles.email, EXCLUDED.email),
        updated_at = now();

  RETURN v_org;
END $$;

-- ─── accept_org_invite: aceptar invitación (valida email/expiración) ──
CREATE OR REPLACE FUNCTION accept_org_invite(p_token text, p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv organization_invites; v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  SELECT * INTO inv FROM organization_invites
    WHERE token = p_token AND status = 'pending' AND expires_at > now();
  IF inv.id IS NULL THEN RAISE EXCEPTION 'invite_invalid_or_expired'; END IF;
  IF lower(inv.email) <> lower(COALESCE(v_email,'')) THEN RAISE EXCEPTION 'invite_email_mismatch'; END IF;

  INSERT INTO organization_members (org_id, user_id, role)
  VALUES (inv.org_id, p_user_id, inv.role)
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE organization_invites SET status='accepted', accepted_by=p_user_id WHERE id=inv.id;
  UPDATE profiles SET active_org_id = inv.org_id WHERE id = p_user_id;
  RETURN inv.org_id;
END $$;

-- ─── RLS de las tablas de tenancy (estas SÍ se aíslan desde ya) ────
ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_self ON profiles;
CREATE POLICY profiles_self ON profiles FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS orgs_member_read ON organizations;
CREATE POLICY orgs_member_read ON organizations FOR SELECT TO authenticated
  USING (id IN (SELECT user_org_ids()));
DROP POLICY IF EXISTS orgs_owner_write ON organizations;
CREATE POLICY orgs_owner_write ON organizations FOR ALL TO authenticated
  USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS members_read ON organization_members;
CREATE POLICY members_read ON organization_members FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_org_ids()));

DROP POLICY IF EXISTS invites_read ON organization_invites;
CREATE POLICY invites_read ON organization_invites FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_org_ids()));
