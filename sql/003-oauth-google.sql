BEGIN;

-- El identificador de Google es estable aunque cambie el correo.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_google_sub_unico ON usuarios (google_sub);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  caduca_en TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sesiones_usuario_idx ON sesiones(usuario_id);
CREATE INDEX IF NOT EXISTS sesiones_caducidad_idx ON sesiones(caduca_en);

-- Intentos de un solo uso, ligados al navegador que inició el acceso.
CREATE TABLE IF NOT EXISTS intentos_oauth (
  estado_hash TEXT PRIMARY KEY,
  navegador_hash TEXT NOT NULL,
  nonce TEXT NOT NULL,
  verificador TEXT NOT NULL,
  caduca_en TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS intentos_oauth_caducidad_idx ON intentos_oauth(caduca_en);

COMMIT;
