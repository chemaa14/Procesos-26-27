import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";

import { crearAplicacion } from "../Servidor/api.js";
import { DatosUsuarios } from "../Servidor/datos.js";
import { Sesiones } from "../Servidor/sesiones.js";
import { crearServicioDisponibilidad } from "../Servidor/disponibilidad-pelicula.js";
import { ErrorCatalogoTMDB } from "../Servidor/catalogo-tmdb.js";
import { crearRegistroActividad, rutaParaRegistro } from "../Servidor/actividad.js";

const privado = "token-ficticio-no-divulgar api.themoviedb.org";
const CONSULTADO_EN = "2026-11-13T10:00:00.000Z";

function proveedor(id, nombre) {
  return { provider_id: id, provider_name: nombre, logo_path: null };
}

function respuesta(extra = {}) {
  return {
    id: 550,
    results: {
      ES: {
        link: "https://www.themoviedb.org/movie/550-fight-club/watch?locale=ES",
        flatrate: [proveedor(10, "Netflix"), proveedor(20, "Canal")],
        rent: [proveedor(10, "Netflix")],
        buy: [proveedor(30, "Compra")],
        free: [proveedor(40, "Gratis")],
        ads: [proveedor(50, "Anuncios")]
      }
    },
    ...extra
  };
}

async function conAPI(comprobar, opciones = {}) {
  const datos = new DatosUsuarios();
  const sesiones = new Sesiones();
  const preferenciasPorUsuario = opciones.preferenciasPorUsuario ?? new Map();
  const control = { llamadas: 0, error: null, respuesta: respuesta() };
  const adaptador = {
    async consultar(ruta, parametros) {
      control.llamadas += 1;
      control.ruta = ruta;
      control.parametros = parametros;
      if (control.error) throw control.error;
      return control.respuesta;
    }
  };
  const preferencias = {
    async obtener(usuarioId) {
      return { region: "ES", plataformas: preferenciasPorUsuario.get(usuarioId) ?? [] };
    }
  };
  const disponibilidad = opciones.sinDisponibilidad
    ? null
    : crearServicioDisponibilidad(adaptador, preferencias, {
      reloj: () => new Date(CONSULTADO_EN)
    });
  const registros = [];
  const app = crearAplicacion({
    datos,
    sesiones,
    preferencias,
    disponibilidad,
    cookieSegura: false,
    registrarActividad: crearRegistroActividad({
      escribir: linea => registros.push(linea)
    })
  });

  async function cuenta({ confirmado = true, eliminado = false, rol = "usuario" } = {}) {
    const id = randomUUID();
    await datos.guardar({
      id,
      nombre: "Prueba",
      email: `${id}@example.invalid`,
      confirmado,
      eliminado,
      rol
    });
    const token = await sesiones.crear(id);
    return { id, cookie: `cinematch_sesion=${token}` };
  }

  try {
    app.servidor.listen(0, "127.0.0.1");
    await once(app.servidor, "listening");
    const base = `http://127.0.0.1:${app.servidor.address().port}`;

    async function pedir(id, cookie, { metodo = "GET", consulta = "" } = {}) {
      const respuestaHTTP = await fetch(
        `${base}/api/peliculas/${id}/disponibilidad${consulta}`,
        {
          method: metodo,
          headers: cookie ? { Cookie: cookie } : {}
        }
      );
      const texto = await respuestaHTTP.text();
      assert.equal(texto.includes(privado), false);
      assert.equal(respuestaHTTP.headers.get("cache-control"), "no-store");
      return {
        estado: respuestaHTTP.status,
        allow: respuestaHTTP.headers.get("allow"),
        cuerpo: texto ? JSON.parse(texto) : null,
        texto
      };
    }

    await comprobar({ cuenta, pedir, control, registros, preferenciasPorUsuario });
  } finally {
    if (app.servidor.listening) {
      app.servidor.closeAllConnections();
      await new Promise(resolve => app.servidor.close(resolve));
    }
  }
}

test("API disponibilidad: exige una sesión propia, confirmada y activa antes de TMDB", async () => {
  await conAPI(async ({ cuenta, pedir, control }) => {
    for (const cookie of [
      null,
      "cinematch_sesion=invalida",
      (await cuenta({ confirmado: false })).cookie,
      (await cuenta({ eliminado: true })).cookie
    ]) {
      assert.equal((await pedir("550", cookie)).estado, 401);
    }
    assert.equal(control.llamadas, 0);
  });
});

test("API disponibilidad: solo GET, sin consulta y con identificador canónico", async () => {
  await conAPI(async ({ cuenta, pedir, control }) => {
    const { cookie } = await cuenta();

    for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
      const respuestaHTTP = await pedir("550", cookie, { metodo });
      assert.equal(respuestaHTTP.estado, 405);
      assert.equal(respuestaHTTP.allow, "GET");
    }

    for (const consulta of ["?region=ES", "?language=es-ES", "?x=1&x=2"]) {
      const respuestaHTTP = await pedir("550", cookie, { consulta });
      assert.equal(respuestaHTTP.estado, 400);
      assert.equal(respuestaHTTP.cuerpo.codigo, "DISPONIBILIDAD_INVALIDA");
    }

    for (const id of [
      "0", "-1", "+1", "01", "1.0", "1e2", "abc", "1a",
      "2147483648", "%31", "1%2F2", "550%00"
    ]) {
      const respuestaHTTP = await pedir(id, cookie);
      assert.equal(respuestaHTTP.estado, 400);
      assert.equal(respuestaHTTP.cuerpo.codigo, "DISPONIBILIDAD_INVALIDA");
    }

    assert.equal(control.llamadas, 0);
  });
});

test("API disponibilidad: devuelve la disponibilidad cruzada con la sesión", async () => {
  await conAPI(async ({ cuenta, pedir, control, preferenciasPorUsuario }) => {
    const a = await cuenta(), b = await cuenta();
    preferenciasPorUsuario.set(a.id, [10]);

    const respuestaHTTP = await pedir("550", a.cookie);
    assert.equal(respuestaHTTP.estado, 200);
    assert.deepEqual(respuestaHTTP.cuerpo, {
      id: 550,
      region: "ES",
      consultadoEn: CONSULTADO_EN,
      sinDatos: false,
      incluidas: [{ id: 10, nombre: "Netflix", logo: null }],
      suscripcion: [
        { id: 10, nombre: "Netflix", logo: null },
        { id: 20, nombre: "Canal", logo: null }
      ],
      alquiler: [{ id: 10, nombre: "Netflix", logo: null }],
      compra: [{ id: 30, nombre: "Compra", logo: null }],
      gratis: [{ id: 40, nombre: "Gratis", logo: null }],
      anuncios: [{ id: 50, nombre: "Anuncios", logo: null }],
      enlace: "https://www.themoviedb.org/movie/550-fight-club/watch?locale=ES",
      mensaje: null
    });
    assert.equal(control.ruta, "/movie/550/watch/providers");
    assert.equal(control.parametros, undefined);

    const otra = await pedir("550", b.cookie);
    assert.equal(otra.estado, 200);
    assert.deepEqual(otra.cuerpo.incluidas, []);
    assert.match(otra.cuerpo.mensaje, /Selecciona/);
  });
});

test("API disponibilidad: ES ausente es 200 sin datos, no un error", async () => {
  await conAPI(async ({ cuenta, pedir, control, preferenciasPorUsuario }) => {
    const { id, cookie } = await cuenta();
    preferenciasPorUsuario.set(id, [10]);
    control.respuesta = { id: 550, results: { US: { flatrate: [proveedor(10, "Netflix")] } } };

    const respuestaHTTP = await pedir("550", cookie);
    assert.equal(respuestaHTTP.estado, 200);
    assert.equal(respuestaHTTP.cuerpo.sinDatos, true);
    assert.deepEqual(respuestaHTTP.cuerpo.incluidas, []);
    assert.match(respuestaHTTP.cuerpo.mensaje, /No consta disponibilidad/);
  });
});

test("API disponibilidad: distingue 404, 502, 503, 504 y respuesta inválida", async () => {
  const casos = [
    { error: "TMDB_NO_ENCONTRADO", estado: 404, codigo: "PELICULA_NO_ENCONTRADA" },
    { error: "TMDB_TIMEOUT", estado: 504, codigo: "CATALOGO_TIMEOUT" },
    { error: "TMDB_LIMITE", estado: 503, codigo: "CATALOGO_LIMITE" },
    { error: "TMDB_RED", estado: 502, codigo: "CATALOGO_NO_DISPONIBLE" },
    { error: "TMDB_HTTP", estado: 502, codigo: "CATALOGO_NO_DISPONIBLE" },
    { respuesta: { id: 550, results: { ES: { flatrate: null } } }, estado: 502, codigo: "DISPONIBILIDAD_RESPUESTA_INVALIDA" },
    { respuesta: { id: 551, results: {} }, estado: 502, codigo: "DISPONIBILIDAD_RESPUESTA_INVALIDA" }
  ];

  for (const caso of casos) {
    await conAPI(async ({ cuenta, pedir, control, preferenciasPorUsuario }) => {
      const { id, cookie } = await cuenta();
      preferenciasPorUsuario.set(id, [10]);
      if (caso.error) {
        control.error = new ErrorCatalogoTMDB(caso.error);
        control.error.message = privado;
      } else {
        control.respuesta = caso.respuesta;
      }

      const respuestaHTTP = await pedir("550", cookie);
      assert.equal(respuestaHTTP.estado, caso.estado);
      assert.equal(respuestaHTTP.cuerpo.codigo, caso.codigo);
      assert.equal(respuestaHTTP.texto.includes(privado), false);
    });
  }
});

test("API disponibilidad: sin servicio responde 503 tras validar la sesión", async () => {
  await conAPI(async ({ cuenta, pedir }) => {
    assert.equal((await pedir("550", null)).estado, 401);
    const { cookie } = await cuenta();
    const respuestaHTTP = await pedir("550", cookie);
    assert.equal(respuestaHTTP.estado, 503);
    assert.equal(respuestaHTTP.cuerpo.codigo, "CATALOGO_NO_CONFIGURADO");
  }, { sinDisponibilidad: true });
});

test("API disponibilidad: los registros usan la plantilla de ruta sin el ID", async () => {
  await conAPI(async ({ cuenta, pedir, registros, preferenciasPorUsuario, control }) => {
    const { id, cookie } = await cuenta();
    preferenciasPorUsuario.set(id, [10]);
    control.respuesta = respuesta({ id: 987654 });

    const respuestaHTTP = await pedir("987654", cookie);
    assert.equal(respuestaHTTP.estado, 200);
    await new Promise(resolve => setTimeout(resolve, 20));

    const texto = JSON.stringify(registros);
    assert.equal(texto.includes("987654"), false);
    assert.equal(
      registros.some(linea => JSON.parse(linea).ruta === "/api/peliculas/:id/disponibilidad"),
      true
    );
    assert.equal(
      rutaParaRegistro("/api/peliculas/987654/disponibilidad"),
      "/api/peliculas/:id/disponibilidad"
    );
    assert.equal(
      rutaParaRegistro("/api/peliculas/abc/disponibilidad"),
      "/api/peliculas/:id/disponibilidad"
    );
  });
});