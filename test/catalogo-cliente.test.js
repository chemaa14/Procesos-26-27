import test from "node:test";
import assert from "node:assert/strict";

import {
  TEXTO_ANIO_AUSENTE,
  TEXTO_CARTEL_AUSENTE,
  TEXTO_DURACION_AUSENTE,
  TEXTO_GENEROS_AUSENTES,
  TEXTO_SINOPSIS_AUSENTE,
  crearEstadoCatalogo,
  textoAnio,
  textoDuracion,
  textoGeneros,
  textoPaginaActual,
  textoResumenResultados,
  textoSinopsis,
  textoTitulo,
  urlCartelSegura,
  validarBusqueda
} from "../Cliente/catalogo.js";

function respuestaBusqueda({
  pagina = 1,
  totalPaginas = 1,
  totalResultados = 1,
  peliculas = [{ id: 1, titulo: "Dune", anio: 2021, cartel: null }]
} = {}) {
  return { pagina, totalPaginas, totalResultados, peliculas };
}

test("valida el título obligatorio, su longitud y el año opcional", () => {
  assert.deepEqual(validarBusqueda({ titulo: "  Dune  ", anio: "2021" }), {
    valido: true,
    titulo: "Dune",
    anio: "2021"
  });

  const sinAnio = validarBusqueda({ titulo: "Dune", anio: "" });
  assert.equal(sinAnio.valido, true);
  assert.equal(sinAnio.titulo, "Dune");
  assert.equal(sinAnio.anio, undefined);

  for (const titulo of ["", "   ", "a".repeat(201), "Dune\nOtra"]) {
    const resultado = validarBusqueda({ titulo });
    assert.equal(resultado.valido, false);
    assert.equal(resultado.campo, "titulo");
  }

  for (const anio of ["999", "10000", "202", "20a1", "0999", 2021]) {
    const resultado = validarBusqueda({ titulo: "Dune", anio });
    assert.equal(resultado.valido, false);
    assert.equal(resultado.campo, "anio");
  }

  assert.equal(validarBusqueda({ titulo: "Dune", anio: "1000" }).valido, true);
  assert.equal(validarBusqueda({ titulo: "Dune", anio: "9999" }).valido, true);
});

test("solo acepta carteles HTTPS del tamaño w500 de image.tmdb.org", () => {
  const válido = "https://image.tmdb.org/t/p/w500/dune.jpg";
  assert.equal(urlCartelSegura(válido), válido);

  for (const valor of [
    null,
    "",
    "http://image.tmdb.org/t/p/w500/dune.jpg",
    "https://example.com/t/p/w500/dune.jpg",
    "https://image.tmdb.org/t/p/w780/dune.jpg",
    "https://image.tmdb.org/t/p/w500/",
    "https://image.tmdb.org/t/p/w500/carpeta/dune.jpg",
    "https://image.tmdb.org/t/p/w500/dune.jpg?x=1",
    "https://user:clave@image.tmdb.org/t/p/w500/dune.jpg"
  ]) {
    assert.equal(urlCartelSegura(valor), null);
  }
});

test("marca los datos ausentes sin inventarlos", () => {
  assert.equal(textoTitulo("  Dune  "), "Dune");
  assert.equal(textoTitulo(""), "Título no disponible");
  assert.equal(textoAnio(2021), "2021");
  assert.equal(textoAnio(null), TEXTO_ANIO_AUSENTE);
  assert.equal(textoAnio(999), TEXTO_ANIO_AUSENTE);
  assert.equal(textoDuracion(139), "139 min");
  assert.equal(textoDuracion(0), TEXTO_DURACION_AUSENTE);
  assert.equal(
    textoGeneros([{ id: 1, nombre: "Drama" }, { id: 2, nombre: "Acción" }]),
    "Drama, Acción"
  );
  assert.equal(textoGeneros([]), TEXTO_GENEROS_AUSENTES);
  assert.equal(textoSinopsis("  Un guion.  "), "Un guion.");
  assert.equal(
    textoSinopsis("Primer párrafo.\r\n\tSegundo párrafo."),
    "Primer párrafo.\r\n\tSegundo párrafo."
  );
  assert.equal(textoSinopsis(" "), TEXTO_SINOPSIS_AUSENTE);
  assert.equal(textoSinopsis("Uno\u0000Dos"), TEXTO_SINOPSIS_AUSENTE);
  assert.equal(TEXTO_CARTEL_AUSENTE, "Cartel no disponible");
});

test("resume la página con el límite máximo de 500", () => {
  assert.equal(
    textoResumenResultados({
      totalResultados: 1,
      pagina: 1,
      totalPaginas: 3
    }),
    "1 resultado · Página 1 de 3"
  );
  assert.equal(textoPaginaActual(500, 900), "Página 500 de 500");
  assert.equal(textoPaginaActual(2, 3), "Página 2 de 3");
});

test("una búsqueda nueva reinicia la página y descarta respuestas antiguas", () => {
  const estado = crearEstadoCatalogo();
  const primera = estado.iniciarBusqueda("Dune", "2021");

  assert.deepEqual(primera.consulta, {
    titulo: "Dune",
    anio: "2021",
    pagina: 1
  });

  assert.equal(
    estado.confirmarBusqueda(primera, respuestaBusqueda({ totalPaginas: 3 })),
    true
  );
  assert.equal(estado.busqueda.pagina, 1);

  const siguiente = estado.irPaginaSiguiente();
  assert.ok(siguiente);
  assert.equal(siguiente.consulta.pagina, 2);
  assert.equal(
    estado.confirmarBusqueda(
      siguiente,
      respuestaBusqueda({ pagina: 2, totalPaginas: 3 })
    ),
    true
  );
  assert.equal(estado.busqueda.pagina, 2);

  const nueva = estado.iniciarBusqueda("Matrix", undefined);
  assert.equal(nueva.consulta.pagina, 1);
  assert.equal(
    estado.confirmarBusqueda(
      primera,
      respuestaBusqueda({ pagina: 1, totalPaginas: 9 })
    ),
    false
  );
  assert.equal(estado.busqueda.pagina, 2);
  assert.equal(
    estado.confirmarBusqueda(
      nueva,
      respuestaBusqueda({
        peliculas: [{ id: 603, titulo: "Matrix", anio: 1999, cartel: null }]
      })
    ),
    true
  );
  assert.equal(estado.busqueda.titulo, "Matrix");
});

test("la paginación respeta los límites y el máximo de 500", () => {
  const estado = crearEstadoCatalogo();
  const primera = estado.iniciarBusqueda("Dune");

  estado.confirmarBusqueda(
    primera,
    respuestaBusqueda({ pagina: 1, totalPaginas: 900, totalResultados: 9000 })
  );

  assert.equal(estado.puedeAnterior(), false);
  assert.equal(estado.puedeSiguiente(), true);
  assert.equal(estado.irPaginaAnterior(), null);

  const página500 = estado.iniciarBusqueda("Dune", undefined, 500);
  estado.confirmarBusqueda(
    página500,
    respuestaBusqueda({ pagina: 500, totalPaginas: 900, totalResultados: 9000 })
  );

  assert.equal(estado.puedeAnterior(), true);
  assert.equal(estado.puedeSiguiente(), false);
  assert.equal(estado.irPaginaSiguiente(), null);
});

test("limpiar invalida búsquedas y fichas pendientes", () => {
  const estado = crearEstadoCatalogo();
  const busqueda = estado.iniciarBusqueda("Dune");
  const detalle = estado.iniciarDetalle(550);

  estado.limpiar();

  assert.equal(estado.busqueda, null);
  assert.equal(estado.detalle, null);
  assert.equal(estado.esVigenteBusqueda(busqueda), false);
  assert.equal(estado.esVigenteDetalle(detalle), false);
  assert.equal(
    estado.confirmarBusqueda(busqueda, respuestaBusqueda()),
    false
  );
  assert.equal(estado.confirmarDetalle(detalle, { id: 550 }), false);
});

test("solo la última ficha solicitada puede reemplazar el detalle", () => {
  const estado = crearEstadoCatalogo();
  const primera = estado.iniciarDetalle(1);
  const segunda = estado.iniciarDetalle(2);

  assert.equal(estado.confirmarDetalle(primera, { id: 1 }), false);
  assert.equal(estado.confirmarDetalle(segunda, { id: 2 }), true);
  assert.equal(estado.detalle.id, 2);

  estado.cerrarDetalle();
  assert.equal(estado.detalle, null);
  assert.equal(estado.confirmarDetalle(segunda, { id: 2 }), false);
});