import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { DatosUsuarios } from "./datos.js";
import { LogicaUsuarios } from "./logica.js";

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

function responderJSON(respuesta, estado, contenido) {
  respuesta.writeHead(estado, {
    "Content-Type": "application/json; charset=utf-8"
  });

  respuesta.end(JSON.stringify(contenido));
}

export function crearAplicacion() {
  const datos = new DatosUsuarios();
  const logica = new LogicaUsuarios(datos);

  const servidor = createServer(async (peticion, respuesta) => {
    respuesta.setHeader("X-Content-Type-Options", "nosniff");

    try {
      const url = new URL(peticion.url, "http://localhost");

      if (peticion.method !== "GET") {
        return responderJSON(respuesta, 405, {
          error: "Método no permitido."
        });
      }

      if (url.pathname === "/api/health") {
        return responderJSON(respuesta, 200, {
          ok: true,
          aplicacion: "CineMatch"
        });
      }

      const archivo = Object.hasOwn(archivosPublicos, url.pathname)
        ? archivosPublicos[url.pathname]
        : null;

      if (!archivo) {
        return responderJSON(respuesta, 404, {
          error: "Ruta no encontrada."
        });
      }

      const contenido = await readFile(archivo.ruta);

      respuesta.writeHead(200, {
        "Content-Type": archivo.tipo
      });

      respuesta.end(contenido);
    } catch {
      console.error("Error al procesar una petición.");

      responderJSON(respuesta, 500, {
        error: "Error interno del servidor."
      });
    }
  });

  return { servidor, logica };
}

// Arranca solo cuando ejecutamos este archivo.
// Importarlo desde las pruebas no abre ningún puerto.
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