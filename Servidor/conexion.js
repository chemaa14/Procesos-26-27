import { crearRegistroActividad } from "./actividad.js";
import pg from "pg";

export function crearPool({ registrarActividad = crearRegistroActividad() } = {}) {
  const variables = [
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD"
  ];

  for (const variable of variables) {
    if (!process.env[variable]) {
      throw Object.assign(new Error(`Falta la variable de entorno ${variable}.`), { code: "CONFIGURACION_INVALIDA" });
    }
  }

  const puerto = Number(process.env.DB_PORT);

  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw Object.assign(new Error("DB_PORT debe ser un puerto válido."), { code: "CONFIGURACION_INVALIDA" });
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

  pool.on("error", error => {
    registrarActividad("error_postgres", { codigo: error?.code });
  });

  return pool;
}