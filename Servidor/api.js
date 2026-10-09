import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createHash, timingSafeEqual } from "node:crypto";

import { DatosUsuarios } from "./datos.js";
import { LogicaUsuarios, ErrorUsuarios } from "./logica.js";

const archivosPublicos = {
  "/": {
    ruta: new URL("../Cliente/index.html", import.meta.url),
    tipo: "text/html; charset=utf-8"
  },
  "/gui.js": {
    ruta: new URL("../Cliente/gui.js", import.meta.url),
    tipo: "text/javascript; charset=utf-8"
  },
  "/rest.js": {
    ruta: new URL("../Cliente/rest.js", import.meta.url),
    tipo: "text/javascript; charset=utf-8"
  }
};

class ErrorHTTP extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

function responderJSON(respuesta, estado, contenido) {
  respuesta.writeHead(estado, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  respuesta.end(JSON.stringify(contenido));
}

function metodoNoPermitido(respuesta, permitidos) {
  respuesta.setHeader("Allow", permitidos);

  return responderJSON(respuesta, 405, {
    error: "Método no permitido."
  });
}

function comprobarAcceso(peticion, tokenAdmin) {
  if (!tokenAdmin) {
    throw new ErrorHTTP(
      503,
      "La API de usuarios todavía no está habilitada."
    );
  }

  const recibido = peticion.headers.authorization || "";
  const esperado = `Bearer ${tokenAdmin}`;

  const hashRecibido = createHash("sha256")
    .update(recibido)
    .digest();

  const hashEsperado = createHash("sha256")
    .update(esperado)
    .digest();

  if (!timingSafeEqual(hashRecibido, hashEsperado)) {
    throw new ErrorHTTP(401, "Credenciales no válidas.");
  }
}

function leerJSON(peticion) {
  const tipo = (peticion.headers["content-type"] || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (tipo !== "application/json") {
    peticion.resume();
    throw new ErrorHTTP(415, "Debes enviar application/json.");
  }

  return new Promise((resolve, reject) => {
    const fragmentos = [];
    let bytes = 0;
    let excedido = false;

    peticion.on("data", (fragmento) => {
      if (excedido) return;

      bytes += fragmento.length;

      if (bytes > 16 * 1024) {
        excedido = true;
        fragmentos.length = 0;
        reject(new ErrorHTTP(413, "El cuerpo supera los 16 KiB."));
        return;
      }

      fragmentos.push(fragmento);
    });

    peticion.on("end", () => {
      if (excedido) return;

      let contenido;

      try {
        contenido = JSON.parse(
          Buffer.concat(fragmentos).toString("utf8")
        );
      } catch {
        reject(new ErrorHTTP(400, "El JSON no es válido."));
        return;
      }

      if (
        contenido === null ||
        typeof contenido !== "object" ||
        Array.isArray(contenido)
      ) {
        reject(new ErrorHTTP(400, "Debes enviar un objeto JSON."));
        return;
      }

      resolve(contenido);
    });

    peticion.on("error", reject);

    peticion.on("aborted", () => {
      reject(new ErrorHTTP(400, "La petición se ha interrumpido."));
    });
  });
}

export function crearAplicacion({
  tokenAdmin = process.env.API_ADMIN_TOKEN || ""
} = {}) {
  const datos = new DatosUsuarios();
  const logica = new LogicaUsuarios(datos);

  const servidor = createServer(async (peticion, respuesta) => {
    respuesta.setHeader("X-Content-Type-Options", "nosniff");

    try {
      const url = new URL(peticion.url, "http://localhost");
      const ruta = url.pathname;
      const metodo = peticion.method;

      if (ruta === "/api/health") {
        if (metodo !== "GET") {
          return metodoNoPermitido(respuesta, "GET");
        }

        return responderJSON(respuesta, 200, {
          ok: true,
          aplicacion: "CineMatch"
        });
      }
      
      if (url.pathname === "/api/registro") {
          if (peticion.method !== "POST") {
            return metodoNoPermitido(respuesta, "POST");
          }

          const cuerpo = await leerJSON(peticion);

          const usuario = await logica.registrar({
            nombre: cuerpo.nombre,
            email: cuerpo.email,
            password: cuerpo.password
          });

          return responderJSON(respuesta, 201, { usuario });
        }

      const rutaActivo = ruta.match(
        /^\/api\/usuarios\/([^/]+)\/activo$/
      );

      const rutaUsuario = ruta.match(
        /^\/api\/usuarios\/([^/]+)$/
      );

      if (ruta === "/api/usuarios" || rutaActivo || rutaUsuario) {
        comprobarAcceso(peticion, tokenAdmin);

        if (ruta === "/api/usuarios") {
          if (metodo === "GET") {
            return responderJSON(respuesta, 200, {
              usuarios: logica.listar()
            });
          }

          if (metodo === "POST") {
            const contenido = await leerJSON(peticion);

            // Solo admitimos los campos necesarios para el alta.
            const usuario = logica.alta({
              nombre: contenido.nombre,
              email: contenido.email
            });

            return responderJSON(respuesta, 201, { usuario });
          }

          return metodoNoPermitido(respuesta, "GET, POST");
        }

        if (rutaActivo) {
          if (metodo !== "GET") {
            return metodoNoPermitido(respuesta, "GET");
          }

          return responderJSON(respuesta, 200, {
            activo: logica.estaActivo(rutaActivo[1])
          });
        }

        if (metodo !== "DELETE") {
          return metodoNoPermitido(respuesta, "DELETE");
        }

        logica.eliminar(rutaUsuario[1]);
        respuesta.writeHead(204, { "Cache-Control": "no-store" });
        return respuesta.end();
      }

      const archivo = Object.hasOwn(archivosPublicos, ruta)
        ? archivosPublicos[ruta]
        : null;

      if (!archivo) {
        return responderJSON(respuesta, 404, {
          error: "Ruta no encontrada."
        });
      }

      if (metodo !== "GET") {
        return metodoNoPermitido(respuesta, "GET");
      }

      const contenido = await readFile(archivo.ruta);

      respuesta.writeHead(200, {
        "Content-Type": archivo.tipo
      });

      respuesta.end(contenido);
    } catch (error) {
      if (respuesta.destroyed || respuesta.writableEnded) return;

      if (error instanceof ErrorHTTP) {
        if (error.estado === 401) {
          respuesta.setHeader("WWW-Authenticate", "Bearer");
        }

        if (error.estado === 413) {
          respuesta.setHeader("Connection", "close");
        }

        return responderJSON(respuesta, error.estado, {
          error: error.message
        });
      }

      if (error instanceof ErrorUsuarios) {
        const estados = {
          NOMBRE_INVALIDO: 400,
          EMAIL_INVALIDO: 400,
          PASSWORD_INVALIDA: 400,
          EMAIL_DUPLICADO: 409,
          USUARIO_NO_ENCONTRADO: 404,
          USUARIO_ELIMINADO: 409
        };

        const estado = Object.hasOwn(estados, error.codigo)
          ? estados[error.codigo]
          : 500;

        return responderJSON(respuesta, estado, {
          error: error.message,
          codigo: error.codigo
        });
      }

      console.error("Error interno al procesar una petición.");

      responderJSON(respuesta, 500, {
        error: "Error interno del servidor."
      });
    }
  });

  return { servidor, logica };
}

// Importar este archivo desde las pruebas no abre ningún puerto.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const puerto = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";

  const { servidor } = crearAplicacion();

  servidor.listen(puerto, host, () => {
    console.log(`CineMatch iniciado en el puerto ${puerto}`);
  });
}