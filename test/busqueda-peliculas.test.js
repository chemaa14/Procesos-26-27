import test from "node:test";
import assert from "node:assert/strict";

import {
  crearServicioBusqueda,
  ErrorBusquedaPeliculas,
  PAGINA_MAXIMA,
  TITULO_MAXIMO
} from "../Servidor/busqueda-peliculas.js";

function respuestaProveedor({
  page = 1,
  total_pages = 1,
  total_results = 0,
  results = []
} = {}) {
  return { page, total_pages, total_results, results };
}

function servicioCon(resultado, control = {}) {
  const catalogo = {
    async consultar(ruta, parametros) {
      control.llamadas = (control.llamadas ?? 0) + 1;
      control.ruta = ruta;
      control.parametros = parametros;
      return typeof resultado === "function" ? resultado() : resultado;
    }
  };

  return { servicio: crearServicioBusqueda(catalogo), control };
}

test("normaliza los resultados y consulta /search/movie con el contrato acordado", async () => {
  const { servicio, control } = servicioCon(respuestaProveedor({
    page: 2,
    total_pages: 3,
    total_results: 22,
    results: [
      {
        id: 438631,
        title: "  Dune  ",
        original_title: "Dune",
        release_date: "2021-10-22",
        poster_path: "/dune2021.jpg",
        overview: "No debe salir en la respuesta"
      },
      {
        id: 841,
        title: "   ",
        original_title: "Dune",
        release_date: "1984-12-14",
        poster_path: null
      }
    ]
  }));

  const resultado = await servicio.buscar({
    titulo: "  Dune  ",
    anio: "2020",
    pagina: "2"
  });

  assert.equal(control.ruta, "/search/movie");
  assert.deepEqual(control.parametros, {
    query: "Dune",
    language: "es-ES",
    include_adult: false,
    page: 2,
    year: 2020
  });
  assert.deepEqual(resultado, {
    pagina: 2,
    totalPaginas: 3,
    totalResultados: 22,
    peliculas: [
      {
        id: 438631,
        titulo: "Dune",
        anio: 2021,
        cartel: "https://image.tmdb.org/t/p/w500/dune2021.jpg"
      },
      {
        id: 841,
        titulo: "Dune",
        anio: 1984,
        cartel: null
      }
    ]
  });
});

test("usa la página 1 y omite year cuando no se indican; los vacíos no son un fallo", async () => {
  const { servicio, control } = servicioCon(respuestaProveedor());

  const resultado = await servicio.buscar({ titulo: "Matrix" });

  assert.deepEqual(control.parametros, {
    query: "Matrix",
    language: "es-ES",
    include_adult: false,
    page: 1
  });
  assert.deepEqual(resultado, {
    pagina: 1,
    totalPaginas: 1,
    totalResultados: 0,
    peliculas: []
  });
});

test("acepta vacíos fuera del total y totales declarados sin límites fijos", async () => {
  const vacios = [
    respuestaProveedor({ page: 2, total_pages: 0, total_results: 0 }),
    respuestaProveedor({ page: 2, total_pages: 1, total_results: 0 })
  ];

  for (const respuesta of vacios) {
    const { servicio } = servicioCon(respuesta);
    assert.deepEqual(await servicio.buscar({ titulo: "Nada", pagina: "2" }), {
      pagina: 2,
      totalPaginas: respuesta.total_pages,
      totalResultados: 0,
      peliculas: []
    });
  }

  const resultados = Array.from({ length: 25 }, (_, indice) => ({
    id: indice + 1,
    title: `Película ${indice + 1}`
  }));
  const { servicio } = servicioCon(respuestaProveedor({
    page: 2,
    total_pages: 5000,
    total_results: 100000,
    results: resultados
  }));

  const resultado = await servicio.buscar({ titulo: "Muchas", pagina: "2" });
  assert.equal(resultado.totalPaginas, 5000);
  assert.equal(resultado.totalResultados, 100000);
  assert.equal(resultado.peliculas.length, 25);
});

test("rechaza páginas distintas y totales incoherentes del proveedor", async () => {
  const casos = [
    respuestaProveedor({
      page: 1,
      total_pages: 0,
      total_results: 0,
      results: [{ id: 1, title: "Ejemplo" }]
    }),
    respuestaProveedor({
      page: 2,
      total_pages: 3,
      total_results: 0,
      results: [{ id: 1, title: "Ejemplo" }]
    }),
    respuestaProveedor({
      page: 2,
      total_pages: 0,
      total_results: 1,
      results: [{ id: 1, title: "Ejemplo" }]
    }),
    respuestaProveedor({
      page: 2,
      total_pages: 1,
      total_results: 1,
      results: [{ id: 1, title: "Ejemplo" }]
    })
  ];

  for (const respuesta of casos) {
    const { servicio, control } = servicioCon(respuesta);

    await assert.rejects(servicio.buscar({ titulo: "Ejemplo", pagina: "2" }), {
      name: "ErrorBusquedaPeliculas",
      codigo: "RESPUESTA_PROVEEDOR_INVALIDA"
    });
    assert.equal(control.llamadas, 1);
  }
});

test("conserva año y cartel ausentes o no seguros sin romper la búsqueda", async () => {
  const { servicio } = servicioCon(respuestaProveedor({
    total_results: 6,
    results: [
      { id: 1, title: "Sin datos", original_title: "Sin datos" },
      { id: 2, title: "Fecha rara", release_date: "fecha-desconocida", poster_path: 42 },
      { id: 3, title: "URL externa", release_date: "2001-01-01", poster_path: "https://example.com/cartel.jpg" },
      { id: 4, title: "Ruta doble", release_date: "2002-01-01", poster_path: "//example.com/cartel.jpg" },
      { id: 5, title: "Ruta insegura", release_date: "2003-01-01", poster_path: "/../privado.jpg" },
      { id: 6, title: "Año fuera", release_date: "999-01-01", poster_path: "/ok.jpg" }
    ]
  }));

  const { peliculas } = await servicio.buscar({ titulo: "Prueba" });

  assert.deepEqual(peliculas.map(pelicula => pelicula.anio), [null, null, 2001, 2002, 2003, null]);
  assert.deepEqual(peliculas.map(pelicula => pelicula.cartel), [
    null,
    null,
    null,
    null,
    null,
    "https://image.tmdb.org/t/p/w500/ok.jpg"
  ]);
});

test("rechaza entradas inválidas sin llamar al adaptador", async () => {
  const { servicio, control } = servicioCon(respuestaProveedor());
  const casos = [
    undefined,
    null,
    [],
    {},
    { titulo: "" },
    { titulo: "   " },
    { titulo: 42 },
    { titulo: "a".repeat(TITULO_MAXIMO + 1) },
    { titulo: "titulo\ncon control" },
    { titulo: "Dune\n" },
    { titulo: "\nDune" },
    { titulo: "\tDune" },
    { titulo: "Dune", anio: "999" },
    { titulo: "Dune", anio: "10000" },
    { titulo: "Dune", anio: "20a0" },
    { titulo: "Dune", anio: 2020 },
    { titulo: "Dune", pagina: "0" },
    { titulo: "Dune", pagina: String(PAGINA_MAXIMA + 1) },
    { titulo: "Dune", pagina: "1.5" },
    { titulo: "Dune", pagina: "-1" },
    { titulo: "Dune", pagina: 1 }
  ];

  for (const consulta of casos) {
    await assert.rejects(servicio.buscar(consulta), {
      name: "ErrorBusquedaPeliculas",
      codigo: "ENTRADA_INVALIDA"
    });
  }

  assert.equal(control.llamadas ?? 0, 0);
});

test("rechaza respuestas de proveedor incoherentes con un error conocido", async () => {
  const casos = [
    null,
    [],
    {},
    respuestaProveedor({ page: 0 }),
    respuestaProveedor({ total_pages: -1 }),
    respuestaProveedor({ total_results: "2" }),
    { ...respuestaProveedor(), results: "no es una lista" },
    respuestaProveedor({ results: [null] }),
    respuestaProveedor({ results: [{ id: 0, title: "Inválida" }] }),
    respuestaProveedor({ results: [{ id: "1", title: "Inválida" }] }),
    respuestaProveedor({ results: [{ id: 1, title: "", original_title: " " }] })
  ];

  for (const respuesta of casos) {
    const { servicio, control } = servicioCon(respuesta);

    await assert.rejects(servicio.buscar({ titulo: "Dune" }), error => {
      assert.equal(error instanceof ErrorBusquedaPeliculas, true);
      assert.equal(error.codigo, "RESPUESTA_PROVEEDOR_INVALIDA");
      assert.equal(JSON.stringify(error).includes("Inválida"), false);
      return true;
    });
    assert.equal(control.llamadas, 1);
  }
});
