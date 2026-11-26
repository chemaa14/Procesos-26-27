export const ID_PELICULA_MAXIMO = 2147483647;

const CARTEL_BASE = "https://image.tmdb.org/t/p/w500";
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const CONTROL_SINOPSIS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const ID_VALIDO = /^[1-9]\d*$/;
const CARTEL_SEGURO = /^\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FECHA_VALIDA = /^(\d{4})-\d{2}-\d{2}$/;
const CLAVE_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;
const TIPOS_TRAILER = ["Trailer", "Teaser"];
const ANIO_MINIMO = 1000;
const ANIO_MAXIMO = 9999;

const MENSAJES = {
  ENTRADA_INVALIDA: "El identificador de la película no es válido.",
  PELICULA_NO_ENCONTRADA: "Película no encontrada.",
  RESPUESTA_PROVEEDOR_INVALIDA: "El catálogo devolvió una ficha no válida."
};

export class ErrorDetallePelicula extends Error {
  constructor(codigo) {
    super(MENSAJES[codigo]);
    this.name = "ErrorDetallePelicula";
    this.codigo = codigo;
  }
}

function entradaInvalida() {
  return new ErrorDetallePelicula("ENTRADA_INVALIDA");
}

function respuestaInvalida() {
  return new ErrorDetallePelicula("RESPUESTA_PROVEEDOR_INVALIDA");
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

function textoSinopsis(valor) {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  return limpio && !CONTROL_SINOPSIS.test(limpio) ? limpio : null;
}

function extraerAnio(fecha) {
  if (typeof fecha !== "string") return null;
  const coincidencia = fecha.match(FECHA_VALIDA);
  if (!coincidencia) return null;

  const anio = Number(coincidencia[1]);
  return anio >= ANIO_MINIMO && anio <= ANIO_MAXIMO ? anio : null;
}

function normalizarGeneros(generos) {
  if (!Array.isArray(generos)) return [];

  const vistos = new Set();
  const salida = [];

  for (const genero of generos) {
    if (!genero || typeof genero !== "object" || Array.isArray(genero)) continue;

    const id = genero.id;
    const nombre = textoUtil(genero.name);

    if (!Number.isSafeInteger(id) || id <= 0 || !nombre || vistos.has(id)) {
      continue;
    }

    vistos.add(id);
    salida.push({ id, nombre });
  }

  return salida;
}

function normalizarDuracion(duracion) {
  return Number.isSafeInteger(duracion) && duracion > 0 ? duracion : null;
}

function construirCartel(ruta) {
  if (typeof ruta !== "string" || ruta.length > 200 || !CARTEL_SEGURO.test(ruta)) {
    return null;
  }
  return CARTEL_BASE + ruta;
}

// Elige el tráiler de YouTube que se enlaza en la ficha: tráiler antes que teaser, en español antes que en
// otro idioma y oficial antes que no oficial. Solo se acepta una clave de vídeo de YouTube con su formato.
function elegirTrailer(videos) {
  const lista = Array.isArray(videos?.results) ? videos.results : [];
  const validos = lista.filter((v) => v && typeof v === "object" && v.site === "YouTube" &&
    typeof v.key === "string" && CLAVE_YOUTUBE.test(v.key) && TIPOS_TRAILER.includes(v.type));
  if (!validos.length) return null;

  const puntos = (v) => (v.type === "Trailer" ? 4 : 0) + (v.iso_639_1 === "es" ? 2 : 0) + (v.official === true ? 1 : 0);
  const mejor = validos.reduce((a, b) => (puntos(b) > puntos(a) ? b : a));
  return `https://www.youtube.com/watch?v=${mejor.key}`;
}

function normalizarFicha(datos, idSolicitado) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    throw respuestaInvalida();
  }
  if (!Number.isSafeInteger(datos.id) || datos.id <= 0 || datos.id !== idSolicitado) {
    throw respuestaInvalida();
  }

  const titulo = textoUtil(datos.title) ?? textoUtil(datos.original_title);
  if (!titulo) throw respuestaInvalida();

  return {
    id: idSolicitado,
    titulo,
    anio: extraerAnio(datos.release_date),
    sinopsis: textoSinopsis(datos.overview),
    generos: normalizarGeneros(datos.genres),
    duracion: normalizarDuracion(datos.runtime),
    cartel: construirCartel(datos.poster_path),
    trailer: elegirTrailer(datos.videos)
  };
}

export function crearServicioDetalle(catalogo) {
  if (!catalogo || typeof catalogo.consultar !== "function") {
    throw entradaInvalida();
  }

  return Object.freeze({
    async obtener(id) {
      const idSolicitado = validarId(id);

      let datos;
      try {
        datos = await catalogo.consultar(`/movie/${idSolicitado}`, {
          language: "es-ES",
          // En la misma petición: los vídeos en español y, si no hay, en inglés (para el tráiler).
          append_to_response: "videos",
          include_video_language: "es,en"
        });
      } catch (error) {
        if (error?.codigo === "TMDB_NO_ENCONTRADO") {
          throw new ErrorDetallePelicula("PELICULA_NO_ENCONTRADA");
        }
        throw error;
      }

      return normalizarFicha(datos, idSolicitado);
    }
  });
}
