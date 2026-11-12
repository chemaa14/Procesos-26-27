import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { crearAplicacion } from "../Servidor/api.js";
import { crearCatalogoTMDB } from "../Servidor/catalogo-tmdb.js";
import { crearServicioBusqueda } from "../Servidor/busqueda-peliculas.js";
import { crearServicioDetalle } from "../Servidor/detalle-pelicula.js";
import { crearRegistroActividad } from "../Servidor/actividad.js";

const TOKEN = "token-ficticio-integracion-cinematch";
const PASSWORD = "Mi frase secreta para CineMatch";
const CARTEL_BASE = "https://image.tmdb.org/t/p/w500";

const DUNE = {
  id: 438631,
  title: "Dune",
  original_title: "Dune",
  release_date: "2021-10-22",
  poster_path: "/dune-2021.jpg"
};

const DUNE_SEGUNDA_PAGINA = {
  id: 693134,
  title: "Dune",
  original_title: "Dune",
  release_date: "2021-09-15",
  poster_path: "/dune-2021-b.jpg"
};

const MATRIX = {
  id: 603,
  title: "Matrix",
  original_title: "The Matrix",
  release_date: "1999-03-31",
  poster_path: "/matrix.jpg"
};

function respuestaJSON(cuerpo, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "content-type": "application/json" }
  });
}

function respuestaMatrix() {
  return respuestaJSON({
    page: 1,
    total_pages: 1,
    total_results: 1,
    results: [MATRIX]
  });
}

function responderCatalogo(url) {
  if (url.pathname === "/3/search/movie") {
    const pagina = Number(url.searchParams.get("page"));
    const consulta = url.searchParams.get("query");

    if (consulta === "Dune") {
      return respuestaJSON({
        page: pagina,
        total_pages: 2,
        total_results: 2,
        results: [pagina === 1 ? DUNE : DUNE_SEGUNDA_PAGINA]
      });
    }

    if (consulta === "Matrix") return respuestaMatrix();
  }

  if (url.pathname === "/3/movie/438631") {
    return respuestaJSON({
      id: 438631,
      title: "Dune",
      original_title: "Dune",
      overview: "Paul Atreides lidera a los Fremen.",
      release_date: "2021-10-22",
      genres: [
        { id: 878, name: "Ciencia ficción" },
        { id: 12, name: "Aventura" }
      ],
      runtime: 155,
      poster_path: "/dune-2021.jpg"
    });
  }

  return respuestaJSON({ error: "petición no esperada" }, 404);
}

function crearProveedor(responder) {
  const peticiones = [];

  const fetchImpl = (url, opciones) => {
    peticiones.push({ url, opciones });
    return responder(new URL(url), opciones);
  };

  return { fetchImpl, peticiones };
}

async function conAplicacion(responder, comprobar, { timeoutMs = 1000 } = {}) {
  const { fetchImpl, peticiones } = crearProveedor(responder);
  const adaptador = crearCatalogoTMDB(
    { TMDB_READ_ACCESS_TOKEN: TOKEN, TMDB_TIMEOUT_MS: timeoutMs },
    fetchImpl
  );
  const registros = [];
  const { servidor, logica } = crearAplicacion({
    catalogo: crearServicioBusqueda(adaptador),
    detalle: crearServicioDetalle(adaptador),
    cookieSegura: false,
    registrarActividad: crearRegistroActividad({
      escribir: linea => registros.push(linea)
    })
  });

  try {
    servidor.listen(0, "127.0.0.1");
    await once(servidor, "listening");

    const base = `http://127.0.0.1:${servidor.address().port}`;
    await comprobar({ base, logica, peticiones, registros });
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

async function crearUsuarioConfirmado(logica, email = "ana@example.com") {
  const usuario = await logica.registrar({
    nombre: "Usuario de prueba",
    email,
    password: PASSWORD
  });

  await logica.confirmar(usuario.id);
  return usuario;
}

async function leer(respuesta) {
  const texto = await respuesta.text();
  const cabeceras = [...respuesta.headers.entries()]
    .map(([nombre, valor]) => `${nombre}: ${valor}`)
    .join("\n");

  assert.equal(texto.includes(TOKEN), false);
  assert.equal(cabeceras.includes(TOKEN), false);

  return {
    estado: respuesta.status,
    texto,
    cabeceras,
    cuerpo: texto ? JSON.parse(texto) : null
  };
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
  await leer(respuesta);
  assert.equal(cookie.includes(TOKEN), false);

  return cookie.split(";")[0];
}

async function cerrarSesion(base, cookie) {
  const respuesta = await fetch(`${base}/api/logout`, {
    method: "POST",
    headers: { Cookie: cookie, "X-CineMatch": "1" }
  });

  const datos = await leer(respuesta);
  assert.equal(datos.estado, 204);
  return datos;
}

async function buscarYLeer(base, cookie, consulta = "?titulo=Dune") {
  const respuesta = await fetch(`${base}/api/peliculas${consulta}`, {
    headers: cookie ? { Cookie: cookie } : {}
  });

  return leer(respuesta);
}

async function detalleYLeer(base, cookie, id) {
  const respuesta = await fetch(`${base}/api/peliculas/${id}`, {
    headers: cookie ? { Cookie: cookie } : {}
  });

  return leer(respuesta);
}

function comprobarPeticionProveedor(peticion, { ruta, parametros = {}, ausentes = [] }) {
  const url = new URL(peticion.url);

  assert.equal(url.origin, "https://api.themoviedb.org");
  assert.equal(url.pathname, `/3${ruta}`);
  assert.equal(url.href.includes(TOKEN), false);

  for (const [clave, valor] of Object.entries(parametros)) {
    assert.equal(url.searchParams.get(clave), String(valor));
  }

  for (const clave of ausentes) {
    assert.equal(url.searchParams.has(clave), false);
  }

  assert.equal(peticion.opciones.method, "GET");
  assert.equal(peticion.opciones.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(peticion.opciones.headers.Accept, "application/json");
  assert.equal(peticion.opciones.redirect, "error");
}

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test("recorrido autenticado con búsqueda paginada, detalle y nueva búsqueda sin filtrar el token", async () => {
  await conAplicacion(responderCatalogo, async ({ base, logica, peticiones, registros }) => {
    await crearUsuarioConfirmado(logica);

    const sinSesion = await buscarYLeer(base, null, "?titulo=Dune&anio=2021");
    assert.equal(sinSesion.estado, 401);
    assert.equal(peticiones.length, 0);

    const cookie = await iniciarSesion(base);

    const primera = await buscarYLeer(base, cookie, "?titulo=Dune&anio=2021&pagina=1");
    assert.equal(primera.estado, 200);
    assert.deepEqual(primera.cuerpo, {
      pagina: 1,
      totalPaginas: 2,
      totalResultados: 2,
      peliculas: [{
        id: 438631,
        titulo: "Dune",
        anio: 2021,
        cartel: `${CARTEL_BASE}/dune-2021.jpg`
      }]
    });
    assert.equal(peticiones.length, 1);
    comprobarPeticionProveedor(peticiones[0], {
      ruta: "/search/movie",
      parametros: {
        query: "Dune",
        page: "1",
        primary_release_year: "2021"
      }
    });

    const segunda = await buscarYLeer(base, cookie, "?titulo=Dune&anio=2021&pagina=2");
    assert.equal(segunda.estado, 200);
    assert.deepEqual(segunda.cuerpo, {
      pagina: 2,
      totalPaginas: 2,
      totalResultados: 2,
      peliculas: [{
        id: 693134,
        titulo: "Dune",
        anio: 2021,
        cartel: `${CARTEL_BASE}/dune-2021-b.jpg`
      }]
    });
    assert.equal(peticiones.length, 2);
    comprobarPeticionProveedor(peticiones[1], {
      ruta: "/search/movie",
      parametros: {
        query: "Dune",
        page: "2",
        primary_release_year: "2021"
      }
    });

    const ficha = await detalleYLeer(base, cookie, "438631");
    assert.equal(ficha.estado, 200);
    assert.deepEqual(ficha.cuerpo, {
      id: 438631,
      titulo: "Dune",
      anio: 2021,
      sinopsis: "Paul Atreides lidera a los Fremen.",
      generos: [
        { id: 878, nombre: "Ciencia ficción" },
        { id: 12, nombre: "Aventura" }
      ],
      duracion: 155,
      cartel: `${CARTEL_BASE}/dune-2021.jpg`
    });
    assert.equal(peticiones.length, 3);
    comprobarPeticionProveedor(peticiones[2], {
      ruta: "/movie/438631",
      parametros: { language: "es-ES" }
    });

    const nueva = await buscarYLeer(base, cookie, "?titulo=Matrix");
    assert.equal(nueva.estado, 200);
    assert.deepEqual(nueva.cuerpo, {
      pagina: 1,
      totalPaginas: 1,
      totalResultados: 1,
      peliculas: [{
        id: 603,
        titulo: "Matrix",
        anio: 1999,
        cartel: `${CARTEL_BASE}/matrix.jpg`
      }]
    });
    assert.equal(peticiones.length, 4);
    comprobarPeticionProveedor(peticiones[3], {
      ruta: "/search/movie",
      parametros: { query: "Matrix", page: "1" },
      ausentes: ["primary_release_year"]
    });

    await esperar(20);
    assert.equal(registros.length > 0, true);
    assert.equal(registros.some(linea => linea.includes(TOKEN)), false);
  });
});

test("el logout bloquea la búsqueda y el detalle sin nuevas llamadas al proveedor", async () => {
  await conAplicacion(responderCatalogo, async ({ base, logica, peticiones, registros }) => {
    await crearUsuarioConfirmado(logica);
    const cookie = await iniciarSesion(base);

    const antes = await buscarYLeer(base, cookie, "?titulo=Dune&anio=2021");
    assert.equal(antes.estado, 200);
    assert.equal(peticiones.length, 1);

    await cerrarSesion(base, cookie);

    const despues = await buscarYLeer(base, cookie, "?titulo=Matrix");
    assert.equal(despues.estado, 401);

    const ficha = await detalleYLeer(base, cookie, "438631");
    assert.equal(ficha.estado, 401);
    assert.equal(peticiones.length, 1);

    await esperar(20);
    assert.equal(registros.some(linea => linea.includes(TOKEN)), false);
  });
});

const FALLOS_PROVEEDOR = [
  {
    nombre: "429 del proveedor",
    responder: () => respuestaJSON({ error: `límite ${TOKEN}` }, 429),
    estado: 503,
    codigo: "CATALOGO_LIMITE"
  },
  {
    nombre: "timeout del proveedor",
    responder: (url, opciones) => new Promise((resolve, reject) => {
      const abortar = () => reject(Object.assign(
        new Error(`abortada ${TOKEN}`),
        { name: "AbortError" }
      ));

      if (opciones.signal.aborted) abortar();
      else opciones.signal.addEventListener("abort", abortar, { once: true });
    }),
    estado: 504,
    codigo: "CATALOGO_TIMEOUT",
    timeoutMs: 50
  },
  {
    nombre: "JSON inválido del proveedor",
    responder: () => new Response(`{"token":"${TOKEN}"`, {
      status: 200,
      headers: { "content-type": "application/json" }
    }),
    estado: 502,
    codigo: "CATALOGO_NO_DISPONIBLE"
  }
];

test("los fallos del proveedor no filtran secretos y la búsqueda se recupera después", async t => {
  for (const caso of FALLOS_PROVEEDOR) {
    await t.test(caso.nombre, async () => {
      let modo = "fallo";

      await conAplicacion((url, opciones) => {
        if (
          url.pathname === "/3/search/movie" &&
          url.searchParams.get("query") === "Matrix"
        ) {
          return modo === "fallo"
            ? caso.responder(url, opciones)
            : respuestaMatrix();
        }

        return respuestaJSON({ error: "petición no esperada" }, 404);
      }, async ({ base, logica, peticiones, registros }) => {
        await crearUsuarioConfirmado(logica);
        const cookie = await iniciarSesion(base);

        const fallo = await buscarYLeer(base, cookie, "?titulo=Matrix");
        assert.equal(fallo.estado, caso.estado);
        assert.equal(fallo.cuerpo.codigo, caso.codigo);
        assert.equal(fallo.texto.includes(TOKEN), false);
        assert.equal(fallo.texto.includes("api.themoviedb.org"), false);
        assert.equal(peticiones.length, 1);

        modo = "recuperado";

        const recuperada = await buscarYLeer(base, cookie, "?titulo=Matrix");
        assert.equal(recuperada.estado, 200);
        assert.equal(recuperada.cuerpo.peliculas[0].titulo, "Matrix");
        assert.equal(peticiones.length, 2);

        for (const peticion of peticiones) {
          comprobarPeticionProveedor(peticion, {
            ruta: "/search/movie",
            parametros: { query: "Matrix" },
            ausentes: ["primary_release_year"]
          });
        }

        await esperar(20);
        assert.equal(registros.some(linea => linea.includes(TOKEN)), false);
      }, { timeoutMs: caso.timeoutMs });
    });
  }
});
