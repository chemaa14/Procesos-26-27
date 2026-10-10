import pg from "pg";

export function crearPool() {
  const variables = [
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD"
  ];

  for (const variable of variables) {
    if (!process.env[variable]) {
      throw new Error(`Falta la variable de entorno ${variable}.`);
    }
  }

  const puerto = Number(process.env.DB_PORT);

  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new Error("DB_PORT debe ser un puerto válido.");
  }

  const pool = new pg.Pool({
    host: process.env.DB_HOST,
    port: puerto,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000
  });

  pool.on("error", () => {
    console.error("Error en una conexión inactiva de PostgreSQL.");
  });

  return pool;
}