BEGIN;

CREATE TABLE IF NOT EXISTS preferencias_plataformas (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  region TEXT NOT NULL DEFAULT 'ES' CHECK (region = 'ES'),
  proveedor_id INTEGER NOT NULL CHECK (proveedor_id > 0),
  PRIMARY KEY (usuario_id, region, proveedor_id)
);

COMMIT;
