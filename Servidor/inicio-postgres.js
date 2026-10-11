import { crearRegistroActividad } from "./actividad.js";
import { once } from "node:events";
import { crearAplicacion } from "./api.js";
import { crearPool } from "./conexion.js";
import { DatosUsuariosPostgres } from "./datos-postgres.js";

const registrarActividad = crearRegistroActividad();
let pool;
let servidor;

try {
  pool = crearPool({ registrarActividad });
  // Comprueba la conexión y que la tabla está preparada.
  await pool.query("SELECT id, rol FROM usuarios LIMIT 0");

  const datos = new DatosUsuariosPostgres(pool);
  const aplicacion = crearAplicacion({ datos, registrarActividad });
  servidor = aplicacion.servidor;

  const puerto = Number(process.env.PORT || 3000);
  const host =
  process.env.HOST ||
  (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

  servidor.listen(puerto, host);
  await once(servidor, "listening");

  registrarActividad("servidor_iniciado", { puerto });

  let cerrando = false;

  async function cerrar() {
    if (cerrando) return;
    cerrando = true;

    registrarActividad("servidor_cerrando");

    const limite = setTimeout(() => {
      servidor.closeAllConnections();
    }, 5000);
    limite.unref();

    try {
      await new Promise((resolve, reject) => {
        servidor.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      await pool.end();
      registrarActividad("servidor_cerrado");
    } catch (error) {
      registrarActividad("error_cierre", { codigo: error?.code });
      process.exitCode = 1;
    } finally {
      clearTimeout(limite);
    }
  }

  process.once("SIGINT", cerrar);
  process.once("SIGTERM", cerrar);
} catch (error) {
  registrarActividad("error_inicio", { codigo: error?.code });

  if (servidor?.listening) {
    servidor.close();
    servidor.closeAllConnections();
  }

  try {
    await pool?.end();
  } catch (errorCierre) {
    registrarActividad("error_cierre", { codigo: errorCierre?.code });
  }
  process.exitCode = 1;
}