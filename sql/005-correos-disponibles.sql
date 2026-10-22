BEGIN;
-- Solo las cuentas vigentes reservan el correo y la identidad de Google.
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_email_unico;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unico
  ON usuarios (email) WHERE eliminado = FALSE;
DROP INDEX IF EXISTS usuarios_google_sub_unico;
CREATE UNIQUE INDEX usuarios_google_sub_unico
  ON usuarios (google_sub) WHERE eliminado = FALSE;
COMMIT;
