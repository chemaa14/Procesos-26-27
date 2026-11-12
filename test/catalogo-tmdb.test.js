import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  crearCatalogoTMDB,
  ErrorCatalogoTMDB,
  ORIGEN_TMDB,
  TIMEOUT_TMDB_PREDETERMINADO_MS,
  TIMEOUT_TMDB_MAXIMO_MS
} from "../Servidor/catalogo-tmdb.js";

const TOKEN = "token-ficticio-de-prueba";
const CONFIGURACION = { TMDB_READ_ACCESS_TOKEN: TOKEN };

function respuesta(cuerpo, estado = 200) {
  return new Response(cuerpo, {
    status: estado,
    headers: { "content-type": "application/json" }
  });
}

function sinFiltraciones(error, textos) {
  const contenido = `${error.message} ${JSON.stringify(error)}`;
  return textos.every(texto => !contenido.includes(texto));
}

async function abrirServidorLocal(manejador) {
  const servidor = createServer(manejador);
  await new Promise((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(0, "127.0.0.1", resolve);
  });
  return { servidor, base: `http://127.0.0.1:${servidor.address().port}` };
}

async function cerrarServidorLocal(servidor) {
  servidor.closeAllConnections();
  await new Promise(resolve => servidor.close(resolve));
}

function conPlazo(promesa, ms, mensaje) {
  let temporizador;
  const plazo = new Promise((_, reject) => {
    temporizador = setTimeout(() => reject(new Error(mensaje)), ms);
  });
  return Promise.race([promesa, plazo]).finally(() => clearTimeout(temporizador));
}

test("La configuración exige token y valida el timeout", () => {
  for (const env of [
    {},
    { TMDB_READ_ACCESS_TOKEN: "" },
    { TMDB_READ_ACCESS_TOKEN: "   " },
    { TMDB_READ_ACCESS_TOKEN: "token con espacios" }
  ]) {
    assert.throws(() => crearCatalogoTMDB(env, async () => respuesta("{}")), {
      codigo: "CONFIGURACION_TMDB_INVALIDA"
    });
  }

  for (const timeout of [0, -1, 1.5, "abc", "", TIMEOUT_TMDB_MAXIMO_MS + 1, Infinity]) {
    assert.throws(
      () => crearCatalogoTMDB({ ...CONFIGURACION, TMDB_TIMEOUT_MS: timeout }, async () => respuesta("{}")),
      { codigo: "CONFIGURACION_TMDB_INVALIDA" }
    );
  }

  assert.throws(() => crearCatalogoTMDB(CONFIGURACION, null), { codigo: "CONFIGURACION_TMDB_INVALIDA" });
  assert.equal(TIMEOUT_TMDB_PREDETERMINADO_MS, 10000);
  assert.doesNotThrow(() => crearCatalogoTMDB(CONFIGURACION, async () => respuesta("{}")));
});

test("El adaptador no expone el token y consulta un GET dentro del origen fijo", async () => {
  let peticion;
  const adaptador = crearCatalogoTMDB(CONFIGURACION, async (url, opciones) => {
    peticion = { url, opciones };
    return respuesta('{"resultados":[]}');
  });

  assert.deepEqual(Object.keys(adaptador), ["consultar"]);
  assert.equal(JSON.stringify(adaptador).includes(TOKEN), false);
  assert.deepEqual(await adaptador.consultar("/movie/550", {
    language: "es-ES",
    page: 2,
    include_adult: false
  }), { resultados: [] });

  const url = new URL(peticion.url);
  assert.equal(url.origin, "https://api.themoviedb.org");
  assert.equal(url.pathname, "/3/movie/550");
  assert.equal(url.searchParams.get("language"), "es-ES");
  assert.equal(url.searchParams.get("page"), "2");
  assert.equal(url.searchParams.get("include_adult"), "false");
  assert.equal(url.searchParams.has("api_key"), false);
  assert.equal(peticion.url.includes(TOKEN), false);
  assert.equal(peticion.opciones.method, "GET");
  assert.equal(peticion.opciones.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(peticion.opciones.headers.Accept, "application/json");
  assert.equal(peticion.opciones.redirect, "error");
  assert.equal(peticion.opciones.signal instanceof AbortSignal, true);
  assert.equal(ORIGEN_TMDB, "https://api.themoviedb.org/3");
});

test("Las rutas absolutas, ambiguas o fuera de /3 se rechazan como entrada inválida", async () => {
  let llamadas = 0;
  const adaptador = crearCatalogoTMDB(CONFIGURACION, async () => {
    llamadas++;
    return respuesta("{}");
  });

  const rutas = [
    "",
    "movie/550",
    "https://example.com/movie/550",
    "//example.com/movie/550",
    "/\\example.com/movie/550",
    "/../account",
    "/movie/../../../account",
    "/%2e%2e/account",
    "/movie?api_key=expuesta",
    "/movie#fragmento"
  ];

  for (const ruta of rutas) {
    await assert.rejects(adaptador.consultar(ruta), { codigo: "ENTRADA_INVALIDA" });
  }
  assert.equal(llamadas, 0);
});

test("Los parámetros no admiten valores ambiguos y no se confunden con fallos de TMDB", async () => {
  let llamadas = 0;
  const adaptador = crearCatalogoTMDB(CONFIGURACION, async () => {
    llamadas++;
    return respuesta("{}");
  });

  for (const parametros of [
    null,
    [],
    "page=1",
    { page: NaN },
    { page: Infinity },
    { page: {} },
    { page: () => 1 },
    { "": "valor" }
  ]) {
    await assert.rejects(adaptador.consultar("/movie/550", parametros), {
      codigo: "ENTRADA_INVALIDA"
    });
  }
  assert.equal(llamadas, 0);
});

test("Los estados HTTP se convierten en errores conocidos sin filtrar el cuerpo", async () => {
  const casos = [
    [400, "TMDB_HTTP"],
    [401, "TMDB_AUTENTICACION"],
    [403, "TMDB_AUTENTICACION"],
    [404, "TMDB_NO_ENCONTRADO"],
    [429, "TMDB_LIMITE"],
    [500, "TMDB_HTTP"]
  ];

  for (const [estado, codigo] of casos) {
    let llamadas = 0;
    const adaptador = crearCatalogoTMDB(CONFIGURACION, async () => {
      llamadas++;
      return respuesta(`detalle original ${TOKEN} https://api.themoviedb.org/3/privada`, estado);
    });

    await assert.rejects(adaptador.consultar("/movie/550"), error => {
      assert.equal(error instanceof ErrorCatalogoTMDB, true);
      assert.equal(error.codigo, codigo);
      if (codigo === "TMDB_HTTP") assert.equal(error.estado, estado);
      assert.equal(sinFiltraciones(error, [TOKEN, "detalle original", "api.themoviedb.org/3/privada"]), true);
      return true;
    });
    assert.equal(llamadas, 1);
  }
});

test("Un error HTTP con cuerpo pendiente se aborta y libera la conexión", async () => {
  let cierre;
  let senal;
  const { servidor, base } = await abrirServidorLocal((peticion, respuestaHttp) => {
    respuestaHttp.writeHead(500, { "content-type": "application/json" });
    cierre = new Promise(resolve => respuestaHttp.once("close", resolve));
    respuestaHttp.write('{"error":"');
  });
  const adaptador = crearCatalogoTMDB({ ...CONFIGURACION, TMDB_TIMEOUT_MS: 5000 }, (url, opciones) => {
    senal = opciones.signal;
    return fetch(`${base}/`, opciones);
  });

  try {
    await assert.rejects(adaptador.consultar("/movie/550"), { codigo: "TMDB_HTTP" });
    assert.equal(senal.aborted, true);
    await conPlazo(cierre, 1000, "La respuesta pendiente no se canceló tras el error HTTP.");
  } finally {
    await cerrarServidorLocal(servidor);
  }
});

test("Los fallos de red no conservan el mensaje original y no se reintentan", async () => {
  let llamadas = 0;
  const adaptador = crearCatalogoTMDB(CONFIGURACION, async () => {
    llamadas++;
    throw new Error(`fallo ${TOKEN} https://api.themoviedb.org/3/privada`);
  });

  await assert.rejects(adaptador.consultar("/movie/550"), error => {
    assert.equal(error.codigo, "TMDB_RED");
    assert.equal(sinFiltraciones(error, [TOKEN, "fallo", "api.themoviedb.org/3/privada"]), true);
    return true;
  });
  assert.equal(llamadas, 1);
});

test("Una respuesta que no es JSON se rechaza sin filtrar el cuerpo", async () => {
  for (const cuerpo of ["", "no es json", `{"token":"${TOKEN}"`]) {
    const adaptador = crearCatalogoTMDB(CONFIGURACION, async () => respuesta(cuerpo));
    await assert.rejects(adaptador.consultar("/movie/550"), error => {
      assert.equal(error.codigo, "TMDB_RESPUESTA_INVALIDA");
      assert.equal(sinFiltraciones(error, [TOKEN, "no es json"]), true);
      return true;
    });
  }
});

test("El timeout cubre la espera de la petición y se distingue de un fallo de red", async () => {
  const adaptador = crearCatalogoTMDB({ ...CONFIGURACION, TMDB_TIMEOUT_MS: 20 }, (url, opciones) =>
    new Promise((resolve, reject) => {
      const abortar = () => reject(Object.assign(new Error("abortada"), { name: "AbortError" }));
      if (opciones.signal.aborted) abortar();
      else opciones.signal.addEventListener("abort", abortar, { once: true });
    })
  );

  await assert.rejects(adaptador.consultar("/movie/550"), { codigo: "TMDB_TIMEOUT" });
});

test("El timeout también interrumpe la lectura del cuerpo ya iniciada", async () => {
  let cabeceraRecibida;
  let inicioCuerpo;
  let resolverInicio;
  const cuerpoIniciado = new Promise(resolve => { resolverInicio = resolve; });
  const { servidor, base } = await abrirServidorLocal((peticion, respuestaHttp) => {
    cabeceraRecibida = peticion.headers.authorization;
    respuestaHttp.writeHead(200, { "content-type": "application/json" });
    respuestaHttp.write('{"resultados":[', () => {
      inicioCuerpo = Date.now();
      resolverInicio();
    });
  });
  const adaptador = crearCatalogoTMDB({ ...CONFIGURACION, TMDB_TIMEOUT_MS: 1000 }, (url, opciones) =>
    fetch(`${base}/`, opciones)
  );

  try {
    let rechazadoEn;
    const consulta = adaptador.consultar("/movie/550").catch(error => {
      rechazadoEn = Date.now();
      throw error;
    });
    await conPlazo(cuerpoIniciado, 1000, "La respuesta local no comenzó a leerse.");
    await assert.rejects(consulta, { codigo: "TMDB_TIMEOUT" });
    assert.equal(cabeceraRecibida, `Bearer ${TOKEN}`);
    assert.equal(rechazadoEn >= inicioCuerpo, true);
  } finally {
    await cerrarServidorLocal(servidor);
  }
});
