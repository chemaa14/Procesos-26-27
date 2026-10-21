import { ErrorOAuth, crearValorOAuth } from "./google-oauth.js";
import { IntentosOAuth } from "./intentos-oauth.js";
import { randomUUID } from "node:crypto";
import { crearRegistroActividad, rutaParaRegistro } from "./actividad.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { DatosUsuarios } from "./datos.js";
import { LogicaUsuarios, ErrorUsuarios, normalizarEmail } from "./logica.js";
import { Sesiones } from "./sesiones.js";

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

const NOMBRE_COOKIE = "cinematch_sesion";
const DURACION_SESION_SEGUNDOS = 8 * 60 * 60;

function leerTokenSesion(peticion) {
  const cookies = (peticion.headers.cookie ?? "")
    .split(";")
    .map(cookie => cookie.trim());

  const coincidencias = cookies.filter(cookie =>
    cookie.startsWith(`${NOMBRE_COOKIE}=`)
  );

  if (coincidencias.length !== 1) {
    return null;
  }

  const token = coincidencias[0].slice(NOMBRE_COOKIE.length + 1);

  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function escribirCookieSesion(respuesta, token, segura) {
  const atributos = [
    `${NOMBRE_COOKIE}=${token ?? ""}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${token ? DURACION_SESION_SEGUNDOS : 0}`
  ];

  if (segura) {
    atributos.push("Secure");
  }

  respuesta.appendHeader("Set-Cookie", atributos.join("; "));
}

const COOKIE_OAUTH = "cinematch_oauth";
function cookieOAuth(respuesta, valor, segura) {
  respuesta.appendHeader("Set-Cookie", `${COOKIE_OAUTH}=${valor ?? ""}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${valor ? 600 : 0}${segura ? "; Secure" : ""}`);
}
function leerCookieOAuth(peticion) {
  const valores = (peticion.headers.cookie ?? "").split(";").map(v => v.trim())
    .filter(v => v.startsWith(`${COOKIE_OAUTH}=`));
  const valor = valores.length === 1 ? valores[0].slice(COOKIE_OAUTH.length + 1) : "";
  return /^[a-f0-9]{64}$/.test(valor) ? valor : null;
}
function redirigirOAuth(respuesta, resultado) {
  respuesta.writeHead(303, {
    Location: `/?oauth=${resultado}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer"
  });
  respuesta.end();
}

function comprobarCabeceraCliente(peticion) {
  if (peticion.headers["x-cinematch"] !== "1") {
    throw new ErrorHTTP(403, "Petición no permitida.");
  }
}

export function crearAplicacion({
  cookieSegura = process.env.NODE_ENV === "production",
  datos = new DatosUsuarios(),
  google = null,
  intentosOAuth = new IntentosOAuth(),
  sesiones = new Sesiones({ duracionMs: DURACION_SESION_SEGUNDOS * 1000 }),
  registrarActividad = crearRegistroActividad()
} = {})
 {

  const logica = new LogicaUsuarios(datos);



async function exigirUsuario(peticion) {
  const token = leerTokenSesion(peticion);
  const sesion = await sesiones.obtener(token);

  if (!sesion) {
    throw new ErrorHTTP(401, "Se requiere una sesión válida.");
  }

  const usuario = await datos.buscarPorId(sesion.usuarioId);

  if (!usuario || !usuario.confirmado || usuario.eliminado) {
    await sesiones.eliminarDeUsuario(sesion.usuarioId);
    throw new ErrorHTTP(401, "Se requiere una sesión válida.");
  }

  return usuario;
}

  function exigirAdministrador(usuario) {
    if (usuario.rol !== "administrador") {
      throw new ErrorHTTP(403, "Se requiere el rol de administrador.");
    }
  }

  const servidor = createServer(async (peticion, respuesta) => {
    respuesta.setHeader("X-Content-Type-Options", "nosniff");
    const inicio = performance.now();
    const actividad = { solicitudId: randomUUID(), metodo: peticion.method, ruta: "otra" };
    let evento = "peticion_http";
    let registrado = false;
    respuesta.setHeader("X-Request-Id", actividad.solicitudId);

    function finalizar(interrumpida = false) {
      if (registrado) return;
      registrado = true;
      const estado = respuesta.statusCode;
      let resultado = evento;
      if (interrumpida) resultado = "peticion_interrumpida";
      else if (estado >= 500) resultado = "error_interno";
      else if (actividad.ruta === "/api/login" && estado === 401) resultado = "login_rechazado";
      else if (estado === 401 || estado === 403) resultado = "acceso_denegado";
      else if (estado >= 400) resultado = "peticion_rechazada";
      try {
        registrarActividad(resultado, {
          ...actividad,
          ...(interrumpida ? {} : { estado }),
          duracionMs: performance.now() - inicio
        });
      } catch { /* Un destino inyectado tampoco debe romper el servidor. */ }
    }
    respuesta.once("finish", () => finalizar());
    respuesta.once("close", () => { if (!respuesta.writableFinished) finalizar(true); });

    try {
      const url = new URL(peticion.url, "http://localhost");
      const ruta = url.pathname;
      actividad.ruta = rutaParaRegistro(ruta);
      const metodo = peticion.method;

      if (ruta === "/api/auth/google") {
        if (metodo !== "POST") return metodoNoPermitido(respuesta, "POST");
        comprobarCabeceraCliente(peticion);
        if (!google) return responderJSON(respuesta, 503, { error: "El acceso con Google aún no está disponible." });
        if (peticion.headers.origin && peticion.headers.origin !== google.origen) {
          throw new ErrorHTTP(403, "Petición no permitida.");
        }
        const estado = crearValorOAuth();
        const navegador = crearValorOAuth();
        const intento = { nonce: crearValorOAuth(), verificador: crearValorOAuth() };
        await intentosOAuth.guardar(estado, navegador, intento);
        cookieOAuth(respuesta, navegador, cookieSegura);
        return responderJSON(respuesta, 200, { url: google.generarURL({ estado, ...intento }) });
      }

      if (ruta === "/api/auth/google/callback") {
        if (metodo !== "GET") return metodoNoPermitido(respuesta, "GET");
        cookieOAuth(respuesta, null, cookieSegura);
        try {
          if (!google) throw new ErrorOAuth("OAUTH_INVALIDO", "proveedor_desactivado");
          const estados = url.searchParams.getAll("state");
          const navegador = leerCookieOAuth(peticion);
          if (!navegador) throw new ErrorOAuth("OAUTH_INVALIDO", "cookie_ausente");
          if (estados.length !== 1 || !/^[a-f0-9]{64}$/.test(estados[0])) {
            throw new ErrorOAuth("OAUTH_INVALIDO", "estado_invalido");
          }
          const intento = await intentosOAuth.consumir(estados[0], navegador);
          if (!intento) throw new ErrorOAuth("OAUTH_INVALIDO", "intento_no_valido");
          if (url.searchParams.get("error") === "access_denied") {
            evento = "oauth_rechazado";
            return redirigirOAuth(respuesta, "cancelado");
          }
          const codigos = url.searchParams.getAll("code");
          if (url.searchParams.has("error") || codigos.length !== 1 || !codigos[0] || codigos[0].length > 4096) {
            throw new ErrorOAuth("OAUTH_INVALIDO", "respuesta_google_invalida");
          }
          const perfil = await google.verificar(codigos[0], intento);
          const usuario = await logica.autenticarGoogle(perfil);
          await sesiones.eliminar(leerTokenSesion(peticion));
          const token = await sesiones.crear(usuario.id);
          escribirCookieSesion(respuesta, token, cookieSegura);
          evento = "login_correcto";
          actividad.usuarioId = usuario.id;
          return redirigirOAuth(respuesta, "correcto");
        } catch (error) {
          evento = error instanceof ErrorOAuth || error instanceof ErrorUsuarios ? "oauth_rechazado" : "error_oauth";
          actividad.codigo = error?.codigo;
          actividad.diagnostico = error?.diagnostico;
          return redirigirOAuth(respuesta, error instanceof ErrorUsuarios && error.codigo === "OAUTH_CUENTA_EXISTENTE" ? "cuenta_existente" : "error");
        }
      }

      if (ruta === "/api/prueba/email") {
        if (metodo !== "POST") return metodoNoPermitido(respuesta, "POST");
        try {
          const cuerpo = await leerJSON(peticion);
          return responderJSON(respuesta, 200, { email: normalizarEmail(cuerpo.email) });
        } catch (error) {
          if (error instanceof ErrorHTTP ||
              (error instanceof ErrorUsuarios && error.codigo === "EMAIL_INVALIDO")) {
            return responderJSON(respuesta, 400, { error: "EMAIL_INVALIDO" });
          }
          throw error;
        }
      }

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

          evento = "usuario_registrado";
          actividad.objetivoId = usuario.id;
          return responderJSON(respuesta, 201, { usuario });
        }


        if (url.pathname === "/api/login") {
          if (peticion.method !== "POST") {
            return metodoNoPermitido(respuesta, "POST");
          }

          comprobarCabeceraCliente(peticion);

          const cuerpo = await leerJSON(peticion);

          const usuario = await logica.autenticar({
            email: cuerpo.email,
            password: cuerpo.password
          });

          // Un nuevo login sustituye la sesión anterior de este navegador.
          await sesiones.eliminar(leerTokenSesion(peticion));

          const token = await sesiones.crear(usuario.id);

          escribirCookieSesion(respuesta, token, cookieSegura);
          evento = "login_correcto";
          actividad.usuarioId = usuario.id;

          return responderJSON(respuesta, 200, { usuario });
        }

        if (url.pathname === "/api/sesion") {
          if (peticion.method !== "GET") {
            return metodoNoPermitido(respuesta, "GET");
          }

          const usuario = await exigirUsuario(peticion);
          actividad.usuarioId = usuario.id;

          return responderJSON(respuesta, 200, { usuario });
        }

        if (url.pathname === "/api/logout") {
          if (peticion.method !== "POST") {
            return metodoNoPermitido(respuesta, "POST");
          }

          comprobarCabeceraCliente(peticion);

          const sesionActual = await sesiones.obtener(leerTokenSesion(peticion));
          actividad.usuarioId = sesionActual?.usuarioId;
          evento = "logout";
          await sesiones.eliminar(leerTokenSesion(peticion));
          escribirCookieSesion(respuesta, null, cookieSegura);

          respuesta.writeHead(204, {
            "Cache-Control": "no-store"
          });

          return respuesta.end();
        }

        if (ruta === "/api/perfil") {
          // La identidad se obtiene de la sesión, nunca del cliente.
          const usuario = await exigirUsuario(peticion);
          actividad.usuarioId = usuario.id;

          if (metodo === "GET") {
            return responderJSON(respuesta, 200, { usuario });
          }

          if (metodo === "DELETE") {
            comprobarCabeceraCliente(peticion);

            await logica.eliminarConPermisos(usuario.id, usuario.id);
            evento = "usuario_eliminado";
            actividad.objetivoId = usuario.id;

            // Invalida todas las sesiones de esta cuenta.
            await sesiones.eliminarDeUsuario(usuario.id);

            // Borra también la cookie de este navegador.
            escribirCookieSesion(respuesta, null, cookieSegura);

            respuesta.writeHead(204, {
              "Cache-Control": "no-store"
            });

            return respuesta.end();
          }

        return metodoNoPermitido(respuesta, "GET, DELETE");
      }

      const rutaActivo = ruta.match(
        /^\/api\/usuarios\/([^/]+)\/activo$/
      );

      const rutaUsuario = ruta.match(
        /^\/api\/usuarios\/([^/]+)$/
      );

      if (ruta === "/api/usuarios" || rutaActivo || rutaUsuario) {
        const actor = await exigirUsuario(peticion);
        actividad.usuarioId = actor.id;
        // DELETE permite cuenta propia o administrador. El resto requiere admin.
        if (!(rutaUsuario && metodo === "DELETE")) {
          exigirAdministrador(actor);
        }

        

        if (ruta === "/api/usuarios") {
          if (metodo === "GET") {
            const usuarios = await logica.listar();
            evento = "usuarios_listados";
            return responderJSON(respuesta, 200, { usuarios });
          }

          if (metodo === "POST") {
            comprobarCabeceraCliente(peticion);
            const contenido = await leerJSON(peticion);

            // Solo admitimos los campos necesarios para el alta.
            const usuario = await logica.alta({
              nombre: contenido.nombre,
              email: contenido.email
            });

            evento = "usuario_creado";
            actividad.objetivoId = usuario.id;
            return responderJSON(respuesta, 201, { usuario });
          }

          return metodoNoPermitido(respuesta, "GET, POST");
        }

        if (rutaActivo) {
          if (metodo !== "GET") {
            return metodoNoPermitido(respuesta, "GET");
          }

          const activo = await logica.estaActivo(rutaActivo[1]);
          evento = "estado_consultado";
          actividad.objetivoId = rutaActivo[1];
          return responderJSON(respuesta, 200, { activo });
        }

        if (metodo !== "DELETE") {
          return metodoNoPermitido(respuesta, "DELETE");
        }

        comprobarCabeceraCliente(peticion);
        await logica.eliminarConPermisos(rutaUsuario[1], actor.id);
        evento = "usuario_eliminado";
        actividad.objetivoId = rutaUsuario[1];
        if (actor.id === rutaUsuario[1]) {
          escribirCookieSesion(respuesta, null, cookieSegura);
        }
        await sesiones.eliminarDeUsuario(rutaUsuario[1]);
        
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
      actividad.codigo = error?.codigo ?? error?.code;
      if (respuesta.destroyed || respuesta.writableEnded) return;

      if (error instanceof ErrorHTTP) {
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
          USUARIO_ELIMINADO: 409,
          CREDENCIALES_INVALIDAS: 401,
          SESION_INVALIDA: 401,
          PERMISO_DENEGADO: 403
        };

        const estado = Object.hasOwn(estados, error.codigo)
          ? estados[error.codigo]
          : 500;

        return responderJSON(respuesta, estado, {
          error: error.message,
          codigo: error.codigo
        });
      }

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
    crearRegistroActividad()("servidor_memoria_iniciado", { puerto });
  });
}