import test from "node:test";
import assert from "node:assert/strict";

import {
  crearServicioDisponibilidad,
  ErrorDisponibilidadPelicula
} from "../Servidor/disponibilidad-pelicula.js";
import { ErrorCatalogoTMDB } from "../Servidor/catalogo-tmdb.js";

const TEXTO_PROVEEDOR = "token-ficticio disponibilidad-privada api.themoviedb.org";
const CONSULTADO_EN = "2026-11-13T10:00:00.000Z";

function proveedor(id, nombre, logo = null) {
  return { provider_id: id, provider_name: nombre, logo_path: logo };
}

function respuestaCompleta(extra = {}) {
  return {
    id: 550,
    results: {
      US: {
        flatrate: [proveedor(99, "Otro país")]
      },
      ES: {
        link: "https://www.themoviedb.org/movie/550-fight-club/watch?locale=ES",
        flatrate: [
          proveedor(10, "  Netflix  ", "/netflix.jpg"),
          proveedor(20, "Canal adicional"),
          proveedor(10, "Netflix duplicada")
        ],
        rent: [proveedor(10, "Netflix")],
        buy: [proveedor(30, "Compra")],
        free: [proveedor(40, "Gratis")],
        ads: [proveedor(50, "Anuncios")]
      }
    },
    ...extra
  };
}

function preferencias(ids) {
  return {
    async obtener() {
      return { region: "ES", plataformas: ids };
    }
  };
}

function crearServicio(responder, ids = [10, 99], control = {}) {
  const adaptador = {
    async consultar(ruta, parametros) {
      control.llamadas = (control.llamadas ?? 0) + 1;
      control.ruta = ruta;
      control.parametros = parametros;
      if (control.error) throw control.error;
      return typeof responder === "function" ? responder() : responder;
    }
  };

  return crearServicioDisponibilidad(adaptador, preferencias(ids), {
    reloj: () => new Date(CONSULTADO_EN)
  });
}

test("disponibilidad: consulta watch/providers y cruza solo flatrate de España", async () => {
  const control = {};
  const servicio = crearServicio(respuestaCompleta(), [10, 99], control);

  const resultado = await servicio.obtener("550", "usuario-1");

  assert.equal(control.ruta, "/movie/550/watch/providers");
  assert.equal(control.parametros, undefined);
  assert.equal(control.llamadas, 1);
  assert.equal(resultado.id, 550);
  assert.equal(resultado.region, "ES");
  assert.equal(resultado.consultadoEn, CONSULTADO_EN);
  assert.equal(resultado.sinDatos, false);
  assert.deepEqual(resultado.incluidas.map(p => p.id), [10]);
  assert.deepEqual(resultado.suscripcion.map(p => p.id), [10, 20]);
  assert.deepEqual(resultado.alquiler.map(p => p.id), [10]);
  assert.deepEqual(resultado.compra.map(p => p.id), [30]);
  assert.deepEqual(resultado.gratis.map(p => p.id), [40]);
  assert.deepEqual(resultado.anuncios.map(p => p.id), [50]);
  assert.deepEqual(resultado.suscripcion[0], {
    id: 10,
    nombre: "Netflix",
    logo: "https://image.tmdb.org/t/p/w500/netflix.jpg"
  });
  assert.equal(resultado.enlace, "https://www.themoviedb.org/movie/550-fight-club/watch?locale=ES");
  assert.equal(resultado.mensaje, null);
  assert.equal(JSON.stringify(resultado).includes(TEXTO_PROVEEDOR), false);
});

test("disponibilidad: una selección vacía nunca significa todas las plataformas", async () => {
  const resultado = await crearServicio(respuestaCompleta(), [])
    .obtener("550", "usuario-1");

  assert.deepEqual(resultado.incluidas, []);
  assert.match(resultado.mensaje, /Selecciona/);
  assert.deepEqual(resultado.suscripcion.map(p => p.id), [10, 20]);
});

test("disponibilidad: sin España es una respuesta válida sin datos y sin fallback", async () => {
  const resultado = await crearServicio({
    id: 550,
    results: {
      US: { flatrate: [proveedor(10, "Netflix")] }
    }
  }).obtener("550", "usuario-1");

  assert.equal(resultado.sinDatos, true);
  assert.deepEqual(resultado.incluidas, []);
  assert.deepEqual(resultado.suscripcion, []);
  assert.deepEqual(resultado.alquiler, []);
  assert.equal(resultado.enlace, null);
  assert.match(resultado.mensaje, /No consta disponibilidad/);
});

test("disponibilidad: categorías ausentes quedan vacías y las nulas se rechazan", async () => {
  const vacia = await crearServicio({
    id: 550,
    results: { ES: {} }
  }).obtener("550", "usuario-1");

  assert.equal(vacia.sinDatos, true);
  assert.deepEqual(vacia.suscripcion, []);
  assert.deepEqual(vacia.anuncios, []);

  for (const datos of [
    null,
    [],
    {},
    { id: 551, results: {} },
    { id: "550", results: {} },
    { id: 0, results: {} },
    { id: 2147483648, results: {} },
    { results: null },
    { results: [] },
    { results: { ES: null } },
    { results: { ES: [] } },
    { results: { ES: { flatrate: null } } },
    { results: { ES: { flatrate: {} } } },
    { results: { ES: { flatrate: [null] } } },
    { results: { ES: { flatrate: [proveedor(0, "X")] } } },
    { results: { ES: { flatrate: [proveedor(2147483648, "X")] } } },
    { results: { ES: { flatrate: [proveedor(10, "   ")] } } },
    { results: { ES: { flatrate: [proveedor(10, "X\u0000Y")] } } }
  ]) {
    await assert.rejects(crearServicio(datos).obtener("550", "usuario-1"), {
      name: "ErrorDisponibilidadPelicula",
      codigo: "RESPUESTA_PROVEEDOR_INVALIDA"
    });
  }
});

test("disponibilidad: valida el identificador canónico antes de consultar", async () => {
  for (const id of [
    undefined, null, 550, "", "0", "-1", "+1", "01", "1.0", "1e2",
    "abc", "1a", " 1", "1 ", "%31", "1%2F2", "1\n", "2147483648"
  ]) {
    const control = {};
    const servicio = crearServicio(respuestaCompleta(), [10], control);

    await assert.rejects(servicio.obtener(id, "usuario-1"), {
      name: "ErrorDisponibilidadPelicula",
      codigo: "ENTRADA_INVALIDA"
    });
    assert.equal(control.llamadas ?? 0, 0);
  }
});

test("disponibilidad: acepta el límite int32 y valida el id de la respuesta", async () => {
  assert.equal(
    (await crearServicio({ id: 2147483647, results: {} }, [10])
      .obtener("2147483647", "usuario-1")).id,
    2147483647
  );

  for (const id of [551, "550", null, 0, 2147483648]) {
    await assert.rejects(
      crearServicio(respuestaCompleta({ id }), [10]).obtener("550", "usuario-1"),
      { codigo: "RESPUESTA_PROVEEDOR_INVALIDA" }
    );
  }
});

test("disponibilidad: un id ausente en la respuesta no impide normalizarla", async () => {
  const datos = respuestaCompleta();
  delete datos.id;

  assert.equal((await crearServicio(datos).obtener("550", "usuario-1")).id, 550);
});

test("disponibilidad: solo acepta el enlace TMDB seguro y con slug opcional", async () => {
  const enlaces = [
    ["https://www.themoviedb.org/movie/550/watch", true],
    ["https://www.themoviedb.org/movie/550-fight-club/watch?locale=ES", true],
    ["https://themoviedb.org/movie/550/watch?region=es", true],
    ["http://www.themoviedb.org/movie/550/watch", false],
    ["https://evil.example/movie/550/watch", false],
    ["https://user:clave@www.themoviedb.org/movie/550/watch", false],
    ["https://www.themoviedb.org:8443/movie/550/watch", false],
    ["https://www.themoviedb.org/movie/551/watch", false],
    ["https://www.themoviedb.org/movie/550-wrong/watch?locale=FR", false],
    ["https://www.themoviedb.org/movie/550/watch?foo=ES", false],
    ["https://www.themoviedb.org/movie/550/watch#fragmento", false],
    ["https://www.themoviedb.org/movie/550/watch?locale=ES&locale=ES", false]
  ];

  for (const [link, valido] of enlaces) {
    const resultado = await crearServicio({
      id: 550,
      results: { ES: { link } }
    }).obtener("550", "usuario-1");
    assert.equal(resultado.enlace !== null, valido, link);
  }
});

test("disponibilidad: conserva el fallo de TMDB y convierte el 404 en no encontrada", async () => {
  for (const codigo of ["TMDB_TIMEOUT", "TMDB_LIMITE", "TMDB_RED", "TMDB_HTTP"]) {
    const control = { error: new ErrorCatalogoTMDB(codigo) };
    const servicio = crearServicio(respuestaCompleta(), [10], control);

    await assert.rejects(servicio.obtener("550", "usuario-1"), {
      name: "ErrorCatalogoTMDB",
      codigo
    });
    assert.equal(control.llamadas, 1);
  }

  await assert.rejects(
    crearServicio(null, [10], {
      error: new ErrorCatalogoTMDB("TMDB_NO_ENCONTRADO")
    }).obtener("404", "usuario-1"),
    { name: "ErrorDisponibilidadPelicula", codigo: "PELICULA_NO_ENCONTRADA" }
  );
});

test("disponibilidad: exige adaptador, preferencias y reloj válidos", () => {
  for (const adaptador of [null, {}, { consultar: 1 }]) {
    assert.throws(() => crearServicioDisponibilidad(adaptador, preferencias([])), {
      name: "ErrorDisponibilidadPelicula",
      codigo: "ENTRADA_INVALIDA"
    });
  }

  const adaptador = { async consultar() { return {}; } };
  for (const servicioPreferencias of [null, {}, { obtener: 1 }]) {
    assert.throws(() => crearServicioDisponibilidad(adaptador, servicioPreferencias), {
      name: "ErrorDisponibilidadPelicula",
      codigo: "ENTRADA_INVALIDA"
    });
  }

  assert.throws(
    () => crearServicioDisponibilidad(adaptador, preferencias([]), { reloj: 1 }),
    { name: "ErrorDisponibilidadPelicula", codigo: "ENTRADA_INVALIDA" }
  );
});

test("disponibilidad: el reloj inyectado no se sustituye por la fecha actual", async () => {
  const servicio = crearServicioDisponibilidad(
    { async consultar() { return { results: { ES: {} } }; } },
    preferencias([10]),
    { reloj: () => new Date("2020-01-02T03:04:05.000Z") }
  );

  assert.equal(
    (await servicio.obtener("550", "usuario-1")).consultadoEn,
    "2020-01-02T03:04:05.000Z"
  );
});

test("disponibilidad: un error de preferencias no se convierte en ausencia", async () => {
  const error = new Error("preferencias no disponibles");
  const servicio = crearServicioDisponibilidad(
    { async consultar() { return { results: { ES: {} } }; } },
    { async obtener() { throw error; } }
  );

  await assert.rejects(servicio.obtener("550", "usuario-1"), {
    message: "preferencias no disponibles"
  });
});