import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { crearRegistroActividad, rutaParaRegistro } from "../Servidor/actividad.js";
import { crearAplicacion } from "../Servidor/api.js";
import { DatosUsuarios } from "../Servidor/datos.js";

const PASSWORD = "Contraseña ficticia de logs que nunca debe salir";
const MARCADOR = "SECRETO_QUE_NO_DEBE_APARECER";

async function conServidor(comprobar, opciones = {}) {
  const lineas = [];
  const datos = opciones.datos ?? new DatosUsuarios();
  const registrarActividad = opciones.registrarActividad ?? crearRegistroActividad({ escribir: linea => lineas.push(linea) });
  const { servidor, logica } = crearAplicacion({ datos, registrarActividad, cookieSegura: false });
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const registros = () => lineas.map(linea => JSON.parse(linea));
  async function pedir(ruta, { method = "GET", cookie = "", body, headers = {} } = {}) {
    const r = await fetch(`${base}${ruta}`, {
      method,
      headers: { Cookie: cookie, "X-CineMatch": "1", "Content-Type": "application/json", ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    const texto = await r.text();
    return { estado: r.status, cookie: r.headers.get("set-cookie")?.split(";")[0],
      solicitudId: r.headers.get("x-request-id"), cuerpo: texto ? JSON.parse(texto) : null };
  }
  try { await comprobar({ pedir, registros, lineas, datos, logica }); }
  finally { servidor.closeAllConnections(); await new Promise(resolve => servidor.close(resolve)); }
}

test("los logs usan JSON y una lista cerrada de campos, mensajes y códigos", () => {
  const lineas = [];
  const registrar = crearRegistroActividad({ escribir: linea => lineas.push(linea), reloj: () => new Date("2026-10-11T10:00:00Z") });
  const solicitudId = randomUUID();
  const datos = { solicitudId, ruta: "/api/login", metodo: "POST", estado: 401, duracionMs: 12.345,
    password: MARCADOR, cookie: MARCADOR, token: MARCADOR, headers: { Authorization: MARCADOR },
    error: new Error(MARCADOR), message: MARCADOR, codigo: MARCADOR, usuarioId: MARCADOR,
    nombre: MARCADOR, email: MARCADOR, SQL: MARCADOR };
  datos.circular = datos;
  registrar("login_rechazado", datos);
  registrar(MARCADOR, datos);
  assert.equal(lineas.length, 1);
  assert.equal(lineas[0].includes(MARCADOR), false);
  assert.deepEqual(JSON.parse(lineas[0]), {
    time: "2026-10-11T10:00:00.000Z", severity: "WARNING", evento: "login_rechazado",
    message: "Inicio de sesión rechazado.", estado: 401, ruta: "/api/login", metodo: "POST",
    solicitudId, duracionMs: 12.35
  });
  assert.equal(rutaParaRegistro(`/api/usuarios/${MARCADOR}/activo`), "/api/usuarios/:id/activo");
  assert.equal(rutaParaRegistro(`/api/usuarios/${MARCADOR}`), "/api/usuarios/:id");
  assert.equal(rutaParaRegistro(`/desconocida/${MARCADOR}`), "otra");
});

test("registro, login, logout y borrado generan eventos sin credenciales ni datos personales", async () => {
  await conServidor(async ({ pedir, registros, lineas, logica, datos }) => {
    const alta = await pedir("/api/registro", { method: "POST", body: {
      nombre: MARCADOR, email: "privado-logs@example.com", password: PASSWORD
    } });
    assert.equal(alta.estado, 201);
    const id = alta.cuerpo.usuario.id;
    await logica.confirmar(id);
    const hash = await datos.buscarHashPassword(id);
    const login = await pedir("/api/login", { method: "POST", body: { email: "privado-logs@example.com", password: PASSWORD } });
    assert.equal(login.estado, 200);
    assert.equal((await pedir("/api/logout", { method: "POST", cookie: login.cookie })).estado, 204);
    const segundoLogin = await pedir("/api/login", { method: "POST", body: { email: "privado-logs@example.com", password: PASSWORD } });
    assert.equal((await pedir("/api/perfil", { method: "DELETE", cookie: segundoLogin.cookie })).estado, 204);
    assert.deepEqual(registros().map(r => r.evento), ["usuario_registrado", "login_correcto", "logout", "login_correcto", "usuario_eliminado"]);
    assert.equal(registros()[0].objetivoId, id);
    assert.equal(registros().at(-1).usuarioId, id);
    assert.equal(registros().at(-1).objetivoId, id);
    assert.ok(registros().every(r => r.severity === "INFO" && r.duracionMs >= 0));
    assert.equal(new Set(registros().map(r => r.solicitudId)).size, 5);
    assert.equal(registros()[1].solicitudId, login.solicitudId);
    for (const secreto of [MARCADOR, PASSWORD, "privado-logs@example.com", hash,
      login.cookie.split("=")[1], segundoLogin.cookie.split("=")[1]]) {
      assert.equal(lineas.join("\n").includes(secreto), false);
    }
  });
});

test("rechazos 401/403 y errores de entrada quedan registrados sin URL ni cabeceras sensibles", async () => {
  await conServidor(async ({ pedir, registros, lineas, logica }) => {
    const usuario = await logica.registrar({ nombre: "Ana", email: "ana-logs@example.com", password: PASSWORD });
    await logica.confirmar(usuario.id);
    const rechazado = await pedir(`/api/login?token=${MARCADOR}`, { method: "POST",
      headers: { Authorization: `Bearer ${MARCADOR}`, "X-Request-Id": MARCADOR, Cookie: `cinematch_sesion=${MARCADOR}` },
      body: { email: "ana-logs@example.com", password: MARCADOR } });
    assert.equal(rechazado.estado, 401);
    const login = await pedir("/api/login", { method: "POST", body: { email: "ana-logs@example.com", password: PASSWORD } });
    assert.equal((await pedir("/api/usuarios", { cookie: login.cookie })).estado, 403);
    assert.equal((await pedir(`/api/usuarios/${MARCADOR}/activo`)).estado, 401);
    assert.equal((await pedir(`/desconocida/${MARCADOR}?password=${MARCADOR}`)).estado, 404);
    assert.equal((await pedir("/api/registro", { method: "POST", body: { password: "corta" } })).estado, 400);
    assert.equal(lineas.join("\n").includes(MARCADOR), false);
    assert.equal(registros()[0].evento, "login_rechazado");
    assert.equal(registros()[0].codigo, "CREDENCIALES_INVALIDAS");
    assert.equal(registros()[2].evento, "acceso_denegado");
    assert.equal(registros()[3].ruta, "/api/usuarios/:id/activo");
    assert.equal(registros()[4].ruta, "otra");
    assert.equal(registros()[5].codigo, "PASSWORD_INVALIDA");
    assert.ok(registros().filter(r => r.estado >= 400).every(r => r.severity === "WARNING"));
  });
});

test("el log administrativo identifica actor y objetivo sin copiar la cuenta", async () => {
  await conServidor(async ({ pedir, registros, datos, logica }) => {
    const admin = await logica.registrar({ nombre: "Admin", email: "admin-logs@example.com", password: PASSWORD });
    await datos.guardar({ ...admin, confirmado: true, rol: "administrador" });
    const otro = await logica.alta({ nombre: "Otro", email: "otro-logs@example.com" });
    const login = await pedir("/api/login", { method: "POST", body: { email: admin.email, password: PASSWORD } });
    assert.equal((await pedir("/api/usuarios", { cookie: login.cookie })).estado, 200);
    assert.equal((await pedir(`/api/usuarios/${otro.id}/activo`, { cookie: login.cookie })).estado, 200);
    assert.equal((await pedir(`/api/usuarios/${otro.id}`, { method: "DELETE", cookie: login.cookie })).estado, 204);
    assert.equal(registros()[1].evento, "usuarios_listados");
    assert.equal(registros()[2].evento, "estado_consultado");
    const borrado = registros().at(-1);
    assert.equal(borrado.evento, "usuario_eliminado");
    assert.equal(borrado.usuarioId, admin.id);
    assert.equal(borrado.objetivoId, otro.id);
    assert.equal(borrado.ruta, "/api/usuarios/:id");
  });
});

test("un fallo de base de datos genera ERROR con código seguro, sin mensaje ni stack del error", async () => {
  const datos = new DatosUsuarios();
  datos.buscarPorEmail = async () => { throw Object.assign(new Error(`SQL password=${MARCADOR}`), { code: "ECONNREFUSED", detail: MARCADOR }); };
  await conServidor(async ({ pedir, registros, lineas }) => {
    const r = await pedir("/api/login", { method: "POST", body: { email: "a@example.com", password: PASSWORD } });
    assert.equal(r.estado, 500);
    assert.equal(registros().length, 1);
    assert.equal(registros()[0].severity, "ERROR");
    assert.equal(registros()[0].evento, "error_interno");
    assert.equal(registros()[0].codigo, "ECONNREFUSED");
    assert.equal(lineas.join("\n").includes(MARCADOR), false);
    assert.deepEqual(r.cuerpo, { error: "Error interno del servidor." });
  }, { datos });
});

test("un destino de logs que falla no rompe la API", async () => {
  const registrarActividad = () => { throw new Error("Fallo del destino de logs"); };
  await conServidor(async ({ pedir }) => {
    assert.equal((await pedir("/api/health")).estado, 200);
    assert.equal((await pedir("/api/health")).estado, 200);
  }, { registrarActividad });
  assert.doesNotThrow(() => crearRegistroActividad({ escribir: registrarActividad })("error_interno"));
});

test("el fallo de configuración al arrancar produce JSON seguro y salida de error", () => {
  const env = { ...process.env, DB_HOST: "", DB_PASSWORD: MARCADOR };
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("../Servidor/inicio-postgres.js", import.meta.url))],
    { env, encoding: "utf8", timeout: 10000 });
  assert.equal(r.status, 1);
  const registro = JSON.parse(r.stdout.trim());
  assert.equal(registro.evento, "error_inicio");
  assert.equal(registro.codigo, "CONFIGURACION_INVALIDA");
  assert.equal(registro.severity, "ERROR");
  assert.equal(`${r.stdout}${r.stderr}`.includes(MARCADOR), false);
});
