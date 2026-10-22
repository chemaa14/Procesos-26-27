BEGIN;
CREATE TABLE IF NOT EXISTS confirmaciones_correo (
  usuario_id TEXT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  caduca_en TIMESTAMPTZ NOT NULL,
  enviado_en TIMESTAMPTZ NOT NULL,
  ventana_inicio TIMESTAMPTZ NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0)
);
CREATE TABLE IF NOT EXISTS limite_correo (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ventana_inicio TIMESTAMPTZ NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad >= 0)
);
INSERT INTO limite_correo VALUES (1, CURRENT_TIMESTAMP, 0) ON CONFLICT (id) DO NOTHING;
COMMIT;
