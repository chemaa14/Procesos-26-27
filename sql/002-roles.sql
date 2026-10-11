BEGIN;

-- También migra bases existentes: todos los usuarios conservan su cuenta
-- y reciben el rol usuario. La promoción del administrador es explícita.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol TEXT NOT NULL
  DEFAULT 'usuario' CHECK (rol IN ('usuario', 'administrador'));

COMMIT;
