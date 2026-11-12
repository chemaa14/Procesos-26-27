import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { crearAplicacion } from "../Servidor/api.js";
import { crearServicioBusqueda } from "../Servidor/busqueda-peliculas.js";
import { ErrorCatalogoTMDB } from "../Servidor/catalogo-tmdb.js";

const PASSWORD = "Mi frase secreta para CineMatch";
const TEXTO_PROVEEDOR = "token-ficticio api.themoviedb.org detalle-privado";

function respuestaProveedor({
  page = 1,
  total_pages = 1,
  total_results = 0,
  results = []
} = {}) {
  return { page, total_pages, total_results, results };
}

function crearCatalogo(responder, control = {}) {
  return crearServicioBusqueda({
    async consultar(ruta, parametros) {
      control.llamadas = (control.llamadas ?? 0) + 1;
      control.ruta = ruta;
      control.parametros = parametros;

      if (control.error) throw control.error;

      return typeof responder === "function"
        ? responder(ruta, parametros)
        : responder;
    }
  });
}

async function conServidor(comprobar, { catalogo = null } = {}) {
  const { servidor, logica } = crearAplicacion({
    catalogo,
    cookieSegura: false,
    registrarActividad: () => {}
  });

  try {
    servidor.listen(0, "127.0.0.1");
    await once(servidor, "listening");

    const base = `http://127.0.0.1:${servidor.address().port}`;
    await comprobar(base, logica);
  } finally {
    if (servidor.listening) {
      const cerrado = new Promise((resolve, reject) => {
        servidor.close(error => error ? reject(error) : resolve());
      });

      servidor.closeAllConnections();
      await cerrado;
    }
  }
}

async function crearUsuario(logica, email = "ana@example.com") {
  const usuario = await logica.registrar({
    nombre: "Usuario de prueba",
    email,
    password: PASSWORD
  });

  await logica.confirmar(usuario.id);
  return usuario;
}

async function iniciarSesion(base, email = "ana@example.com") {
  const respuesta = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CineMatch": "1"
    },
    body: JSON.stringify({ email, password: PASSWORD })
  });

  assert.equal(respuesta.status, 200);
  const cookie = respuesta.headers.get("set-cookie");
  assert.ok(cookie);
  await respuesta.json();

  return cookie.split(";")[0];
}

function buscar(base, cookie, consulta = "?titulo=Dune") {
  return fetch(`${base}/api/peliculas${consulta}`, {
    headers: cookie ? { Cookie: cookie } : {}
  });
}

async function comprobarErrorSeguro(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado);
  assert.equal(respuesta.headers.get("cache-control"), "no-store");

  const texto = await respuesta.text();
  const cuerpo = JSON.parse(texto);

  assert.equal(cuerpo.codigo, codigo);
  assert.equal(typeof cuerpo.error, "string");
  assert.equal(texto.includes(TEXTO_PROVEEDOR), false);
  assert.equal(texto.includes("api.themoviedb.org"), false);

  return cuerpo;
}

test("la búsqueda requiere una sesión válida, confirmada y no eliminada", async () => {
  const control = {};
  const catalogo = crearCatalogo(respuestaProveedor(), control);

  await conServidor(async (base, logica) => {
    const usuario = await crearUsuario(logica);

    for (const cookie of [null, `cinematch_sesion=${"a".repeat(64)}`]) {
      const respuesta = await buscar(base, cookie);
      await comprobarErrorSeguro(respuesta, 401, undefined);
    }

    const cookie = await iniciarSesion(base);
    await logica.eliminar(usuario.id);

    const respuesta = await buscar(base, cookie);
    await comprobarErrorSeguro(respuesta, 401, undefined);
  }, { catalogo });

  assert.equal(control.llamadas ?? 0, 0);
});

test("normaliza la respuesta y respeta la paginación y el año opcional", async () => {
  const control = {};
  const catalogo = crearCatalogo((ruta, parametros) => respuestaProveedor({
    page: Number(parametros.page),
    total_pages: 3,
    total_results: 21,
    results: parametros.page === 2
      ? [{
        id: 438631,
        title: "  Dune  ",
        original_title: "Dune",
        release_date: "2021-10-22",
        poster_path: "/dune.jpg",
        overview: "No debe salir"
      }]
      : []
  }), control);

  await conServidor(async (base, logica) => {
    await crearUsuario(logica);
    const cookie = await iniciarSesion(base);

    const respuesta = await buscar(base, cookie, "?titulo=%20Dune%20&anio=2020&pagina=2");
    assert.equal(respuesta.status, 200);
    assert.deepEqual(await respuesta.json(), {
      pagina: 2,
      totalPaginas: 3,
      totalResultados: 21,
      peliculas: [{
        id: 438631,
        titulo: "Dune",
        anio: 2021,
        cartel: "https://image.tmdb.org/t/p/w500/dune.jpg"
      }]
    });
    assert.deepEqual(control.parametros, {
      query: "Dune",
      language: "es-ES",
      include_adult: false,
      page: 2,
      primary_release_year: 2020
    });

    const sinAnio = await buscar(base, cookie, "?titulo=Matrix");
    assert.equal(sinAnio.status, 200);
    assert.deepEqual(await sinAnio.json(), {
      pagina: 1,
      totalPaginas: 3,
      totalResultados: 21,
      peliculas: []
    });
    assert.deepEqual(control.parametros, {
      query: "Matrix",
      language: "es-ES",
      include_adult: false,
      page: 1
    });
  }, { catalogo });
});

test("rechaza entradas inválidas, duplicadas y desconocidas sin llamar al proveedor", async () => {
  const control = {};
  const catalogo = crearCatalogo(respuestaProveedor(), control);

  await conServidor(async (base, logica) => {
    await crearUsuario(logica);
    const cookie = await iniciarSesion(base);
    const consultas = [
      "",
      "?titulo=",
      `?titulo=${"a".repeat(201)}`,
      "?titulo=Dune%0A",
      "?titulo=Dune%0AOtra",
      "?titulo=Dune&anio=999",
      "?titulo=Dune&anio=10000",
      "?titulo=Dune&anio=20a0",
      "?titulo=Dune&pagina=0",
      "?titulo=Dune&pagina=501",
      "?titulo=Dune&pagina=1.5",
      "?titulo=Dune&titulo=Otra",
      "?titulo=Dune&anio=2020&anio=2021",
      "?titulo=Dune&pagina=1&pagina=2",
      "?titulo=Dune&desconocido=valor",
      "?titulo=Dune&query=Otra"
    ];

    for (const consulta of consultas) {
      const respuesta = await buscar(base, cookie, consulta);
      await comprobarErrorSeguro(respuesta, 400, "BUSQUEDA_INVALIDA");
    }

    const metodo = await fetch(`${base}/api/peliculas?titulo=Dune`, {
      method: "POST",
      headers: { Cookie: cookie }
    });
    assert.equal(metodo.status, 405);
    assert.equal(metodo.headers.get("allow"), "GET");
    await metodo.json();
  }, { catalogo });

  assert.equal(control.llamadas ?? 0, 0);
});

test("el catálogo deshabilitado responde 503 después de validar la sesión", async () => {
  await conServidor(async (base, logica) => {
    await crearUsuario(logica);

    const sinSesion = await buscar(base, null);
    await comprobarErrorSeguro(sinSesion, 401, undefined);

    const cookie = await iniciarSesion(base);
    const respuesta = await buscar(base, cookie);
    await comprobarErrorSeguro(respuesta, 503, "CATALOGO_NO_CONFIGURADO");
  });
});

test("mapea timeout, límite, red y respuestas incoherentes sin filtrar datos", async () => {
  const casos = [
    {
      nombre: "timeout",
      error: "TMDB_TIMEOUT",
      estado: 504,
      codigo: "CATALOGO_TIMEOUT"
    },
    {
      nombre: "límite",
      error: "TMDB_LIMITE",
      estado: 503,
      codigo: "CATALOGO_LIMITE"
    },
    {
      nombre: "red",
      error: "TMDB_RED",
      estado: 502,
      codigo: "CATALOGO_NO_DISPONIBLE"
    },
    {
      nombre: "HTTP del proveedor",
      error: "TMDB_HTTP",
      estado: 502,
      codigo: "CATALOGO_NO_DISPONIBLE"
    },
    {
      nombre: "esquema incoherente",
      respuesta: {
        page: 1,
        total_pages: "3",
        total_results: 1,
        results: [{ id: "1", title: TEXTO_PROVEEDOR }]
      },
      estado: 502,
      codigo: "CATALOGO_RESPUESTA_INVALIDA"
    },
    {
      nombre: "página distinta de la solicitada",
      consulta: "?titulo=Dune&pagina=2",
      respuesta: respuestaProveedor({
        page: 1,
        total_pages: 0,
        total_results: 0,
        results: [{ id: 1, title: "Ejemplo" }]
      }),
      estado: 502,
      codigo: "CATALOGO_RESPUESTA_INVALIDA"
    },
    {
      nombre: "total de resultados menor que la lista",
      consulta: "?titulo=Dune&pagina=2",
      respuesta: respuestaProveedor({
        page: 2,
        total_pages: 3,
        total_results: 0,
        results: [{ id: 1, title: "Ejemplo" }]
      }),
      estado: 502,
      codigo: "CATALOGO_RESPUESTA_INVALIDA"
    },
    {
      nombre: "resultados con total de páginas cero",
      consulta: "?titulo=Dune&pagina=2",
      respuesta: respuestaProveedor({
        page: 2,
        total_pages: 0,
        total_results: 1,
        results: [{ id: 1, title: "Ejemplo" }]
      }),
      estado: 502,
      codigo: "CATALOGO_RESPUESTA_INVALIDA"
    }
  ];

  for (const caso of casos) {
    const control = {};

    if (caso.error) {
      control.error = new ErrorCatalogoTMDB(caso.error);
      control.error.message = TEXTO_PROVEEDOR;
    } else {
      control.respuesta = caso.respuesta;
    }

    const catalogo = crearCatalogo(() => control.respuesta, control);

    await conServidor(async (base, logica) => {
      await crearUsuario(logica);
      const cookie = await iniciarSesion(base);
      const respuesta = await buscar(
        base,
        cookie,
        caso.consulta ?? "?titulo=Dune"
      );
      await comprobarErrorSeguro(respuesta, caso.estado, caso.codigo);
    }, { catalogo });
  }
});

test("las cuentas y las sesiones siguen funcionando con el catálogo inyectado", async () => {
  const control = {};
  const catalogo = crearCatalogo(respuestaProveedor({
    total_results: 1,
    results: [{
      id: 603,
      title: "Matrix",
      release_date: "1999-03-31",
      poster_path: "/matrix.jpg"
    }]
  }), control);

  await conServidor(async (base, logica) => {
    await crearUsuario(logica);
    const cookie = await iniciarSesion(base);

    const sesion = await fetch(`${base}/api/sesion`, {
      headers: { Cookie: cookie }
    });
    assert.equal(sesion.status, 200);
    assert.equal((await sesion.json()).usuario.email, "ana@example.com");

    const busqueda = await buscar(base, cookie, "?titulo=Matrix");
    assert.equal(busqueda.status, 200);
    assert.equal((await busqueda.json()).peliculas[0].titulo, "Matrix");

    const salida = await fetch(`${base}/api/logout`, {
      method: "POST",
      headers: { Cookie: cookie, "X-CineMatch": "1" }
    });
    assert.equal(salida.status, 204);
    await salida.text();

    const despues = await buscar(base, cookie);
    await comprobarErrorSeguro(despues, 401, undefined);
  }, { catalogo });

  assert.equal(control.llamadas, 1);
});
