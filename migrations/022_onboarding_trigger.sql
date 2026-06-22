-- 022_onboarding_trigger.sql — Multi-tenant F1: al crear un usuario en
-- auth.users, crear su workspace + membership owner + profile (o unirlo a la
-- org que lo invitó). Cubre email, Google OAuth y el magiclink del login facial
-- (todos pasan por auth.users). Idempotente y NO lanza (un error rompería el
-- signup). Requiere 020 (ensure_profile). Idempotente.

CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM ensure_profile(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    -- Nunca bloquear el alta del usuario por un fallo de onboarding.
    RAISE WARNING 'handle_new_user falló para %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
