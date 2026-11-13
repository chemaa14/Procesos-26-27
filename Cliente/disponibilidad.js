import { urlCartelSegura } from "./catalogo.js";

export const REGION_DISPONIBILIDAD = "ES";
export const ID_PELICULA_MAXIMO = 2147483647;
export const TEXTO_DISPONIBILIDAD_CARGANDO = "Consultando disponibilidad en España...";
export const TEXTO_DISPONIBILIDAD_SIN_DATOS = "No consta disponibilidad en tus suscripciones en España.";
export const TEXTO_DISPONIBILIDAD_SELECCION =
  "Selecciona al menos una plataforma para comprobar si está incluida en tus suscripciones.";
export const TEXTO_DISPONIBILIDAD_FUENTE =
  "Fuente de disponibilidad: JustWatch. La fecha mostrada es la consulta de CineMatch, no una actualización de JustWatch.";

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const HOSTS_ENLACE = new Set(["www.themoviedb.org", "themoviedb.org"]);
const PARAMETROS_REGION_ENLACE = new Set(["locale", "watch_region", "region"]);
const REGION_VALIDA = /^[A-Za-z]{2}$/;
const CATEGORIAS = Object.freeze([
  ["suscripcion", "Suscripción en España"],
  ["alquiler", "Alquiler"],
  ["compra", "Compra"],
  ["gratis", "Gratis"],
  ["anuncios", "Con anuncios"]
]);

export function urlEnlaceDisponibilidadSegura(valor, idPelicula) {
  if (typeof valor !== "string" || !valor ||
      !Number.isSafeInteger(idPelicula) || idPelicula < 1 || idPelicula > ID_PELICULA_MAXIMO) {
    return null;
  }

  let url;

  try {
    url = new URL(valor);
  } catch {
    return null;
  }

  const patron = new RegExp(`^/movie/${idPelicula}(?:-[A-Za-z0-9._~%-]+)?/watch$`);

  if (url.protocol !== "https:" ||
      !HOSTS_ENLACE.has(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !patron.test(url.pathname)) {
    return null;
  }

  const claves = [...url.searchParams.keys()];

  if (new Set(claves).size !== claves.length) return null;

  for (const [clave, region] of url.searchParams) {
    if (!PARAMETROS_REGION_ENLACE.has(clave) ||
        !REGION_VALIDA.test(region) ||
        region.toUpperCase() !== REGION_DISPONIBILIDAD) {
      return null;
    }
  }

  return url.href;
}

function textoProveedor(valor) {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  return limpio && !CONTROL.test(limpio) ? limpio : null;
}

function leerProveedor(proveedor) {
  if (!proveedor || typeof proveedor !== "object" || Array.isArray(proveedor)) {
    throw new Error("El servidor devolvió una disponibilidad inesperada.");
  }

  const id = proveedor.id;
  const nombre = textoProveedor(proveedor.nombre);

  if (!Number.isSafeInteger(id) || id < 1 || id > ID_PELICULA_MAXIMO || !nombre) {
    throw new Error("El servidor devolvió una disponibilidad inesperada.");
  }

  const logo = proveedor.logo === null ? null : urlCartelSegura(proveedor.logo);

  if (proveedor.logo !== null && logo === null) {
    throw new Error("El servidor devolvió una disponibilidad inesperada.");
  }

  return { id, nombre, logo };
}

function leerProveedores(valor) {
  if (!Array.isArray(valor)) {
    throw new Error("El servidor devolvió una disponibilidad inesperada.");
  }

  const vistos = new Set();
  const salida = [];

  for (const proveedor of valor) {
    const normalizado = leerProveedor(proveedor);

    if (vistos.has(normalizado.id)) continue;

    vistos.add(normalizado.id);
    salida.push(normalizado);
  }

  return salida.sort((a, b) => a.id - b.id);
}

export function leerDisponibilidad(datos, idEsperado) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos) ||
      !Number.isSafeInteger(idEsperado) || idEsperado < 1 || idEsperado > ID_PELICULA_MAXIMO ||
      !Number.isSafeInteger(datos.id) || datos.id !== idEsperado ||
      datos.region !== REGION_DISPONIBILIDAD ||
      typeof datos.consultadoEn !== "string" ||
      Number.isNaN(Date.parse(datos.consultadoEn)) ||
      typeof datos.sinDatos !== "boolean") {
    throw new Error("El servidor devolvió una disponibilidad inesperada.");
  }

  const categorias = {};

  for (const [clave] of CATEGORIAS) {
    categorias[clave] = leerProveedores(datos[clave]);
  }

  const incluidas = leerProveedores(datos.incluidas);
  const idsSuscripcion = new Set(categorias.suscripcion.map(proveedor => proveedor.id));

  if (incluidas.some(proveedor => !idsSuscripcion.has(proveedor.id))) {
    throw new Error("El servidor devolvió una disponibilidad inesperada.");
  }

  return {
    id: datos.id,
    region: REGION_DISPONIBILIDAD,
    consultadoEn: datos.consultadoEn,
    sinDatos: datos.sinDatos,
    incluidas,
    ...categorias,
    enlace: urlEnlaceDisponibilidadSegura(datos.enlace, datos.id),
    mensaje: typeof datos.mensaje === "string" ? datos.mensaje : null
  };
}

export function textoConsultadoEn(consultadoEn) {
  const fecha = new Date(consultadoEn);

  if (Number.isNaN(fecha.getTime())) return null;

  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(fecha);
  } catch {
    return fecha.toISOString();
  }
}

export function seccionesDisponibilidad(disponibilidad) {
  return [
    {
      clave: "incluidas",
      titulo: "Incluida en tus suscripciones",
      proveedores: disponibilidad.incluidas
    },
    ...CATEGORIAS.map(([clave, titulo]) => ({
      clave,
      titulo,
      proveedores: disponibilidad[clave]
    }))
  ];
}

export function crearEstadoDisponibilidad() {
  let version = 0;
  let actual = null;

  return {
    get disponibilidad() {
      return actual;
    },

    iniciar(id) {
      version += 1;
      actual = null;
      return { version, id };
    },

    esVigente(solicitud) {
      return Boolean(solicitud && solicitud.version === version);
    },

    confirmar(solicitud, datos) {
      if (!solicitud || solicitud.version !== version) return false;

      actual = leerDisponibilidad(datos, solicitud.id);
      return true;
    },

    limpiar() {
      version += 1;
      actual = null;
    }
  };
}