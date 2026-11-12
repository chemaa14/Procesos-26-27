export const TITULO_MAXIMO = 200;
export const PAGINA_MAXIMA = 500;
export const TEXTO_TITULO_AUSENTE = "Título no disponible";
export const TEXTO_ANIO_AUSENTE = "Año no disponible";
export const TEXTO_DURACION_AUSENTE = "Duración no disponible";
export const TEXTO_GENEROS_AUSENTES = "Géneros no disponibles";
export const TEXTO_SINOPSIS_AUSENTE = "Sinopsis no disponible";
export const TEXTO_CARTEL_AUSENTE = "Cartel no disponible";

const ANIO_VALIDO = /^\d{4}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const CONTROL_SINOPSIS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const RUTA_CARTEL = "/t/p/w500/";

export function validarBusqueda({ titulo, anio } = {}) {
  if (typeof titulo !== "string" || CONTROL.test(titulo)) {
    return {
      valido: false,
      campo: "titulo",
      error: "El título no es válido."
    };
  }

  const tituloLimpio = titulo.trim();

  if (!tituloLimpio) {
    return {
      valido: false,
      campo: "titulo",
      error: "Escribe un título para buscar."
    };
  }

  if (tituloLimpio.length > TITULO_MAXIMO) {
    return {
      valido: false,
      campo: "titulo",
      error: `El título no puede superar los ${TITULO_MAXIMO} caracteres.`
    };
  }

  let anioLimpio;

  if (anio !== undefined && anio !== null && anio !== "") {
    if (typeof anio !== "string") {
      return {
        valido: false,
        campo: "anio",
        error: "El año debe tener cuatro dígitos."
      };
    }

    anioLimpio = anio.trim();

    if (!ANIO_VALIDO.test(anioLimpio) || Number(anioLimpio) < 1000) {
      return {
        valido: false,
        campo: "anio",
        error: "El año debe tener cuatro dígitos entre 1000 y 9999."
      };
    }
  }

  return {
    valido: true,
    titulo: tituloLimpio,
    anio: anioLimpio
  };
}

export function limitePaginas(totalPaginas) {
  return Number.isSafeInteger(totalPaginas) && totalPaginas > 0
    ? Math.min(totalPaginas, PAGINA_MAXIMA)
    : 0;
}

export function textoPaginaActual(pagina, totalPaginas) {
  return `Página ${pagina} de ${limitePaginas(totalPaginas)}`;
}

export function textoResumenResultados({
  totalResultados,
  pagina,
  totalPaginas
}) {
  const total = Number.isSafeInteger(totalResultados) && totalResultados >= 0
    ? totalResultados
    : 0;
  const sustantivo = total === 1 ? "resultado" : "resultados";

  return `${total} ${sustantivo} · ${textoPaginaActual(pagina, totalPaginas)}`;
}

export function textoTitulo(titulo) {
  if (typeof titulo !== "string") return TEXTO_TITULO_AUSENTE;

  const limpio = titulo.trim();
  return limpio && !CONTROL.test(limpio) ? limpio : TEXTO_TITULO_AUSENTE;
}

export function textoAnio(anio) {
  return Number.isInteger(anio) && anio >= 1000 && anio <= 9999
    ? String(anio)
    : TEXTO_ANIO_AUSENTE;
}

export function textoDuracion(duracion) {
  return Number.isInteger(duracion) && duracion > 0
    ? `${duracion} min`
    : TEXTO_DURACION_AUSENTE;
}

export function textoGeneros(generos) {
  const nombres = Array.isArray(generos)
    ? generos
      .map(genero => typeof genero?.nombre === "string" ? genero.nombre.trim() : "")
      .filter(nombre => nombre && !CONTROL.test(nombre))
    : [];

  return nombres.length > 0 ? nombres.join(", ") : TEXTO_GENEROS_AUSENTES;
}

export function textoSinopsis(sinopsis) {
  if (typeof sinopsis !== "string") return TEXTO_SINOPSIS_AUSENTE;

  const limpia = sinopsis.trim();
  return limpia && !CONTROL_SINOPSIS.test(limpia)
    ? limpia
    : TEXTO_SINOPSIS_AUSENTE;
}

export function urlCartelSegura(valor) {
  if (typeof valor !== "string") return null;

  let url;

  try {
    url = new URL(valor);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.hostname !== "image.tmdb.org") {
    return null;
  }

  if (url.port || url.username || url.password || url.search || url.hash) {
    return null;
  }

  if (!url.pathname.startsWith(RUTA_CARTEL)) return null;

  const nombre = url.pathname.slice(RUTA_CARTEL.length);

  return nombre && !nombre.includes("/") ? url.href : null;
}

export function crearEstadoCatalogo() {
  let versionBusqueda = 0;
  let versionDetalle = 0;
  let busqueda = null;
  let detalle = null;

  function crearSolicitudBusqueda(titulo, anio, pagina) {
    const paginaSolicitada = Number.isSafeInteger(pagina) &&
      pagina >= 1 && pagina <= PAGINA_MAXIMA
      ? pagina
      : 1;

    versionBusqueda += 1;
    versionDetalle += 1;
    detalle = null;

    return {
      version: versionBusqueda,
      consulta: { titulo, anio, pagina: paginaSolicitada }
    };
  }

  return {
    get busqueda() {
      return busqueda;
    },

    get detalle() {
      return detalle;
    },

    iniciarBusqueda(titulo, anio, pagina = 1) {
      return crearSolicitudBusqueda(titulo, anio, pagina);
    },

    irPaginaAnterior() {
      if (!busqueda || busqueda.pagina <= 1) return null;

      return crearSolicitudBusqueda(
        busqueda.titulo,
        busqueda.anio,
        busqueda.pagina - 1
      );
    },

    irPaginaSiguiente() {
      if (!busqueda) return null;

      const limite = limitePaginas(busqueda.totalPaginas);
      if (busqueda.pagina >= limite) return null;

      return crearSolicitudBusqueda(
        busqueda.titulo,
        busqueda.anio,
        busqueda.pagina + 1
      );
    },

    puedeAnterior() {
      return Boolean(busqueda && busqueda.pagina > 1);
    },

    puedeSiguiente() {
      return Boolean(
        busqueda && busqueda.pagina < limitePaginas(busqueda.totalPaginas)
      );
    },

    confirmarBusqueda(solicitud, respuesta) {
      if (!solicitud || solicitud.version !== versionBusqueda) return false;

      if (
        !respuesta ||
        typeof respuesta !== "object" ||
        !Array.isArray(respuesta.peliculas) ||
        !Number.isSafeInteger(respuesta.pagina) ||
        respuesta.pagina !== solicitud.consulta.pagina ||
        !Number.isSafeInteger(respuesta.totalPaginas) ||
        respuesta.totalPaginas < 0 ||
        !Number.isSafeInteger(respuesta.totalResultados) ||
        respuesta.totalResultados < 0
      ) {
        throw new Error("El servidor devolvió una respuesta inesperada.");
      }

      busqueda = {
        titulo: solicitud.consulta.titulo,
        anio: solicitud.consulta.anio,
        pagina: respuesta.pagina,
        totalPaginas: respuesta.totalPaginas,
        totalResultados: respuesta.totalResultados,
        peliculas: respuesta.peliculas.slice()
      };

      return true;
    },

    esVigenteBusqueda(solicitud) {
      return Boolean(solicitud && solicitud.version === versionBusqueda);
    },

    iniciarDetalle(id) {
      versionDetalle += 1;

      return { version: versionDetalle, id };
    },

    confirmarDetalle(solicitud, ficha) {
      if (!solicitud || solicitud.version !== versionDetalle) return false;

      if (!ficha || typeof ficha !== "object" || Array.isArray(ficha)) {
        throw new Error("El servidor devolvió una ficha inesperada.");
      }

      detalle = ficha;
      return true;
    },

    esVigenteDetalle(solicitud) {
      return Boolean(solicitud && solicitud.version === versionDetalle);
    },

    cerrarDetalle() {
      versionDetalle += 1;
      detalle = null;
    },

    limpiar() {
      versionBusqueda += 1;
      versionDetalle += 1;
      busqueda = null;
      detalle = null;
    }
  };
}