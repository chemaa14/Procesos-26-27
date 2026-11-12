import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { crearAplicacion } from "../Servidor/api.js";
import { crearServicioBusqueda } from "../Servidor/busqueda-peliculas.js";
import { crearServicioDetalle } from "../Servidor/detalle-pelicula.js";
import { ErrorCatalogoTMDB } from "../Servidor/catalogo-tmdb.js";
import { rutaParaRegistro } from "../Servidor/actividad.js";

const PASSWORD = "Mi frase secreta para CineMatch";
const TEXTO_PROVEEDOR = "token-ficticio api.themoviedb.org detalle-privado";

function fichaProveedor(extra = {}) {
  return {
    id: 550,
    title: "El club de la lucha",
    original_title: "Fight Club",
    overview: "Un oficinista conoce a un vendedor de jabón.",
    release_date: "1999-10-15",
    genres: [{ id: 18, name: "Drama" }, { id: 18, name: "Drama" }],
    runtime: 139,
    poster_path: "/fightclub.jpg",
    ...extra
  };
}

function crearServicios(responder, control = {}) {
  const adaptador = {
    async consultar(ruta, parametros) {
      control.llamadas = (control.llamadas ?? 0) + 1;
      control.ruta = ruta;
      control.parametros = parametros;

      if (control.error) throw control.error;

      return typeof responder === "function"
        ? responder(ruta, parametros)
        : responder;
    }
  };

  return {
    adaptador,
    catalogo: crearServicioBusqueda(adaptador),
    detalle: crearServicioDetalle(adaptador)
  };
}

async function conServidor(comprobar, opciones = {}) {
  const { servidor, logica } = crearAplicacion({
    catalogo: opciones.catalogo ?? null,
    detalle: opciones.detalle ?? null,
    cookieSegura: false,
    registrarActividad: opciones.registrarActividad ?? (() => {})
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

function pedirDetalle(base, cookie, id, consulta = "") {
  return fetch(`${base}/api/peliculas/${id}${consulta}`, {
    headers: cookie ? { Cookie: cookie } : {}
  });
}

function pedirBusqueda(base, cookie) {
  return fetch(`${base}/api/peliculas?titulo=Dune`, {
    headers: cookie ? { Cookie: cookie } : {}
  });
}

async function comprobarErrorSeguro(respuesta, estado, codigo) {
  assert.equal(respuesta.status, estado);
  assert.equal(respuesta.headers.get("cache-control"), "no-store");

  const texto = await respuesta.text();
  const cuerpo = JSON.parse(texto);

  if (codigo !== undefined) assert.equal(cuerpo.codigo, codigo);
  assert.equal(typeof cuerpo.error, "string");
  assert.equal(texto.includes(TEXTO_PROVEEDOR), false);
  assert.equal(texto.includes("api.themoviedb.org"), false);

  return cuerpo;
}

test("el detalle exige una sesión válida, confirmada y no eliminada", async () => {
  const control = {};
  const { catalogo, detalle } = crearServicios(fichaProveedor(), control);

  await conServidor(async (base, logica) => {
    const usuario = await crearUsuario(logica);

    for (const cookie of [null, `cinematch_sesion=${"a".repeat(64)}`]) {
      await comprobarErrorSeguro(await pedirDetalle(base, cookie, "550"), 401);
    }

    const cookie = await iniciarSesion(base);
    await logica.eliminar(usuario.id);

    await comprobarErrorSeguro(await pedirDetalle(base, cookie, "550"), 401);
  }, { catalogo, detalle });

  assert.equal(control.llamadas ?? 0, 0);
});

test("devuelve la ficha normalizada usando /movie/{id} y language es-ES", async () => {
  const control = {};
  const { catalogo, detalle } = crearServicios(fichaProveedor(), control);

  await conServidor(async (base, logica) => {
    await crearUsuario(logica);
    const cookie = await iniciarSesion(base);

    const respuesta = await pedirDetalle(base, cookie, "550");
    assert.equal(respuesta.status, 200);
    assert.deepEqual(await respuesta.json(), {
      id: 550,
      titulo: "El club de la lucha",
      anio: 1999,
      sinopsis: "Un oficinista conoce a un vendedor de jabón.",
      generos: [{ id: 18, nombre: "Drama" }],
      duracion: 139,
      cartel: "https://image.tmdb.org/t/p/w500/fightclub.jpg"
    });
    assert.equal(control.ruta, "/movie/550");
    assert.deepEqual(control.parametros, { language: "es-ES" });
  }, { catalogo, detalle });
});

test("la API conserva sinopsis de varios párrafos y deja null las ausentes o vacías", async () => {
  const fichas = {
    550: { id: 550, title: "Ejemplo", overview: "\n Primer párrafo.\r\n\tSegundo párrafo.\n" },
    551: { id: 551, title: "Vacía", overview: "   " },
    552: { id: 552, title: "Ausente" }
  };
  const { catalogo, detalle } = crearServicios(ruta => fichas[Number(ruta.split("/").pop())]);

  await conServidor(async (base, logica) => {
    await crearUsuario(logica);
    const cookie = await iniciarSesion(base);

    const parrafos = await pedirDetalle(base, cookie, "550");
    assert.equal(parrafos.status, 200);
    assert.equal(
      (await parrafos.json()).sinopsis,
      "Primer párrafo.\r\n\tSegundo párrafo."
    );

    for (const id of ["551", "552"]) {
      const respuesta = await pedirDetalle(base, cookie, id);
      assert.equal(respuesta.status, 200);
      assert.equal((await respuesta.json()).sinopsis, null);
    }
  }, { catalogo, detalle });
});

test("los opcionales ausentes no rompen la ficha", async () => {
  const { catalogo, detalle } = crearServicios({
    id: 42,
    original_title: "Título de respaldo"
  });

  await conServidor(async (base, logica) => {
    await crearUsuario(logica);
    const cookie = await iniciarSesion(base);

    const respuesta = await pedirDetalle(base, cookie, "42");
    assert.equal(respuesta.status, 200);
    assert.deepEqual(await respuesta.json(), {
      id: 42,
      titulo: "Título de respaldo",
      anio: null,
      sinopsis: null,
      generos: [],
      duracion: null,
      cartel: null
    });
  }, { catalogo, detalle });
});

test("rechaza identificadores no canónicos antes de consultar al proveedor", async () => {
  const control = {};
  const { catalogo, detalle } = crearServicios(fichaProveedor(), control);

  await conServidor(async (base, logica) => {
    await crearUsuario(logica);
    const cookie = await iniciarSesion(base);

    for (const id of [
      "0", "-1", "+1", "01", "1.0", "1e2", "abc", "1a",
      "2147483648", "%31", "1%2F2", "550%00"
    ]) {
      await comprobarErrorSeguro(
        await pedirDetalle(base, cookie, id),
        400,
        "DETALLE_INVALIDO"
      );
    }
  }, { catalogo, detalle });

  assert.equal(control.llamadas ?? 0, 0);
});

test("no acepta parámetros de consulta en el detalle", async () => {
  const control = {};
  const { catalogo, detalle } = crearServicios(fichaProveedor(), control);

  await conServidor(async (base, logica) => {
    await crearUsuario(logica);
    const cookie = await iniciarSesion(base);

    for (const consulta of [
      "?language=es-ES",
      "?titulo=Dune",
      "?id=550",
      "?x=1",
      "?x=1&x=2"
    ]) {
      await comprobarErrorSeguro(
        await pedirDetalle(base, cookie, "550", consulta),
        400,
        "DETALLE_INVALIDO"
      );
    }
  }, { catalogo, detalle });

  assert.equal(control.llamadas ?? 0, 0);
});

test("los métodos distintos de GET responden 405 con Allow GET antes de la sesión", async () => {
  const control = {};
  const { catalogo, detalle } = crearServicios(fichaProveedor(), control);

  await conServidor(async (base) => {
    for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
      const respuesta = await fetch(`${base}/api/peliculas/550`, { method: metodo });
      assert.equal(respuesta.status, 405);
      assert.equal(respuesta.headers.get("allow"), "GET");
      await respuesta.json();
    }
  }, { catalogo, detalle });

  assert.equal(control.llamadas ?? 0, 0);
});

test("el catálogo ausente responde 503 después de validar la sesión", async () => {
  await conServidor(async (base, logica) => {
    await crearUsuario(logica);

    await comprobarErrorSeguro(await pedirDetalle(base, null, "550"), 401);

    const cookie = await iniciarSesion(base);
    await comprobarErrorSeguro(
      await pedirDetalle(base, cookie, "550"),
      503,
      "CATALOGO_NO_CONFIGURADO"
    );
  });
});

test("el 404 de TMDB solo cambia el detalle; la búsqueda conserva su contrato", async () => {
  const control = { error: new ErrorCatalogoTMDB("TMDB_NO_ENCONTRADO") };
  const { catalogo, detalle } = crearServicios(fichaProveedor(), control);

  await conServidor(async (base, logica) => {
    await crearUsuario(logica);
    const cookie = await iniciarSesion(base);

    await comprobarErrorSeguro(
      await pedirDetalle(base, cookie, "404"),
      404,
      "PELICULA_NO_ENCONTRADA"
    );
    await comprobarErrorSeguro(
      await pedirBusqueda(base, cookie),
      502,
      "CATALOGO_NO_DISPONIBLE"
    );
  }, { catalogo, detalle });

  assert.equal(control.ruta, "/search/movie");
});

test("mapea timeout, límite, red, HTTP y fichas inválidas sin filtrar datos", async () => {
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
      nombre: "ficha que no es objeto",
      respuesta: [TEXTO_PROVEEDOR],
      estado: 502,
      codigo: "DETALLE_RESPUESTA_INVALIDA"
    },
    {
      nombre: "identificador no coincidente",
      respuesta: fichaProveedor({ id: 551 }),
      estado: 502,
      codigo: "DETALLE_RESPUESTA_INVALIDA"
    },
    {
      nombre: "título no utilizable",
      respuesta: fichaProveedor({ title: "  ", original_title: null }),
      estado: 502,
      codigo: "DETALLE_RESPUESTA_INVALIDA"
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

    const { catalogo, detalle } = crearServicios(() => control.respuesta, control);

    await conServidor(async (base, logica) => {
      await crearUsuario(logica);
      const cookie = await iniciarSesion(base);
      await comprobarErrorSeguro(
        await pedirDetalle(base, cookie, "550"),
        caso.estado,
        caso.codigo
      );
    }, { catalogo, detalle });
  }
});

test("un error desconocido responde 500 genérico sin filtrar el mensaje", async () => {
  const control = {
    error: new Error(`fallo interno ${TEXTO_PROVEEDOR}`)
  };
  const { catalogo, detalle } = crearServicios(fichaProveedor(), control);

  await conServidor(async (base, logica) => {
    await crearUsuario(logica);
    const cookie = await iniciarSesion(base);

    await comprobarErrorSeguro(
      await pedirDetalle(base, cookie, "550"),
      500
    );
  }, { catalogo, detalle });
});

test("el registro usa la plantilla de ruta y no el identificador ni la consulta", async () => {
  const registros = [];
  const { catalogo, detalle } = crearServicios(fichaProveedor({ id: 987654 }));

  await conServidor(async (base, logica) => {
    await crearUsuario(logica);
    const cookie = await iniciarSesion(base);

    const respuesta = await pedirDetalle(base, cookie, "987654");
    assert.equal(respuesta.status, 200);
    await respuesta.text();
    await new Promise(resolve => setTimeout(resolve, 20));
  }, {
    catalogo,
    detalle,
    registrarActividad: (evento, campos) => registros.push({ evento, campos })
  });

  assert.equal(registros.length > 0, true);
  const texto = JSON.stringify(registros);
  assert.equal(texto.includes("987654"), false);
  assert.equal(texto.includes("?titulo="), false);
  assert.equal(
    registros.some(registro => registro.campos.ruta === "/api/peliculas/:id"),
    true
  );
  assert.equal(rutaParaRegistro("/api/peliculas/987654"), "/api/peliculas/:id");
  assert.equal(rutaParaRegistro("/api/peliculas/abc"), "/api/peliculas/:id");
});

test("la búsqueda anterior sigue funcionando con el mismo adaptador", async () => {
  const control = {};
  const { catalogo, detalle } = crearServicios((ruta) => ruta === "/search/movie"
    ? {
      page: 1,
      total_pages: 1,
      total_results: 1,
      results: [{ id: 603, title: "Matrix", release_date: "1999-03-31" }]
    }
    : fichaProveedor(), control);

  await conServidor(async (base, logica) => {
    await crearUsuario(logica);
    const cookie = await iniciarSesion(base);

    const busqueda = await pedirBusqueda(base, cookie);
    assert.equal(busqueda.status, 200);
    assert.equal((await busqueda.json()).peliculas[0].titulo, "Matrix");

    const ficha = await pedirDetalle(base, cookie, "550");
    assert.equal(ficha.status, 200);
    assert.equal((await ficha.json()).titulo, "El club de la lucha");
  }, { catalogo, detalle });

  assert.equal(control.llamadas, 2);
});
