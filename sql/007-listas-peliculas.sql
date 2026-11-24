BEGIN;

CREATE TABLE IF NOT EXISTS listas_peliculas (
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  pelicula_id INTEGER NOT NULL CHECK (pelicula_id > 0),
  estado TEXT NOT NULL CHECK (estado IN ('quiero_ver', 'vistas')),
  titulo TEXT NOT NULL,
  anio INTEGER CHECK (anio IS NULL OR (anio >= 1000 AND anio <= 9999)),
  cartel TEXT,
  disponible_en_plataformas BOOLEAN NOT NULL DEFAULT FALSE,
  plataformas_coincidentes JSONB NOT NULL DEFAULT '[]'::jsonb,
  recien_disponible BOOLEAN NOT NULL DEFAULT FALSE,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, pelicula_id)
);

CREATE INDEX IF NOT EXISTS idx_listas_peliculas_usuario_estado
  ON listas_peliculas (usuario_id, estado, actualizado_en DESC);

COMMIT;
