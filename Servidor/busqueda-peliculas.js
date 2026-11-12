export const TITULO_MAXIMO = 200;
export const ANIO_MINIMO = 1000;
export const ANIO_MAXIMO = 9999;
export const PAGINA_MINIMA = 1;
export const PAGINA_MAXIMA = 500;

const CARTEL_BASE = "https://image.tmdb.org/t/p/w500";
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const ANIO_VALIDO = /^\d{4}$/;
const PAGINA_VALIDA = /^\d+$/;
const CARTEL_SEGURO = /^\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FECHA_VALIDA = /^(\d{4})-\d{2}-\d{2}$/;

const MENSAJES = {
  ENTRADA_INVALIDA: "La búsqueda de películas no es válida.",
  RESPUESTA_PROVEEDOR_INVALIDA: "El catálogo devolvió una respuesta no válida."
};

export class ErrorBusquedaPeliculas extends Error {
  constructor(codigo) {
    super(MENSAJES[codigo]);
    this.name = "ErrorBusquedaPeliculas";
    this.codigo = codigo;
  }
}

function entradaInvalida() {
  return new ErrorBusquedaPeliculas("ENTRADA_INVALIDA");
}

function respuestaInvalida() {
  return new ErrorBusquedaPeliculas("RESPUESTA_PROVEEDOR_INVALIDA");
}

function validarTitulo(titulo) {
  if (typeof titulo !== "string" || CONTROL.test(titulo)) throw entradaInvalida();

  const limpio = titulo.trim();
  if (!limpio || limpio.length > TITULO_MAXIMO) throw entradaInvalida();

  return limpio;
}

function validarAnio(anio) {
  if (anio === undefined) return undefined;
  if (typeof anio !== "string" || !ANIO_VALIDO.test(anio)) throw entradaInvalida();

  const valor = Number(anio);
  if (valor < ANIO_MINIMO || valor > ANIO_MAXIMO) throw entradaInvalida();

  return valor;
}

function validarPagina(pagina) {
  if (pagina === undefined) return PAGINA_MINIMA;
  if (typeof pagina !== "string" || !PAGINA_VALIDA.test(pagina)) throw entradaInvalida();

  const valor = Number(pagina);
  if (!Number.isSafeInteger(valor) || valor < PAGINA_MINIMA || valor > PAGINA_MAXIMA) {
    throw entradaInvalida();
  }

  return valor;
}

function tituloUtil(valor) {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  return limpio && !CONTROL.test(limpio) ? limpio : null;
}

function extraerAnio(fecha) {
  if (typeof fecha !== "string") return null;
  const coincidencia = fecha.match(FECHA_VALIDA);
  if (!coincidencia) return null;

  const anio = Number(coincidencia[1]);
  return anio >= ANIO_MINIMO && anio <= ANIO_MAXIMO ? anio : null;
}

function construirCartel(ruta) {
  if (typeof ruta !== "string" || ruta.length > 200 || !CARTEL_SEGURO.test(ruta)) {
    return null;
  }
  return CARTEL_BASE + ruta;
}

function normalizarPelicula(pelicula) {
  if (!pelicula || typeof pelicula !== "object" || Array.isArray(pelicula)) {
    throw respuestaInvalida();
  }
  if (!Number.isSafeInteger(pelicula.id) || pelicula.id <= 0) throw respuestaInvalida();

  const titulo = tituloUtil(pelicula.title) ?? tituloUtil(pelicula.original_title);
  if (!titulo) throw respuestaInvalida();

  return {
    id: pelicula.id,
    titulo,
    anio: extraerAnio(pelicula.release_date),
    cartel: construirCartel(pelicula.poster_path)
  };
}

function normalizarRespuesta(datos, paginaSolicitada) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    throw respuestaInvalida();
  }
  if (!Number.isSafeInteger(datos.page) || datos.page < 1 ||
      !Number.isSafeInteger(datos.total_pages) || datos.total_pages < 0 ||
      !Number.isSafeInteger(datos.total_results) || datos.total_results < 0 ||
      !Array.isArray(datos.results)) {
    throw respuestaInvalida();
  }
  if (datos.page !== paginaSolicitada ||
      datos.total_results < datos.results.length ||
      (datos.results.length > 0 &&
        (datos.total_pages < 1 || datos.page > datos.total_pages))) {
    throw respuestaInvalida();
  }

  return {
    pagina: datos.page,
    totalPaginas: datos.total_pages,
    totalResultados: datos.total_results,
    peliculas: datos.results.map(normalizarPelicula)
  };
}

export function crearServicioBusqueda(catalogo) {
  if (!catalogo || typeof catalogo.consultar !== "function") {
    throw new ErrorBusquedaPeliculas("ENTRADA_INVALIDA");
  }

  return Object.freeze({
    async buscar(consulta) {
      if (!consulta || typeof consulta !== "object" || Array.isArray(consulta)) {
        throw entradaInvalida();
      }

      const titulo = validarTitulo(consulta.titulo);
      const anio = validarAnio(consulta.anio);
      const pagina = validarPagina(consulta.pagina);
      const parametros = {
        query: titulo,
        language: "es-ES",
        include_adult: false,
        page: pagina
      };

      if (anio !== undefined) parametros.primary_release_year = anio;

      return normalizarRespuesta(
        await catalogo.consultar("/search/movie", parametros),
        pagina
      );
    }
  });
}
