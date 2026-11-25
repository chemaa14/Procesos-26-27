import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";

import { crearAplicacion } from "../Servidor/api.js";
import { DatosUsuarios } from "../Servidor/datos.js";
import { Sesiones } from "../Servidor/sesiones.js";
import { crearServicioSugerencia, MENSAJE_SIN_PLATAFORMAS } from "../Servidor/sugerencia-pelicula.js";
import { ErrorCatalogoTMDB } from "../Servidor/catalogo-tmdb.js";
import { crearRegistroActividad } from "../Servidor/actividad.js";

const privado = "token-ficticio-no-divulgar api.themoviedb.org";

async function conAPI(comprobar, { sinSugerencias = false } = {}) {
  const datos = new DatosUsuarios();
  const sesiones = new Sesiones();
  const plataformasPorUsuario = new Map();
  const control = { llamadas: 0, error: null };
  const adaptador = {
    async consultar(ruta, parametros) {
      control.llamadas += 1;
      control.ruta = ruta;
      control.parametros = parametros;
      if (control.error) throw control.error;
      if (ruta === "/genre/movie/list") return { genres: [{ id: 35, name: "Comedia" }] };
      return {
        page: parametros.page,
        total_pages: 1,
        total_results: 1,
        results: [{ id: 550, title: "El club de la lucha", release_date: "1999-10-15", poster_path: null, vote_average: 8.4 }]
      };
    }
  };
  const preferencias = {
    async obtener(usuarioId) {
      return { region: "ES", plataformas: plataformasPorUsuario.get(usuarioId) ?? [] };
    }
  };
  const registros = [];
  const app = crearAplicacion({
    datos,
    sesiones,
    preferencias,
    sugerencias: sinSugerencias ? null : crearServicioSugerencia(adaptador, preferencias, { azar: () => 0 }),
    cookieSegura: false,
    registrarActividad: crearRegistroActividad({ escribir: linea => registros.push(linea) })
  });

  async function cuenta({ confirmado = true, plataformas = [] } = {}) {
    const id = randomUUID();
    await datos.guardar({ id, nombre: "Prueba", email: `${id}@example.invalid`, confirmado, eliminado: false, rol: "usuario" });
    plataformasPorUsuario.set(id, plataformas);
    const token = await sesiones.crear(id);
    return { id, cookie: `cinematch_sesion=${token}` };
  }

  try {
    app.servidor.listen(0, "127.0.0.1");
    await once(app.servidor, "listening");
    const base = `http://127.0.0.1:${app.servidor.address().port}`;

    async function pedir(ruta, cookie, { metodo = "GET" } = {}) {
      const respuesta = await fetch(`${base}${ruta}`, {
        method: metodo,
        headers: cookie ? { Cookie: cookie } : {}
      });
      const texto = await respuesta.text();
      assert.equal(texto.includes(privado), false);
      return { estado: respuesta.status, allow: respuesta.headers.get("allow"), cuerpo: texto ? JSON.parse(texto) : null };
    }

    await comprobar({ cuenta, pedir, control, registros });
  } finally {
    if (app.servidor.listening) {
      app.servidor.closeAllConnections();
      await new Promise(resolve => app.servidor.close(resolve));
    }
  }
}

test("API sugerencia: exige sesión antes de consultar TMDB", async () => {
  await conAPI(async ({ pedir, cuenta, control }) => {
    assert.equal((await pedir("/api/sugerencia")).estado, 401);
    assert.equal((await pedir("/api/generos")).estado, 401);
    const pendiente = await cuenta({ confirmado: false, plataformas: [8] });
    assert.equal((await pedir("/api/sugerencia", pendiente.cookie)).estado, 401);
    assert.equal(control.llamadas, 0);
  });
});

test("API sugerencia: usa las plataformas de la sesión y devuelve una película", async () => {
  await conAPI(async ({ pedir, cuenta, control, registros }) => {
    const ana = await cuenta({ plataformas: [8, 337] });
    const respuesta = await pedir("/api/sugerencia?genero=18&duracionMaxima=150&valoracionMinima=7", ana.cookie);

    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cuerpo.pelicula.id, 550);
    assert.equal(respuesta.cuerpo.pelicula.titulo, "El club de la lucha");
    assert.equal(control.ruta, "/discover/movie");
    assert.equal(control.parametros.with_watch_providers, "8|337");
    assert.equal(control.parametros.with_genres, "18");
    assert.equal(control.parametros["with_runtime.lte"], 150);
    assert.equal(control.parametros["vote_average.gte"], 7);
    assert.ok(registros.some(linea => JSON.parse(linea).ruta === "/api/sugerencia"));
  });
});

test("API sugerencia: sin plataformas responde 200 con un mensaje y sin consultar TMDB", async () => {
  await conAPI(async ({ pedir, cuenta, control }) => {
    const ana = await cuenta({ plataformas: [] });
    const respuesta = await pedir("/api/sugerencia", ana.cookie);
    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cuerpo.pelicula, null);
    assert.equal(respuesta.cuerpo.mensaje, MENSAJE_SIN_PLATAFORMAS);
    assert.equal(control.llamadas, 0);
  });
});

test("API sugerencia: rechaza filtros no válidos, repetidos o desconocidos con 400", async () => {
  await conAPI(async ({ pedir, cuenta, control }) => {
    const ana = await cuenta({ plataformas: [8] });
    for (const consulta of [
      "?duracionMaxima=10",
      "?valoracionMinima=11",
      "?genero=drama",
      "?genero=18&genero=28",
      "?usuario=otro"
    ]) {
      const respuesta = await pedir(`/api/sugerencia${consulta}`, ana.cookie);
      assert.equal(respuesta.estado, 400, consulta);
      assert.equal(respuesta.cuerpo.codigo, "SUGERENCIA_INVALIDA");
    }
    assert.equal((await pedir("/api/generos?x=1", ana.cookie)).estado, 400);
    assert.equal(control.llamadas, 0);
  });
});

test("API sugerencia: solo admite GET", async () => {
  await conAPI(async ({ pedir, cuenta }) => {
    const ana = await cuenta({ plataformas: [8] });
    const respuesta = await pedir("/api/sugerencia", ana.cookie, { metodo: "POST" });
    assert.equal(respuesta.estado, 405);
    assert.equal(respuesta.allow, "GET");
  });
});

test("API sugerencia: lista los géneros", async () => {
  await conAPI(async ({ pedir, cuenta }) => {
    const ana = await cuenta();
    const respuesta = await pedir("/api/generos", ana.cookie);
    assert.equal(respuesta.estado, 200);
    assert.deepEqual(respuesta.cuerpo, { generos: [{ id: 35, nombre: "Comedia" }] });
  });
});

test("API sugerencia: los fallos de TMDB no exponen detalles internos", async () => {
  await conAPI(async ({ pedir, cuenta, control }) => {
    const ana = await cuenta({ plataformas: [8] });
    control.error = new ErrorCatalogoTMDB("TMDB_TIMEOUT");
    const respuesta = await pedir("/api/sugerencia", ana.cookie);
    assert.equal(respuesta.estado, 504);
    assert.equal(respuesta.cuerpo.codigo, "CATALOGO_TIMEOUT");
  });
});

test("API sugerencia: sin TMDB configurado responde 503", async () => {
  await conAPI(async ({ pedir, cuenta }) => {
    const ana = await cuenta({ plataformas: [8] });
    const respuesta = await pedir("/api/sugerencia", ana.cookie);
    assert.equal(respuesta.estado, 503);
    assert.equal(respuesta.cuerpo.codigo, "CATALOGO_NO_CONFIGURADO");
  }, { sinSugerencias: true });
});
