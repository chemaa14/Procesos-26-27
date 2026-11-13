import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { crearAplicacion } from "../Servidor/api.js";
import { DatosUsuarios } from "../Servidor/datos.js";
import { Sesiones } from "../Servidor/sesiones.js";
import { crearServicioPlataformas } from "../Servidor/plataformas-tmdb.js";
import { ErrorCatalogoTMDB } from "../Servidor/catalogo-tmdb.js";
import { crearRegistroActividad } from "../Servidor/actividad.js";

const ruta = "/api/preferencias/plataformas";
const privado = "secreto-ficticio-no-divulgar";

async function conAPI(comprobar, opciones = {}) {
  const datos = new DatosUsuarios();
  const sesiones = new Sesiones();
  const control = { llamadas: 0, error: null };
  const plataformas = crearServicioPlataformas({ async consultar() {
    control.llamadas++;
    if (control.error) throw control.error;
    return { results: [10, 20].map(id => ({ provider_id: id, provider_name: `Proveedor ${id}` })) };
  } });
  const registros = [];
  const app = crearAplicacion({ datos, sesiones, plataformas, cookieSegura: false,
    registrarActividad: crearRegistroActividad({ escribir: linea => registros.push(linea) }), ...opciones });
  async function cuenta({ confirmado = true, eliminado = false, rol = "usuario" } = {}) {
    const id = randomUUID();
    await datos.guardar({ id, nombre: "Prueba", email: `${id}@example.invalid`, confirmado, eliminado, rol });
    const token = await sesiones.crear(id);
    return { id, cookie: `cinematch_sesion=${token}` };
  }
  try {
    app.servidor.listen(0, "127.0.0.1");
    await once(app.servidor, "listening");
    const base = `http://127.0.0.1:${app.servidor.address().port}`;
    async function pedir(path, cookie, { metodo = "GET", cuerpo, headers = {}, bruto } = {}) {
      const respuesta = await fetch(base + path, {
        method: metodo,
        headers: { ...(cookie ? { Cookie: cookie } : {}),
          ...(metodo === "PUT" ? { "X-CineMatch": "1", "Content-Type": "application/json" } : {}), ...headers },
        ...(cuerpo !== undefined || bruto !== undefined ? { body: bruto ?? JSON.stringify(cuerpo) } : {})
      });
      const texto = await respuesta.text();
      assert.equal(texto.includes(privado), false);
      assert.equal(respuesta.headers.get("cache-control"), "no-store");
      return { estado: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null,
        allow: respuesta.headers.get("allow") };
    }
    await comprobar({ cuenta, pedir, datos, control, registros, sesiones });
  } finally {
    if (app.servidor.listening) {
      app.servidor.closeAllConnections();
      await new Promise(resolve => app.servidor.close(resolve));
    }
  }
}

test("API preferencias: requiere cuenta confirmada activa antes de consultar TMDB", async () => {
  await conAPI(async ({ cuenta, pedir, control }) => {
    for (const cookie of [null, "cinematch_sesion=invalida",
      (await cuenta({ confirmado: false })).cookie, (await cuenta({ eliminado: true })).cookie]) {
      for (const path of [ruta, "/api/plataformas"]) assert.equal((await pedir(path, cookie)).estado, 401);
      assert.equal((await pedir(ruta, cookie, { metodo: "PUT", cuerpo: { plataformas: [10] } })).estado, 401);
    }
    assert.equal(control.llamadas, 0);
  });
});

test("API preferencias: métodos y cabecera Allow", async () => {
  await conAPI(async ({ pedir }) => {
    for (const metodo of ["POST", "DELETE", "PATCH"]) {
      const respuesta = await pedir(ruta, null, { metodo });
      assert.equal(respuesta.estado, 405);
      assert.equal(respuesta.allow, "GET, PUT");
    }
    const catalogo = await pedir("/api/plataformas", null, { metodo: "PUT" });
    assert.equal(catalogo.estado, 405);
    assert.equal(catalogo.allow, "GET");
  });
});

test("API preferencias: guardar, recuperar, vaciar, aislar administrador y revocar sesión", async () => {
  await conAPI(async ({ cuenta, pedir, sesiones }) => {
    const a = await cuenta(), b = await cuenta({ rol: "administrador" });
    assert.deepEqual((await pedir("/api/plataformas", a.cookie)).cuerpo,
      { region: "ES", plataformas: [10, 20].map(id => ({ id, nombre: `Proveedor ${id}`, logo: null })) });
    assert.deepEqual((await pedir(ruta, a.cookie)).cuerpo, { region: "ES", plataformas: [] });
    const guardado = await pedir(ruta, a.cookie, { metodo: "PUT", cuerpo: { plataformas: [20, 10, 20] } });
    assert.equal(guardado.estado, 200);
    assert.deepEqual(guardado.cuerpo, { region: "ES", plataformas: [10, 20] });
    const nuevaCookie = `cinematch_sesion=${await sesiones.crear(a.id)}`;
    assert.deepEqual((await pedir(ruta, nuevaCookie)).cuerpo, guardado.cuerpo);
    assert.deepEqual((await pedir(ruta, b.cookie)).cuerpo, { region: "ES", plataformas: [] });
    assert.equal((await pedir(`${ruta}?usuarioId=${a.id}`, b.cookie)).estado, 400);
    assert.equal((await pedir(ruta, b.cookie, { metodo: "PUT", cuerpo: { usuarioId: a.id, plataformas: [] } })).estado, 400);
    assert.deepEqual((await pedir(ruta, a.cookie)).cuerpo, guardado.cuerpo);
    assert.equal((await pedir(ruta, a.cookie, { metodo: "PUT", cuerpo: { plataformas: [] } })).estado, 200);
    assert.deepEqual((await pedir(ruta, a.cookie)).cuerpo.plataformas, []);
    assert.equal((await pedir("/api/logout", a.cookie, { metodo: "POST", headers: { "X-CineMatch": "1" } })).estado, 204);
    assert.equal((await pedir(ruta, a.cookie)).estado, 401);
  });
});

test("API preferencias: rechaza entradas, queries e IDs ajenos sin perder datos", async () => {
  await conAPI(async ({ cuenta, pedir, control }) => {
    const { cookie } = await cuenta();
    await pedir(ruta, cookie, { metodo: "PUT", cuerpo: { plataformas: [10] } });
    const llamadas = control.llamadas;
    for (const cuerpo of [{}, [], null, { plataformas: "10" }, { plataformas: ["10"] },
      { plataformas: [0] }, { plataformas: [-1] }, { plataformas: [1.5] },
      { plataformas: [2147483648] }, { plataformas: [null] },
      { plataformas: Array(101).fill(10) }, { plataformas: [], region: "FR" }]) {
      assert.equal((await pedir(ruta, cookie, { metodo: "PUT", cuerpo })).estado, 400);
    }
    for (const path of [`${ruta}?region=ES`, "/api/plataformas?region=FR"]) {
      assert.equal((await pedir(path, cookie)).estado, 400);
    }
    assert.equal(control.llamadas, llamadas);
    const ajena = await pedir(ruta, cookie, { metodo: "PUT", cuerpo: { plataformas: [99] } });
    assert.equal(ajena.estado, 400);
    assert.equal(ajena.cuerpo.codigo, "PLATAFORMA_NO_ADMITIDA");
    assert.deepEqual((await pedir(ruta, cookie)).cuerpo.plataformas, [10]);
  });
});

test("API preferencias: exige protección de escritura, JSON válido y límite de cuerpo", async () => {
  await conAPI(async ({ cuenta, pedir, control }) => {
    const { cookie } = await cuenta();
    assert.equal((await pedir(ruta, cookie, { metodo: "PUT", cuerpo: { plataformas: [] }, headers: { "X-CineMatch": "0" } })).estado, 403);
    assert.equal((await pedir(ruta, cookie, { metodo: "PUT", cuerpo: {}, headers: { "Content-Type": "text/plain" } })).estado, 415);
    assert.equal((await pedir(ruta, cookie, { metodo: "PUT", bruto: "{" })).estado, 400);
    assert.equal((await pedir(ruta, cookie, { metodo: "PUT", bruto: JSON.stringify({ plataformas: [], exceso: "x".repeat(17000) }) })).estado, 413);
    assert.equal(control.llamadas, 0);
  });
});

test("API preferencias: lectura y vaciado sin TMDB, catálogo y guardado no vacío devuelven 503", async () => {
  await conAPI(async ({ cuenta, pedir }) => {
    const { cookie } = await cuenta();
    assert.equal((await pedir(ruta, cookie)).estado, 200);
    assert.equal((await pedir(ruta, cookie, { metodo: "PUT", cuerpo: { plataformas: [] } })).estado, 200);
    assert.equal((await pedir("/api/plataformas", cookie)).estado, 503);
    assert.equal((await pedir(ruta, cookie, { metodo: "PUT", cuerpo: { plataformas: [10] } })).estado, 503);
  }, { plataformas: null });
});

test("API preferencias: fallos de proveedor seguros conservan selección y permiten recuperación", async () => {
  await conAPI(async ({ cuenta, pedir, control, registros }) => {
    const { cookie } = await cuenta();
    await pedir(ruta, cookie, { metodo: "PUT", cuerpo: { plataformas: [10] } });
    for (const [codigo, estado] of [["TMDB_TIMEOUT", 504], ["TMDB_LIMITE", 503], ["TMDB_RED", 502], ["TMDB_RESPUESTA_INVALIDA", 502]]) {
      control.error = new ErrorCatalogoTMDB(codigo);
      assert.equal((await pedir(ruta, cookie, { metodo: "PUT", cuerpo: { plataformas: [20] } })).estado, estado);
      assert.deepEqual((await pedir(ruta, cookie)).cuerpo.plataformas, [10]);
    }
    control.error = null;
    assert.equal((await pedir(ruta, cookie, { metodo: "PUT", cuerpo: { plataformas: [20] } })).estado, 200);
    assert.deepEqual((await pedir(ruta, cookie)).cuerpo.plataformas, [20]);
    assert.ok(registros.some(linea => JSON.parse(linea).ruta === ruta));
    assert.equal(registros.join("").includes(privado), false);
  });
});

test("API preferencias: un fallo desconocido del repositorio es 500 genérico", async () => {
  await conAPI(async ({ cuenta, pedir }) => {
    const { cookie } = await cuenta();
    for (const opciones of [{}, { metodo: "PUT", cuerpo: { plataformas: [] } }]) {
      const respuesta = await pedir(ruta, cookie, opciones);
      assert.equal(respuesta.estado, 500);
      assert.deepEqual(respuesta.cuerpo, { error: "Error interno del servidor." });
    }
  }, { preferencias: {
    async obtener() { throw new Error(privado); }, async guardar() { throw new Error(privado); }
  } });
});
