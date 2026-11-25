import { ID_PELICULA_MAXIMO } from "./detalle-pelicula.js";

// Sugerencia aleatoria «¿Qué vemos hoy?»: elige al azar una película de TMDB
// que esté incluida en la suscripción de alguna de las plataformas guardadas
// por el usuario en España y que cumpla los filtros opcionales.

export const REGION_SUGERENCIA = "ES";
export const DURACION_MINIMA = 30;
export const DURACION_MAXIMA = 400;
export const VALORACION_MINIMA = 1;
export const VALORACION_MAXIMA = 9;
// TMDB no devuelve más allá de la página 500 de /discover/movie.
export const PAGINAS_MAXIMAS = 500;
// Evita que una película con dos votos de 10 pase el filtro de valoración.
export const VOTOS_MINIMOS_CON_VALORACION = 50;

export const PARAMETROS_SUGERENCIA = Object.freeze([
  "genero", "duracionMaxima", "valoracionMinima", "excluir"
]);

const CARTEL_BASE = "https://image.tmdb.org/t/p/w500";
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const ENTERO_POSITIVO = /^[1-9]\d*$/;
const CARTEL_SEGURO = /^\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FECHA_VALIDA = /^(\d{4})-\d{2}-\d{2}$/;

const MENSAJES = {
  ENTRADA_INVALIDA: "Los filtros de la sugerencia no son válidos.",
  RESPUESTA_PROVEEDOR_INVALIDA: "El catálogo devolvió una respuesta no válida."
};

export const MENSAJE_SIN_PLATAFORMAS =
  "Selecciona al menos una plataforma en «Mis plataformas» para recibir sugerencias.";
export const MENSAJE_SIN_RESULTADOS =
  "No hay películas en tus plataformas que cumplan esos filtros.";
export const MENSAJE_SIN_ALTERNATIVA =
  "No hay otra película en tus plataformas que cumpla esos filtros.";

export class ErrorSugerenciaPelicula extends Error {
  constructor(codigo) {
    super(MENSAJES[codigo]);
    this.name = "ErrorSugerenciaPelicula";
    this.codigo = codigo;
  }
}

function entradaInvalida() {
  return new ErrorSugerenciaPelicula("ENTRADA_INVALIDA");
}

function respuestaInvalida() {
  return new ErrorSugerenciaPelicula("RESPUESTA_PROVEEDOR_INVALIDA");
}

function enteroEnRango(valor, minimo, maximo) {
  if (valor === undefined) return undefined;
  if (typeof valor !== "string" || !ENTERO_POSITIVO.test(valor)) throw entradaInvalida();
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero < minimo || numero > maximo) {
    throw entradaInvalida();
  }
  return numero;
}

// Recibe los parámetros como cadenas (tal como llegan en la URL).
export function validarFiltrosSugerencia(filtros = {}) {
  if (!filtros || typeof filtros !== "object" || Array.isArray(filtros)) {
    throw entradaInvalida();
  }
  for (const clave of Object.keys(filtros)) {
    if (!PARAMETROS_SUGERENCIA.includes(clave)) throw entradaInvalida();
  }

  const validados = {};
  const genero = enteroEnRango(filtros.genero, 1, ID_PELICULA_MAXIMO);
  const duracionMaxima = enteroEnRango(filtros.duracionMaxima, DURACION_MINIMA, DURACION_MAXIMA);
  const valoracionMinima = enteroEnRango(filtros.valoracionMinima, VALORACION_MINIMA, VALORACION_MAXIMA);
  const excluir = enteroEnRango(filtros.excluir, 1, ID_PELICULA_MAXIMO);

  if (genero !== undefined) validados.genero = genero;
  if (duracionMaxima !== undefined) validados.duracionMaxima = duracionMaxima;
  if (valoracionMinima !== undefined) validados.valoracionMinima = valoracionMinima;
  if (excluir !== undefined) validados.excluir = excluir;
  return validados;
}

function textoUtil(valor) {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  return limpio && !CONTROL.test(limpio) ? limpio : null;
}

function extraerAnio(fecha) {
  if (typeof fecha !== "string") return null;
  const coincidencia = fecha.match(FECHA_VALIDA);
  return coincidencia ? Number(coincidencia[1]) : null;
}

function construirCartel(ruta) {
  if (typeof ruta !== "string" || ruta.length > 200 || !CARTEL_SEGURO.test(ruta)) return null;
  return CARTEL_BASE + ruta;
}

function normalizarValoracion(valor) {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > 10) return null;
  return Math.round(valor * 10) / 10;
}

function normalizarCandidata(pelicula) {
  if (!pelicula || typeof pelicula !== "object" || Array.isArray(pelicula)) throw respuestaInvalida();
  if (!Number.isSafeInteger(pelicula.id) || pelicula.id <= 0 || pelicula.id > ID_PELICULA_MAXIMO) {
    throw respuestaInvalida();
  }
  const titulo = textoUtil(pelicula.title) ?? textoUtil(pelicula.original_title);
  if (!titulo) throw respuestaInvalida();

  return {
    id: pelicula.id,
    titulo,
    anio: extraerAnio(pelicula.release_date),
    cartel: construirCartel(pelicula.poster_path),
    valoracion: normalizarValoracion(pelicula.vote_average)
  };
}

function normalizarPagina(datos) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos) ||
      !Number.isSafeInteger(datos.page) || datos.page < 1 ||
      !Number.isSafeInteger(datos.total_pages) || datos.total_pages < 0 ||
      !Number.isSafeInteger(datos.total_results) || datos.total_results < 0 ||
      !Array.isArray(datos.results)) {
    throw respuestaInvalida();
  }
  return {
    totalPaginas: datos.total_pages,
    totalResultados: datos.total_results,
    peliculas: datos.results.map(normalizarCandidata)
  };
}

function plataformasDe(preferencias) {
  const plataformas = preferencias?.plataformas;
  if (!Array.isArray(plataformas) ||
      plataformas.some(id => !Number.isSafeInteger(id) || id < 1 || id > ID_PELICULA_MAXIMO)) {
    throw respuestaInvalida();
  }
  return [...new Set(plataformas)].sort((a, b) => a - b);
}

export function parametrosDescubrir(plataformas, filtros, pagina) {
  const parametros = {
    language: "es-ES",
    include_adult: false,
    include_video: false,
    watch_region: REGION_SUGERENCIA,
    // «|» = cualquiera de las plataformas seleccionadas.
    with_watch_providers: plataformas.join("|"),
    with_watch_monetization_types: "flatrate",
    sort_by: "popularity.desc",
    page: pagina
  };
  if (filtros.genero !== undefined) parametros.with_genres = String(filtros.genero);
  if (filtros.duracionMaxima !== undefined) {
    // Duración 0 en TMDB significa «desconocida»: se excluye.
    parametros["with_runtime.gte"] = 1;
    parametros["with_runtime.lte"] = filtros.duracionMaxima;
  }
  if (filtros.valoracionMinima !== undefined) {
    parametros["vote_average.gte"] = filtros.valoracionMinima;
    parametros["vote_count.gte"] = VOTOS_MINIMOS_CON_VALORACION;
  }
  return parametros;
}

// Índice aleatorio entre 0 y total - 1. azar() debe devolver [0, 1).
function indiceAleatorio(azar, total) {
  const valor = azar();
  if (typeof valor !== "number" || !(valor >= 0 && valor < 1)) {
    throw new Error("La fuente de azar no es válida.");
  }
  return Math.floor(valor * total);
}

function sinSugerencia(mensaje, totalCandidatas) {
  return { region: REGION_SUGERENCIA, pelicula: null, totalCandidatas, mensaje };
}

export function crearServicioSugerencia(adaptador, preferencias, { azar = Math.random } = {}) {
  if (!adaptador || typeof adaptador.consultar !== "function") throw entradaInvalida();
  if (!preferencias || typeof preferencias.obtener !== "function") throw entradaInvalida();
  if (typeof azar !== "function") throw entradaInvalida();

  return Object.freeze({
    async sugerir(usuarioId, filtrosEntrada) {
      const filtros = validarFiltrosSugerencia(filtrosEntrada);
      const plataformas = plataformasDe(await preferencias.obtener(usuarioId));
      if (!plataformas.length) return sinSugerencia(MENSAJE_SIN_PLATAFORMAS, 0);

      const primera = normalizarPagina(
        await adaptador.consultar("/discover/movie", parametrosDescubrir(plataformas, filtros, 1))
      );
      if (primera.totalResultados === 0 || primera.peliculas.length === 0) {
        return sinSugerencia(MENSAJE_SIN_RESULTADOS, 0);
      }

      // Primero se elige una página al azar y luego una película de esa página,
      // para no limitar la sugerencia a las 20 más populares.
      const paginas = Math.min(primera.totalPaginas, PAGINAS_MAXIMAS);
      const pagina = paginas > 1 ? 1 + indiceAleatorio(azar, paginas) : 1;
      let candidatas = primera.peliculas;
      if (pagina !== 1) {
        candidatas = normalizarPagina(
          await adaptador.consultar("/discover/movie", parametrosDescubrir(plataformas, filtros, pagina))
        ).peliculas;
      }

      const distintas = lista => lista.filter(pelicula => pelicula.id !== filtros.excluir);
      let disponibles = distintas(candidatas);
      // Si la página elegida solo tenía la película que se quiere evitar,
      // se recurre a la primera página.
      if (!disponibles.length && pagina !== 1) disponibles = distintas(primera.peliculas);
      if (!disponibles.length) return sinSugerencia(MENSAJE_SIN_ALTERNATIVA, primera.totalResultados);

      return {
        region: REGION_SUGERENCIA,
        pelicula: disponibles[indiceAleatorio(azar, disponibles.length)],
        totalCandidatas: primera.totalResultados,
        mensaje: null
      };
    },

    async listarGeneros() {
      const datos = await adaptador.consultar("/genre/movie/list", { language: "es-ES" });
      if (!datos || typeof datos !== "object" || !Array.isArray(datos.genres)) throw respuestaInvalida();
      const vistos = new Map();
      for (const genero of datos.genres) {
        const nombre = textoUtil(genero?.name);
        if (!Number.isSafeInteger(genero?.id) || genero.id < 1 || genero.id > ID_PELICULA_MAXIMO || !nombre) {
          throw respuestaInvalida();
        }
        if (!vistos.has(genero.id)) vistos.set(genero.id, { id: genero.id, nombre });
      }
      return {
        generos: [...vistos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
      };
    }
  });
}

