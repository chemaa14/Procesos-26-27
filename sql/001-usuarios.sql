BEGIN;

CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  confirmado BOOLEAN NOT NULL DEFAULT FALSE,
  eliminado BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash TEXT,
  orden BIGINT GENERATED ALWAYS AS IDENTITY,

  CONSTRAINT usuarios_email_unico UNIQUE (email),
  CONSTRAINT usuarios_nombre_valido
    CHECK (length(trim(nombre)) > 0),
  CONSTRAINT usuarios_email_normalizado
    CHECK (email = lower(trim(email)))
);

COMMIT;