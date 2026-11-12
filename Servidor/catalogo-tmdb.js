export const ORIGEN_TMDB = "https://api.themoviedb.org/3";
export const TIMEOUT_TMDB_PREDETERMINADO_MS = 10000;
export const TIMEOUT_TMDB_MAXIMO_MS = 120000;

const MENSAJES = {
  CONFIGURACION_TMDB_INVALIDA: "La configuración de TMDB no es válida.",
  ENTRADA_INVALIDA: "La consulta al catálogo no es válida.",
  TMDB_AUTENTICACION: "TMDB rechazó las credenciales.",
  TMDB_NO_ENCONTRADO: "TMDB no encontró el recurso solicitado.",
  TMDB_LIMITE: "TMDB limitó temporalmente las peticiones.",
  TMDB_HTTP: "TMDB devolvió una respuesta HTTP no esperada.",
  TMDB_RED: "No se pudo conectar con TMDB.",
  TMDB_TIMEOUT: "La consulta a TMDB agotó el tiempo de espera.",
  TMDB_RESPUESTA_INVALIDA: "TMDB devolvió una respuesta JSON no válida."
};

export class ErrorCatalogoTMDB extends Error {
  constructor(codigo, estado) {
    super(MENSAJES[codigo]);
    this.name = "ErrorCatalogoTMDB";
    this.codigo = codigo;
    if (estado !== undefined) this.estado = estado;
  }
}

function error(codigo, estado) {
  return new ErrorCatalogoTMDB(codigo, estado);
}

function leerToken(env) {
  const valor = env?.TMDB_READ_ACCESS_TOKEN;
  const token = typeof valor === "string" ? valor.trim() : "";
  if (!token || /\s/.test(token)) throw error("CONFIGURACION_TMDB_INVALIDA");
  return token;
}

function leerTimeout(env) {
  const valor = env?.TMDB_TIMEOUT_MS;
  if (valor === undefined || valor === null) return TIMEOUT_TMDB_PREDETERMINADO_MS;
  const timeout = Number(valor);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > TIMEOUT_TMDB_MAXIMO_MS) {
    throw error("CONFIGURACION_TMDB_INVALIDA");
  }
  return timeout;
}

function construirURL(ruta, parametros) {
  if (typeof ruta !== "string" || !ruta.startsWith("/") || ruta.startsWith("//") ||
      ruta.includes("\\") || ruta.includes("://") || /[?#]/.test(ruta) ||
      /[\u0000-\u0020\u007f]/.test(ruta)) {
    throw error("ENTRADA_INVALIDA");
  }

  let url;
  try {
    url = new URL(ORIGEN_TMDB + ruta);
  } catch {
    throw error("ENTRADA_INVALIDA");
  }

  if (url.protocol !== "https:" || url.origin !== "https://api.themoviedb.org" ||
      url.username || url.password || url.search || url.hash ||
      !(url.pathname === "/3" || url.pathname.startsWith("/3/"))) {
    throw error("ENTRADA_INVALIDA");
  }

  if (parametros === undefined) return url;
  if (parametros === null || typeof parametros !== "object" || Array.isArray(parametros)) {
    throw error("ENTRADA_INVALIDA");
  }

  for (const [clave, valor] of Object.entries(parametros)) {
    const tipo = typeof valor;
    if (!clave || /[\u0000-\u0020\u007f]/.test(clave) ||
        !["string", "number", "boolean"].includes(tipo) ||
        (tipo === "number" && !Number.isFinite(valor))) {
      throw error("ENTRADA_INVALIDA");
    }
    url.searchParams.set(clave, String(valor));
  }

  return url;
}

export function crearCatalogoTMDB(env = process.env, fetchImpl = globalThis.fetch) {
  const token = leerToken(env);
  const timeout = leerTimeout(env);
  if (typeof fetchImpl !== "function") throw error("CONFIGURACION_TMDB_INVALIDA");

  return Object.freeze({
    async consultar(ruta, parametros) {
      const url = construirURL(ruta, parametros);
      const controlador = new AbortController();
      let expirado = false;
      const temporizador = setTimeout(() => {
        expirado = true;
        controlador.abort();
      }, timeout);

      try {
        let respuesta;
        try {
          respuesta = await fetchImpl(url.href, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json"
            },
            redirect: "error",
            signal: controlador.signal
          });
        } catch {
          throw error(expirado ? "TMDB_TIMEOUT" : "TMDB_RED");
        }

        if (respuesta.status === 401 || respuesta.status === 403) throw error("TMDB_AUTENTICACION");
        if (respuesta.status === 404) throw error("TMDB_NO_ENCONTRADO");
        if (respuesta.status === 429) throw error("TMDB_LIMITE");
        if (!respuesta.ok) throw error("TMDB_HTTP", respuesta.status);

        let texto;
        try {
          texto = await respuesta.text();
        } catch {
          throw error(expirado ? "TMDB_TIMEOUT" : "TMDB_RED");
        }

        try {
          return JSON.parse(texto);
        } catch {
          throw error("TMDB_RESPUESTA_INVALIDA");
        }
      } finally {
        clearTimeout(temporizador);
        controlador.abort();
      }
    }
  });
}
