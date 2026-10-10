import { once } from "node:events";
import { crearAplicacion } from "./api.js";
import { crearPool } from "./conexion.js";
import { DatosUsuariosPostgres } from "./datos-postgres.js";

const pool = crearPool();
let servidor;

try {
  // Comprueba la conexión y que la tabla está preparada.
  await pool.query("SELECT id FROM usuarios LIMIT 0");

  const datos = new DatosUsuariosPostgres(pool);
  const aplicacion = crearAplicacion({ datos });
  servidor = aplicacion.servidor;

  const puerto = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";

  servidor.listen(puerto, host);
  await once(servidor, "listening");

  console.log(`CineMatch con PostgreSQL iniciado en el puerto ${puerto}`);

  let cerrando = false;

  async function cerrar() {
    if (cerrando) return;
    cerrando = true;

    console.log("Cerrando CineMatch...");

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
    } catch {
      console.error("Error al cerrar la aplicación.");
      process.exitCode = 1;
    } finally {
      clearTimeout(limite);
    }
  }

  process.once("SIGINT", cerrar);
  process.once("SIGTERM", cerrar);
} catch {
  console.error(
    "No se pudo iniciar CineMatch. Revisa PostgreSQL, las variables y la tabla usuarios."
  );

  if (servidor?.listening) {
    servidor.close();
    servidor.closeAllConnections();
  }

  await pool.end();
  process.exitCode = 1;
}