import { ID_PELICULA_MAXIMO } from "./detalle-pelicula.js";

export const REGION_DISPONIBILIDAD = "ES";

const CARTEL_BASE = "https://image.tmdb.org/t/p/w500";
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const ID_VALIDO = /^[1-9]\d*$/;
const LOGO_SEGURO = /^\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const REGION_VALIDA = /^[A-Za-z]{2}$/;
const HOSTS_ENLACE = new Set(["www.themoviedb.org", "themoviedb.org"]);
const PARAMETROS_REGION_ENLACE = new Set(["locale", "watch_region", "region"]);

const CATEGORIAS = Object.freeze([
  ["suscripcion", "flatrate"],
  ["alquiler", "rent"],
  ["compra", "buy"],
  ["gratis", "free"],
  ["anuncios", "ads"]
]);

const MENSAJES = {
  ENTRADA_INVALIDA: "El identificador de la película no es válido.",
  PELICULA_NO_ENCONTRADA: "Película no encontrada.",
  RESPUESTA_PROVEEDOR_INVALIDA: "El proveedor devolvió una disponibilidad no válida."
};

const MENSAJE_SELECCION =
  "Selecciona al menos una plataforma para comprobar si está incluida en tus suscripciones.";
const MENSAJE_SIN_DATOS =
  "No consta disponibilidad en tus suscripciones en España.";

export class ErrorDisponibilidadPelicula extends Error {
  constructor(codigo) {
    super(MENSAJES[codigo]);
    this.name = "ErrorDisponibilidadPelicula";
    this.codigo = codigo;
  }
}

function entradaInvalida() {
  return new ErrorDisponibilidadPelicula("ENTRADA_INVALIDA");
}

function respuestaInvalida() {
  return new ErrorDisponibilidadPelicula("RESPUESTA_PROVEEDOR_INVALIDA");
}

function validarId(id) {
  if (typeof id !== "string" || !ID_VALIDO.test(id)) throw entradaInvalida();

  const numero = Number(id);
  if (!Number.isSafeInteger(numero) || numero > ID_PELICULA_MAXIMO) {
    throw entradaInvalida();
  }

  return numero;
}

function textoUtil(valor) {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  return limpio && !CONTROL.test(limpio) ? limpio : null;
}

function construirLogo(ruta) {
  if (typeof ruta !== "string" || ruta.length > 200 || !LOGO_SEGURO.test(ruta)) {
    return null;
  }
  return CARTEL_BASE + ruta;
}

function normalizarProveedor(proveedor) {
  if (!proveedor || typeof proveedor !== "object" || Array.isArray(proveedor)) {
    throw respuestaInvalida();
  }

  const id = proveedor.provider_id;
  const nombre = textoUtil(proveedor.provider_name);

  if (!Number.isSafeInteger(id) || id < 1 || id > ID_PELICULA_MAXIMO || !nombre) {
    throw respuestaInvalida();
  }

  return {
    id,
    nombre,
    logo: construirLogo(proveedor.logo_path)
  };
}

function normalizarCategoria(datosPais, clave) {
  const valor = datosPais[clave];

  if (valor === undefined) return [];
  if (!Array.isArray(valor)) throw respuestaInvalida();

  const vistos = new Set();
  const salida = [];

  for (const proveedor of valor) {
    const normalizado = normalizarProveedor(proveedor);

    if (vistos.has(normalizado.id)) continue;

    vistos.add(normalizado.id);
    salida.push(normalizado);
  }

  return salida.sort((a, b) => a.id - b.id);
}

function validarEnlace(enlace, idSolicitado) {
  if (typeof enlace !== "string" || !enlace) return null;

  let url;
  try {
    url = new URL(enlace);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" ||
      !HOSTS_ENLACE.has(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !new RegExp(`^/movie/${idSolicitado}(?:-[A-Za-z0-9._~%-]+)?/watch$`).test(url.pathname)) {
    return null;
  }

  const claves = [...url.searchParams.keys()];

  if (new Set(claves).size !== claves.length) return null;

  for (const [clave, valor] of url.searchParams) {
    if (!PARAMETROS_REGION_ENLACE.has(clave) ||
        !REGION_VALIDA.test(valor) ||
        valor.toUpperCase() !== REGION_DISPONIBILIDAD) {
      return null;
    }
  }

  return url.href;
}

function normalizarRespuesta(datos, idSolicitado) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    throw respuestaInvalida();
  }

  if (Object.hasOwn(datos, "id") && datos.id !== undefined) {
    if (!Number.isSafeInteger(datos.id) ||
        datos.id < 1 ||
        datos.id > ID_PELICULA_MAXIMO ||
        datos.id !== idSolicitado) {
      throw respuestaInvalida();
    }
  }

  const resultados = datos.results;

  if (!resultados || typeof resultados !== "object" || Array.isArray(resultados)) {
    throw respuestaInvalida();
  }

  if (!Object.hasOwn(resultados, REGION_DISPONIBILIDAD) ||
      resultados[REGION_DISPONIBILIDAD] === undefined) {
    const categoriasVacias = Object.fromEntries(CATEGORIAS.map(([nombre]) => [nombre, []]));

    return {
      sinDatos: true,
      categorias: categoriasVacias,
      enlace: null
    };
  }

  const datosPais = resultados[REGION_DISPONIBILIDAD];

  if (!datosPais || typeof datosPais !== "object" || Array.isArray(datosPais)) {
    throw respuestaInvalida();
  }

  const categorias = {};

  for (const [nombre, clave] of CATEGORIAS) {
    categorias[nombre] = normalizarCategoria(datosPais, clave);
  }

  return {
    sinDatos: CATEGORIAS.every(([nombre]) => categorias[nombre].length === 0),
    categorias,
    enlace: validarEnlace(datosPais.link, idSolicitado)
  };
}

function normalizarConsultadoEn(reloj) {
  const valor = reloj();
  const fecha = valor instanceof Date ? new Date(valor.getTime()) : new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    throw new Error("El reloj de disponibilidad no es válido.");
  }

  return fecha.toISOString();
}

function seleccionNormalizada(preferencias) {
  const plataformas = preferencias?.plataformas;

  if (!Array.isArray(plataformas) ||
      plataformas.some(id => !Number.isSafeInteger(id) ||
        id < 1 || id > ID_PELICULA_MAXIMO)) {
    throw respuestaInvalida();
  }

  return new Set(plataformas);
}

export function crearServicioDisponibilidad(adaptador, preferencias, { reloj = () => new Date() } = {}) {
  if (!adaptador || typeof adaptador.consultar !== "function") {
    throw entradaInvalida();
  }
  if (!preferencias || typeof preferencias.obtener !== "function") {
    throw entradaInvalida();
  }
  if (typeof reloj !== "function") throw entradaInvalida();

  return Object.freeze({
    async obtener(id, usuarioId) {
      const idSolicitado = validarId(id);
      const seleccion = seleccionNormalizada(await preferencias.obtener(usuarioId));
      const consultadoEn = normalizarConsultadoEn(reloj);

      let datos;
      try {
        datos = await adaptador.consultar(`/movie/${idSolicitado}/watch/providers`);
      } catch (error) {
        if (error?.codigo === "TMDB_NO_ENCONTRADO") {
          throw new ErrorDisponibilidadPelicula("PELICULA_NO_ENCONTRADA");
        }
        throw error;
      }

      const normalizado = normalizarRespuesta(datos, idSolicitado);
      const incluidas = normalizado.categorias.suscripcion.filter(
        proveedor => seleccion.has(proveedor.id)
      );

      let mensaje = null;
      if (seleccion.size === 0) {
        mensaje = MENSAJE_SELECCION;
      } else if (normalizado.sinDatos || incluidas.length === 0) {
        mensaje = MENSAJE_SIN_DATOS;
      }

      return {
        id: idSolicitado,
        region: REGION_DISPONIBILIDAD,
        consultadoEn,
        sinDatos: normalizado.sinDatos,
        incluidas,
        suscripcion: normalizado.categorias.suscripcion,
        alquiler: normalizado.categorias.alquiler,
        compra: normalizado.categorias.compra,
        gratis: normalizado.categorias.gratis,
        anuncios: normalizado.categorias.anuncios,
        enlace: normalizado.enlace,
        mensaje
      };
    }
  });
}