-- ============================================================
-- Login facial (InsightFace V2) — credenciales biométricas por usuario
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================

-- Una credencial facial por usuario del CRM (auth.users)
CREATE TABLE IF NOT EXISTS face_credentials (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  embedding512      jsonb NOT NULL,            -- array de 512 floats (ArcFace, normalizado)
  embedding_quality real,                       -- 0-1
  liveness_score    real,                       -- 0-100 (al enrolar)
  spoof_score       real,                       -- 0-100 (al enrolar)
  face_image_url    text,                        -- ref a Storage (la cara cruda NO va en la DB)
  consent_at        timestamptz,                 -- Habeas Data: consentimiento datado (Ley 1581)
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','revoked')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS face_credentials_status_idx ON face_credentials(status);

-- Auditoría de intentos de login facial (no almacena el embedding)
CREATE TABLE IF NOT EXISTS face_login_attempts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  success        boolean NOT NULL,
  distance       real,
  liveness_score real,
  spoof_score    real,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS face_login_attempts_created_idx ON face_login_attempts(created_at DESC);

-- RLS: cada quien gestiona SU propia credencial.
-- El matching/login y la auditoría usan service_role (bypassa RLS).
ALTER TABLE face_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS face_cred_self ON face_credentials;
CREATE POLICY face_cred_self ON face_credentials
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE face_login_attempts ENABLE ROW LEVEL SECURITY;
-- sin policies: solo service_role escribe/lee (el cliente no toca esta tabla).
