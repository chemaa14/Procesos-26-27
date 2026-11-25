import test from "node:test";
import assert from "node:assert/strict";

import {
  ErrorSugerenciaPelicula,
  MENSAJE_SIN_ALTERNATIVA,
  MENSAJE_SIN_PLATAFORMAS,
  MENSAJE_SIN_RESULTADOS,
  PAGINAS_MAXIMAS,
  VOTOS_MINIMOS_CON_VALORACION,
  crearServicioSugerencia,
  validarFiltrosSugerencia
} from "../Servidor/sugerencia-pelicula.js";

function pelicula(id, extra = {}) {
  return {
    id,
    title: `Película ${id}`,
    release_date: "2021-09-15",
    poster_path: `/cartel${id}.jpg`,
    vote_average: 7.46,
    ...extra
  };
}

function pagina(page, results, { total_pages = 1, total_results = results.length } = {}) {
  return { page, total_pages, total_results, results };
}

// TMDB simulado: responde con la página pedida y guarda cada consulta.
function crearEntorno({ plataformas = [8, 119], paginas = {}, azar = [0] } = {}) {
  const consultas = [];
  const valores = [...azar];
  const adaptador = {
    async consultar(ruta, parametros) {
      consultas.push({ ruta, parametros });
      if (ruta === "/genre/movie/list") return paginas.generos;
      return paginas[parametros.page];
    }
  };
  const preferencias = {
    async obtener() {
      return { region: "ES", plataformas };
    }
  };
  const servicio = crearServicioSugerencia(adaptador, preferencias, {
    azar: () => (valores.length > 1 ? valores.shift() : valores[0])
  });
  return { servicio, consultas };
}

test("sugerencia: valida los filtros opcionales y rechaza los desconocidos", () => {
  assert.deepEqual(validarFiltrosSugerencia({}), {});
  assert.deepEqual(
    validarFiltrosSugerencia({ genero: "28", duracionMaxima: "120", valoracionMinima: "7", excluir: "550" }),
    { genero: 28, duracionMaxima: 120, valoracionMinima: 7, excluir: 550 }
  );

  for (const filtros of [
    { genero: "0" },
    { genero: "acción" },
    { duracionMaxima: "29" },
    { duracionMaxima: "401" },
    { duracionMaxima: "90.5" },
    { valoracionMinima: "10" },
    { valoracionMinima: "0" },
    { excluir: "-3" },
    { otro: "1" }
  ]) {
    assert.throws(() => validarFiltrosSugerencia(filtros), ErrorSugerenciaPelicula, JSON.stringify(filtros));
  }
});

test("sugerencia: consulta /discover/movie con las plataformas del usuario y los filtros", async () => {
  const { servicio, consultas } = crearEntorno({
    paginas: { 1: pagina(1, [pelicula(1)]) }
  });

  const resultado = await servicio.sugerir("usuario-1", {
    genero: "18", duracionMaxima: "120", valoracionMinima: "7"
  });

  assert.equal(consultas.length, 1);
  assert.equal(consultas[0].ruta, "/discover/movie");
  assert.deepEqual(consultas[0].parametros, {
    language: "es-ES",
    include_adult: false,
    include_video: false,
    watch_region: "ES",
    with_watch_providers: "8|119",
    with_watch_monetization_types: "flatrate",
    sort_by: "popularity.desc",
    page: 1,
    with_genres: "18",
    "with_runtime.gte": 1,
    "with_runtime.lte": 120,
    "vote_average.gte": 7,
    "vote_count.gte": VOTOS_MINIMOS_CON_VALORACION
  });
  assert.deepEqual(resultado, {
    region: "ES",
    pelicula: {
      id: 1,
      titulo: "Película 1",
      anio: 2021,
      cartel: "https://image.tmdb.org/t/p/w500/cartel1.jpg",
      valoracion: 7.5
    },
    totalCandidatas: 1,
    mensaje: null
  });
});

test("sugerencia: sin filtros no envía género, duración ni valoración", async () => {
  const { servicio, consultas } = crearEntorno({ paginas: { 1: pagina(1, [pelicula(1)]) } });
  await servicio.sugerir("usuario-1", {});
  const claves = Object.keys(consultas[0].parametros);
  for (const clave of ["with_genres", "with_runtime.lte", "vote_average.gte"]) {
    assert.equal(claves.includes(clave), false, clave);
  }
});

test("sugerencia: elige al azar una página y una película de esa página", async () => {
  const { servicio, consultas } = crearEntorno({
    paginas: {
      1: pagina(1, [pelicula(1), pelicula(2)], { total_pages: 4, total_results: 80 }),
      3: pagina(3, [pelicula(31), pelicula(32), pelicula(33), pelicula(34)], { total_pages: 4, total_results: 80 })
    },
    // 0.5 * 4 páginas = página 3; 0.75 * 4 películas = la cuarta.
    azar: [0.5, 0.75]
  });

  const resultado = await servicio.sugerir("usuario-1", {});

  assert.deepEqual(consultas.map(c => c.parametros.page), [1, 3]);
  assert.equal(resultado.pelicula.id, 34);
  assert.equal(resultado.totalCandidatas, 80);
});

test("sugerencia: nunca pide una página por encima del límite de TMDB", async () => {
  const { servicio, consultas } = crearEntorno({
    paginas: {
      1: pagina(1, [pelicula(1)], { total_pages: 9000, total_results: 180000 }),
      [PAGINAS_MAXIMAS]: pagina(PAGINAS_MAXIMAS, [pelicula(9)], { total_pages: 9000, total_results: 180000 })
    },
    azar: [0.999999]
  });

  const resultado = await servicio.sugerir("usuario-1", {});
  assert.equal(consultas.at(-1).parametros.page, PAGINAS_MAXIMAS);
  assert.equal(resultado.pelicula.id, 9);
});

test("sugerencia: «otra sugerencia» evita repetir la película anterior", async () => {
  const { servicio } = crearEntorno({
    paginas: { 1: pagina(1, [pelicula(1), pelicula(2)]) },
    azar: [0]
  });

  const primera = await servicio.sugerir("usuario-1", {});
  assert.equal(primera.pelicula.id, 1);

  const otra = await servicio.sugerir("usuario-1", { excluir: "1" });
  assert.equal(otra.pelicula.id, 2);
});

test("sugerencia: si la única candidata es la excluida, lo indica sin inventar otra", async () => {
  const { servicio } = crearEntorno({ paginas: { 1: pagina(1, [pelicula(1)]) } });

  const resultado = await servicio.sugerir("usuario-1", { excluir: "1" });
  assert.equal(resultado.pelicula, null);
  assert.equal(resultado.mensaje, MENSAJE_SIN_ALTERNATIVA);
});

test("sugerencia: sin plataformas guardadas no consulta TMDB y pide elegirlas", async () => {
  const { servicio, consultas } = crearEntorno({ plataformas: [] });

  const resultado = await servicio.sugerir("usuario-1", {});
  assert.deepEqual(resultado, {
    region: "ES", pelicula: null, totalCandidatas: 0, mensaje: MENSAJE_SIN_PLATAFORMAS
  });
  assert.equal(consultas.length, 0);
});

test("sugerencia: sin resultados devuelve un mensaje en lugar de una película", async () => {
  const { servicio } = crearEntorno({ paginas: { 1: pagina(1, [], { total_pages: 0, total_results: 0 }) } });

  const resultado = await servicio.sugerir("usuario-1", { genero: "99" });
  assert.equal(resultado.pelicula, null);
  assert.equal(resultado.mensaje, MENSAJE_SIN_RESULTADOS);
});

test("sugerencia: rechaza respuestas de TMDB mal formadas", async () => {
  for (const respuesta of [
    null,
    { page: 1, total_pages: 1, total_results: 1 },
    pagina(1, [{ id: "1", title: "Texto" }]),
    pagina(1, [{ id: 1, title: "  " }])
  ]) {
    const { servicio } = crearEntorno({ paginas: { 1: respuesta } });
    await assert.rejects(
      servicio.sugerir("usuario-1", {}),
      error => error instanceof ErrorSugerenciaPelicula && error.codigo === "RESPUESTA_PROVEEDOR_INVALIDA"
    );
  }
});

test("sugerencia: lista los géneros de TMDB en español y ordenados", async () => {
  const { servicio, consultas } = crearEntorno({
    paginas: {
      generos: { genres: [{ id: 18, name: "Drama" }, { id: 28, name: "Acción" }, { id: 18, name: "Drama" }] }
    }
  });

  assert.deepEqual(await servicio.listarGeneros(), {
    generos: [{ id: 28, nombre: "Acción" }, { id: 18, nombre: "Drama" }]
  });
  assert.deepEqual(consultas[0], { ruta: "/genre/movie/list", parametros: { language: "es-ES" } });
});
