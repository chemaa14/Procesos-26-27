import test from "node:test";
import assert from "node:assert/strict";

import {
  crearServicioDetalle,
  ErrorDetallePelicula,
  ID_PELICULA_MAXIMO
} from "../Servidor/detalle-pelicula.js";
import { ErrorCatalogoTMDB } from "../Servidor/catalogo-tmdb.js";

const TEXTO_PROVEEDOR = "token-ficticio detalle-privado api.themoviedb.org";

function servicioCon(resultado, control = {}) {
  const catalogo = {
    async consultar(ruta, parametros) {
      control.llamadas = (control.llamadas ?? 0) + 1;
      control.ruta = ruta;
      control.parametros = parametros;

      if (control.error) throw control.error;

      return typeof resultado === "function" ? resultado() : resultado;
    }
  };

  return { servicio: crearServicioDetalle(catalogo), control };
}

function fichaCompleta(extra = {}) {
  return {
    id: 550,
    title: "  El club de la lucha  ",
    original_title: "Fight Club",
    overview: "  Un oficinista conoce a un vendedor de jabón.  ",
    release_date: "1999-10-15",
    genres: [
      { id: 18, name: "  Drama  " },
      { id: 18, name: "Drama duplicado" },
      { id: 35, name: "Comedia" },
      { id: 0, name: "Inválido" },
      { id: "99", name: "Inválido" },
      { id: 80, name: "   " },
      { id: 53, name: "  Suspense  " }
    ],
    runtime: 139,
    poster_path: "/fightclub.jpg",
    campo_bruto: TEXTO_PROVEEDOR,
    ...extra
  };
}

test("normaliza la ficha y consulta /movie/{id} con language es-ES", async () => {
  const { servicio, control } = servicioCon(fichaCompleta());

  const ficha = await servicio.obtener("550");

  assert.equal(control.ruta, "/movie/550");
  assert.deepEqual(control.parametros, { language: "es-ES" });
  assert.deepEqual(ficha, {
    id: 550,
    titulo: "El club de la lucha",
    anio: 1999,
    sinopsis: "Un oficinista conoce a un vendedor de jabón.",
    generos: [
      { id: 18, nombre: "Drama" },
      { id: 35, nombre: "Comedia" },
      { id: 53, nombre: "Suspense" }
    ],
    duracion: 139,
    cartel: "https://image.tmdb.org/t/p/w500/fightclub.jpg"
  });
  assert.equal(JSON.stringify(ficha).includes(TEXTO_PROVEEDOR), false);
  assert.equal(JSON.stringify(ficha).includes("campo_bruto"), false);
});

test("conserva la sinopsis de varios párrafos con CR, LF y tabulaciones", async () => {
  const sinopsis = [
    "Primer párrafo.\nSegundo párrafo.",
    "\n  Primer párrafo.\r\n\tSegundo párrafo con\ttabulación.\n  ",
    "Línea uno\rLínea dos"
  ];

  for (const overview of sinopsis) {
    const { servicio } = servicioCon({ id: 550, title: "Ejemplo", overview });
    const ficha = await servicio.obtener("550");

    assert.equal(ficha.sinopsis, overview.trim());
  }
});

test("la sinopsis solo es null si falta, está vacía o contiene controles no permitidos", async () => {
  for (const overview of [undefined, null, 42, {}, "", "   ", "\n\t", "uno\u0000dos", "vertical\u000bdato"]) {
    const { servicio } = servicioCon({ id: 550, title: "Ejemplo", overview });
    const ficha = await servicio.obtener("550");

    assert.equal(ficha.sinopsis, null);
  }
});

test("los campos opcionales ausentes o inválidos no rompen la ficha", async () => {
  const { servicio } = servicioCon({
    id: 7,
    title: "   ",
    original_title: "  Título original  ",
    overview: "   ",
    release_date: "fecha-desconocida",
    genres: [
      null,
      "Drama",
      [],
      { id: 12, name: "Aventura" },
      { id: 12, name: "Aventura repetida" },
      { id: 12, name: "Otra" }
    ],
    runtime: 0,
    poster_path: "https://example.com/cartel.jpg"
  });

  assert.deepEqual(await servicio.obtener("7"), {
    id: 7,
    titulo: "Título original",
    anio: null,
    sinopsis: null,
    generos: [{ id: 12, nombre: "Aventura" }],
    duracion: null,
    cartel: null
  });
});

test("admite fichas sin géneros, sinopsis, duración ni cartel", async () => {
  const { servicio } = servicioCon({
    id: 8,
    title: "Película mínima",
    runtime: -5,
    poster_path: "/../privado.jpg"
  });

  assert.deepEqual(await servicio.obtener("8"), {
    id: 8,
    titulo: "Película mínima",
    anio: null,
    sinopsis: null,
    generos: [],
    duracion: null,
    cartel: null
  });
});

test("acepta el límite int32 y rechaza identificadores no canónicos sin consultar", async () => {
  const casos = [
    undefined,
    null,
    550,
    "",
    "0",
    "-1",
    "+1",
    "01",
    "1.0",
    "1e2",
    "abc",
    "1a",
    " 1",
    "1 ",
    "%31",
    "1%2F2",
    "1\n",
    String(ID_PELICULA_MAXIMO + 1),
    "999999999999999999999999"
  ];

  for (const id of casos) {
    const { servicio, control } = servicioCon(fichaCompleta());
    await assert.rejects(servicio.obtener(id), {
      name: "ErrorDetallePelicula",
      codigo: "ENTRADA_INVALIDA"
    });
    assert.equal(control.llamadas ?? 0, 0);
  }

  for (const id of ["1", String(ID_PELICULA_MAXIMO)]) {
    const { servicio, control } = servicioCon({ id: Number(id), title: "Válida" });
    assert.equal((await servicio.obtener(id)).id, Number(id));
    assert.equal(control.ruta, `/movie/${id}`);
  }
});

test("rechaza fichas incoherentes, sin título o con otro identificador", async () => {
  const casos = [
    null,
    [],
    "no es una ficha",
    { id: "550", title: "Texto" },
    { id: 551, title: "Otro id" },
    { id: 0, title: "Cero" },
    { id: 550, title: "  ", original_title: " " },
    { id: 550, title: "Título\u0000inválido", original_title: null, bruto: TEXTO_PROVEEDOR }
  ];

  for (const respuesta of casos) {
    const { servicio, control } = servicioCon(respuesta);

    await assert.rejects(servicio.obtener("550"), error => {
      assert.equal(error instanceof ErrorDetallePelicula, true);
      assert.equal(error.codigo, "RESPUESTA_PROVEEDOR_INVALIDA");
      assert.equal(`${error.message} ${JSON.stringify(error)}`.includes(TEXTO_PROVEEDOR), false);
      return true;
    });
    assert.equal(control.llamadas, 1);
  }
});

test("convierte el 404 de TMDB en película no encontrada y propaga otros fallos", async () => {
  const noEncontrada = servicioCon(fichaCompleta(), {
    error: new ErrorCatalogoTMDB("TMDB_NO_ENCONTRADO")
  });
  await assert.rejects(noEncontrada.servicio.obtener("404"), {
    name: "ErrorDetallePelicula",
    codigo: "PELICULA_NO_ENCONTRADA"
  });

  const timeout = servicioCon(fichaCompleta(), {
    error: new ErrorCatalogoTMDB("TMDB_TIMEOUT")
  });
  await assert.rejects(timeout.servicio.obtener("550"), {
    name: "ErrorCatalogoTMDB",
    codigo: "TMDB_TIMEOUT"
  });
});

test("exige un adaptador con consultar", () => {
  for (const adaptador of [null, {}, { consultar: 1 }]) {
    assert.throws(() => crearServicioDetalle(adaptador), {
      name: "ErrorDetallePelicula",
      codigo: "ENTRADA_INVALIDA"
    });
  }
});
