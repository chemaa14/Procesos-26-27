// Lógica del botón «¿Qué vemos hoy?» que no depende del DOM.

export const OPCIONES_DURACION = Object.freeze([90, 120, 150, 180]);
export const OPCIONES_VALORACION = Object.freeze([6, 7, 8]);

const ENTERO_POSITIVO = /^[1-9]\d*$/;

function textoCampo(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

// Convierte los valores de los desplegables en los parámetros de la API.
// Un valor vacío significa «sin filtro».
export function leerFiltrosSugerencia({ genero, duracionMaxima, valoracionMinima } = {}) {
  const filtros = {};
  const campos = { genero, duracionMaxima, valoracionMinima };

  for (const [clave, valor] of Object.entries(campos)) {
    const texto = textoCampo(valor);
    if (!texto) continue;
    if (!ENTERO_POSITIVO.test(texto)) {
      return { valido: false, error: "Revisa los filtros de la sugerencia." };
    }
    filtros[clave] = texto;
  }

  if (filtros.duracionMaxima && !OPCIONES_DURACION.includes(Number(filtros.duracionMaxima))) {
    return { valido: false, error: "Elige una duración máxima de la lista." };
  }
  if (filtros.valoracionMinima && !OPCIONES_VALORACION.includes(Number(filtros.valoracionMinima))) {
    return { valido: false, error: "Elige una valoración mínima de la lista." };
  }

  return { valido: true, filtros };
}

export function textoOpcionDuracion(minutos) {
  return minutos % 60 === 0
    ? `Hasta ${minutos / 60} h`
    : `Hasta ${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

export function textoOpcionValoracion(nota) {
  return `${nota} o más en TMDB`;
}

// Normaliza la lista de géneros del servidor para los desplegables.
export function generosValidos(respuesta) {
  if (!respuesta || !Array.isArray(respuesta.generos)) return [];
  return respuesta.generos.filter(genero =>
    Number.isSafeInteger(genero?.id) && genero.id > 0 &&
    typeof genero.nombre === "string" && genero.nombre.trim()
  ).map(genero => ({ id: genero.id, nombre: genero.nombre.trim() }));
}

// Texto de estado tras pedir una sugerencia.
export function textoResultadoSugerencia(resultado) {
  if (!resultado || typeof resultado !== "object") {
    return "No se pudo obtener una sugerencia.";
  }
  if (!resultado.pelicula) {
    return typeof resultado.mensaje === "string" && resultado.mensaje
      ? resultado.mensaje
      : "No hay películas en tus plataformas que cumplan esos filtros.";
  }

  const titulo = typeof resultado.pelicula.titulo === "string" && resultado.pelicula.titulo.trim()
    ? resultado.pelicula.titulo.trim()
    : "una película";
  const total = Number.isSafeInteger(resultado.totalCandidatas) && resultado.totalCandidatas > 1
    ? ` Elegida al azar entre ${resultado.totalCandidatas.toLocaleString("es-ES")} películas de tus plataformas.`
    : "";
  return `Te proponemos «${titulo}».${total}`;
}

// Parámetros para «Otra sugerencia»: los mismos filtros y sin repetir la anterior.
export function filtrosOtraSugerencia(filtros, ultima) {
  const siguiente = { ...filtros };
  if (Number.isSafeInteger(ultima?.id) && ultima.id > 0) siguiente.excluir = String(ultima.id);
  return siguiente;
}
