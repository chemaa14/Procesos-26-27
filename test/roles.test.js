import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { DatosUsuarios } from "../Servidor/datos.js";
import { LogicaUsuarios } from "../Servidor/logica.js";
import { crearAplicacion } from "../Servidor/api.js";
import { generarHash } from "../Servidor/passwords.js";

const PASSWORD = "Contraseña ficticia para probar roles";
const hash = await generarHash(PASSWORD);

async function escenario(comprobar) {
  const datos = new DatosUsuarios();
  const { servidor, logica } = crearAplicacion({ datos, cookieSegura: false });
  const cuentas = {};
  for (const [id, rol] of [["ana", "usuario"], ["otro", "usuario"], ["admin", "administrador"]]) {
    cuentas[id] = await datos.crearConHash({
      id, nombre: id, email: `${id}@example.com`, rol, confirmado: true, eliminado: false
    }, hash);
  }
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const pedir = (ruta, cookie = "", method = "GET", extra = {}) => fetch(`${base}${ruta}`, {
    method, headers: { Cookie: cookie, "X-CineMatch": "1", ...extra }
  });
  async function login(id) {
    const r = await fetch(`${base}/api/login`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-CineMatch": "1" },
      body: JSON.stringify({ email: cuentas[id].email, password: PASSWORD })
    });
    assert.equal(r.status, 200);
    await r.json();
    return r.headers.get("set-cookie").split(";")[0];
  }
  try { await comprobar({ datos, logica, cuentas, pedir, login, base }); }
  finally {
    servidor.closeAllConnections();
    await new Promise(resolve => servidor.close(resolve));
  }
}

test("registro público ignora el rol y el estado enviados por el cliente", async () => {
  await escenario(async ({ base }) => {
    const r = await fetch(`${base}/api/registro`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "Nueva", email: "nueva@example.com", password: PASSWORD,
        rol: "administrador", confirmado: true })
    });
    assert.equal(r.status, 201);
    const { usuario } = await r.json();
    assert.equal(usuario.rol, "usuario");
    assert.equal(usuario.confirmado, false);
    assert.equal("password_hash" in usuario, false);
  });
});

test("rutas protegidas: 401 sin sesión, 403 usuario y 200 administrador", async () => {
  await escenario(async ({ pedir, login }) => {
    const normal = await login("ana");
    const admin = await login("admin");
    for (const ruta of ["/api/usuarios", "/api/usuarios/otro/activo"]) {
      for (const [cookie, estado] of [["", 401], ["cinematch_sesion=inventada", 401], [normal, 403], [admin, 200]]) {
        const r = await pedir(ruta, cookie);
        assert.equal(r.status, estado);
        await r.json();
      }
    }
    const listado = await pedir("/api/usuarios", admin);
    const { usuarios } = await listado.json();
    assert.equal(usuarios.length, 3);
    assert.ok(usuarios.every(u => u.email && u.rol && typeof u.confirmado === "boolean"));
    assert.ok(usuarios.every(u => !("password_hash" in u)));
    // Un token del mecanismo antiguo no sustituye una sesión.
    assert.equal((await pedir("/api/usuarios", "", "GET", { Authorization: "Bearer antiguo-token" })).status, 401);
    assert.equal((await pedir("/api/usuarios", normal, "POST")).status, 403);
  });
});

test("DELETE por id: bloquea borrar otra cuenta y permite borrar la propia", async () => {
  await escenario(async ({ pedir, login, datos }) => {
    const cookie = await login("ana");
    const otraSesion = await login("ana");
    assert.equal((await pedir("/api/usuarios/otro", "", "DELETE")).status, 401);
    assert.equal((await pedir("/api/usuarios/otro", cookie, "DELETE")).status, 403);
    assert.equal((await datos.buscarPorId("otro")).eliminado, false);
    assert.equal((await pedir("/api/usuarios/ana", cookie, "DELETE", { "X-CineMatch": "" })).status, 403);
    const borrada = await pedir("/api/usuarios/ana", cookie, "DELETE");
    assert.equal(borrada.status, 204);
    assert.match(borrada.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal((await datos.buscarPorId("ana")).eliminado, true);
    for (const sesion of [cookie, otraSesion]) {
      assert.equal((await pedir("/api/sesion", sesion)).status, 401);
    }
  });
});

test("el administrador elimina otra cuenta con protección y mantiene su sesión", async () => {
  await escenario(async ({ pedir, login, datos }) => {
    const admin = await login("admin");
    const otro = await login("otro");
    assert.equal((await pedir("/api/usuarios/otro", admin, "DELETE", { "X-CineMatch": "" })).status, 403);
    assert.equal((await datos.buscarPorId("otro")).eliminado, false);
    assert.equal((await pedir("/api/usuarios/otro", admin, "DELETE")).status, 204);
    assert.equal((await pedir("/api/sesion", otro)).status, 401);
    assert.equal((await pedir("/api/sesion", admin)).status, 200);
    const listado = await pedir("/api/usuarios", admin);
    assert.ok((await listado.json()).usuarios.every(u => u.id !== "otro"));
    assert.deepEqual(await (await pedir("/api/usuarios/otro/activo", admin)).json(), { activo: false });
  });
});

test("el rol se comprueba de nuevo en cada petición, incluso con una sesión abierta", async () => {
  await escenario(async ({ pedir, login, datos, cuentas }) => {
    const cookie = await login("admin");
    await datos.guardar({ ...cuentas.admin, rol: "usuario" });
    assert.equal((await pedir("/api/usuarios", cookie)).status, 403);
    assert.equal((await pedir("/api/usuarios/otro", cookie, "DELETE")).status, 403);
    await datos.guardar({ ...cuentas.admin, eliminado: true });
    assert.equal((await pedir("/api/usuarios", cookie)).status, 401);
  });
});

test("la lógica aplica cuenta propia o administrador sin depender de HTTP", async () => {
  const datos = new DatosUsuarios();
  const logica = new LogicaUsuarios(datos);
  const ana = await logica.alta({ nombre: "Ana", email: "ana@example.com", rol: "administrador" });
  const otro = await logica.alta({ nombre: "Otro", email: "otro@example.com" });
  assert.equal(ana.rol, "usuario");
  await assert.rejects(logica.eliminarConPermisos(otro.id, ana.id), { codigo: "SESION_INVALIDA" });
  await logica.confirmar(ana.id);
  await assert.rejects(logica.eliminarConPermisos(otro.id, ana.id), { codigo: "PERMISO_DENEGADO" });
  await datos.guardar({ ...ana, confirmado: true, rol: "administrador" });
  await logica.eliminarConPermisos(otro.id, ana.id);
  assert.equal((await logica.obtener(otro.id)).eliminado, true);
});
