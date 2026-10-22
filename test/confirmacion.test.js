import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { DatosUsuarios } from "../Servidor/datos.js";
import { LogicaUsuarios } from "../Servidor/logica.js";
import { Confirmaciones, ConfirmacionesMemoria, hashConfirmacion } from "../Servidor/confirmaciones.js";
import { crearCorreo } from "../Servidor/correo.js";
import { crearAplicacion } from "../Servidor/api.js";
import { crearRegistroActividad } from "../Servidor/actividad.js";

function preparar() {
  const datos = new DatosUsuarios();
  let ahora = 10000000;
  const repositorio = new ConfirmacionesMemoria(datos, () => ahora);
  const correos = [], registros = [];
  const servicio = new Confirmaciones({
    repositorio, urlPublica: "https://cinematch.example",
    correo: { enviar: async correo => { correos.push(correo); } },
    registrarActividad: crearRegistroActividad({ escribir: linea => registros.push(JSON.parse(linea)) })
  });
  const logica = new LogicaUsuarios(datos);
  return { datos, repositorio, servicio, correos, registros, logica,
    avanzar: ms => { ahora += ms; },
    token: () => new URLSearchParams(new URL(correos.at(-1).enlace).hash.slice(1)).get("confirmar") };
}

test("Confirmación permite el login, conserva el rol y consume el enlace una vez", async () => {
  const p = preparar();
  const credenciales = { nombre: "Prueba", email: "prueba@example.com", password: "Una contraseña de prueba segura" };
  const usuario = await p.logica.registrar(credenciales);
  await assert.rejects(p.logica.autenticar(credenciales), { codigo: "CREDENCIALES_INVALIDAS" });
  assert.equal(await p.servicio.solicitar(" PRUEBA@example.com "), true);
  const token = p.token();
  assert.equal(p.repositorio.tokens.get(usuario.id).hash, hashConfirmacion(token));
  assert.equal(JSON.stringify([...p.repositorio.tokens]).includes(token), false);
  const resultados = await Promise.allSettled([p.servicio.confirmar(token), p.servicio.confirmar(token)]);
  assert.equal(resultados.filter(r => r.status === "fulfilled").length, 1);
  const activo = await p.logica.autenticar(credenciales);
  assert.equal(activo.id, usuario.id);
  assert.equal(activo.rol, "usuario");
  assert.equal(JSON.stringify(p.registros).includes(token), false);
});

test("Caducidad, token manipulado y cuenta eliminada no activan la cuenta", async () => {
  for (const caso of ["caducado", "manipulado", "eliminado"]) {
    const p = preparar();
    const u = await p.logica.alta({ nombre: "Prueba", email: "prueba@example.com" });
    await p.servicio.solicitar(u.email);
    let token = p.token();
    if (caso === "caducado") p.avanzar(86400000);
    if (caso === "manipulado") token = "0".repeat(64);
    if (caso === "eliminado") await p.logica.eliminar(u.id);
    await assert.rejects(p.servicio.confirmar(token), { codigo: "CONFIRMACION_INVALIDA" });
    assert.equal((await p.datos.buscarPorId(u.id)).confirmado, false);
  }
});

test("Reenvío invalida el anterior y aplica 60 segundos y cinco envíos por hora", async () => {
  const p = preparar();
  await p.logica.alta({ nombre: "Prueba", email: "prueba@example.com" });
  await p.servicio.solicitar("prueba@example.com");
  const antiguo = p.token();
  assert.equal(await p.servicio.solicitar("prueba@example.com"), false);
  for (let i = 1; i < 5; i++) {
    p.avanzar(60000);
    assert.equal(await p.servicio.solicitar("prueba@example.com"), true);
  }
  p.avanzar(60000);
  assert.equal(await p.servicio.solicitar("prueba@example.com"), false);
  await assert.rejects(p.servicio.confirmar(antiguo), { codigo: "CONFIRMACION_INVALIDA" });
  p.avanzar(3600000);
  assert.equal(await p.servicio.solicitar("prueba@example.com"), true);
  await p.servicio.confirmar(p.token());
});

test("Desconocidas, confirmadas y eliminadas no reciben mensajes", async () => {
  const p = preparar();
  const u = await p.logica.alta({ nombre: "Prueba", email: "prueba@example.com" });
  assert.equal(await p.servicio.solicitar("ausente@example.com"), false);
  await p.logica.confirmar(u.id);
  assert.equal(await p.servicio.solicitar(u.email), false);
  await p.logica.eliminar(u.id);
  assert.equal(await p.servicio.solicitar(u.email), false);
  assert.equal(p.correos.length, 0);
});

test("Cupo global limita envíos aunque se utilicen correos diferentes", async () => {
  const p = preparar();
  for (let i = 0; i < 101; i++) {
    const email = "u" + i + "@example.com";
    await p.logica.alta({ nombre: "Prueba", email });
    assert.equal(await p.servicio.solicitar(email), i < 100);
  }
  assert.equal(p.correos.length, 100);
});

test("Fallo SMTP mantiene la cuenta pendiente y no filtra credenciales en logs", async () => {
  const p = preparar();
  const u = await p.logica.alta({ nombre: "Prueba", email: "prueba@example.com" });
  p.servicio.correo.enviar = async () => { throw Object.assign(new Error("SECRETO token password"), { code: "EAUTH" }); };
  assert.equal(await p.servicio.solicitar(u.email), false);
  assert.equal((await p.datos.buscarPorId(u.id)).confirmado, false);
  assert.equal(p.registros.at(-1).codigo, "EAUTH");
  assert.equal(JSON.stringify(p.registros).includes("SECRETO"), false);
  p.avanzar(60000);
  p.servicio.correo.enviar = async c => p.correos.push(c);
  assert.equal(await p.servicio.solicitar(u.email), true);
});

test("Adaptador Gmail valida configuración, usa TLS y solo envía el enlace al destinatario", async () => {
  let opciones, mensaje;
  const env = { SMTP_USER: "emisor@gmail.com", SMTP_PASSWORD: "abcd efgh ijkl mnop", APP_URL: "http://localhost:3000" };
  const correo = crearCorreo(env, o => {
    opciones = o;
    return { sendMail: async m => { mensaje = m; return { accepted: ["destino@example.com"] }; } };
  });
  assert.equal(opciones.secure, true);
  assert.equal(opciones.port, 465);
  assert.equal(opciones.auth.pass, "abcdefghijklmnop");
  assert.equal(opciones.debug, false);
  await correo.enviar({ email: "destino@example.com", enlace: "http://localhost:3000/#confirmar=prueba" });
  assert.equal(mensaje.to.address, "destino@example.com");
  assert.equal(mensaje.from.address, env.SMTP_USER);
  assert.ok(mensaje.text.includes("#confirmar=prueba"));
  for (const cambios of [{ SMTP_PASSWORD: "" }, { APP_URL: "https://x.example/otra" },
    { APP_URL: "https://x.example/?token=1" }, { NODE_ENV: "production" }]) {
    assert.throws(() => crearCorreo({ ...env, ...cambios }), { code: "CONFIGURACION_CORREO_INVALIDA" });
  }
});

test("HTTP: registro y reenvío no exponen tokens; confirmar exige POST y protección", async t => {
  const p = preparar();
  const app = crearAplicacion({ datos: p.datos, confirmaciones: p.servicio, registrarActividad: () => {} });
  app.servidor.listen(0, "127.0.0.1");
  await once(app.servidor, "listening");
  t.after(() => new Promise(resolve => app.servidor.close(resolve)));
  const base = "http://127.0.0.1:" + app.servidor.address().port;
  const post = (ruta, cuerpo, proteccion = true) => fetch(base + ruta, {
    method: "POST", headers: { "Content-Type": "application/json", ...(proteccion ? { "X-CineMatch": "1" } : {}) },
    body: JSON.stringify(cuerpo)
  });
  const alta = await post("/api/registro", { nombre: "Prueba", email: "prueba@example.com", password: "Una contraseña segura de prueba" });
  assert.equal(alta.status, 201);
  const cuerpo = await alta.json();
  assert.equal(cuerpo.correoEnviado, true);
  assert.equal(cuerpo.usuario.confirmado, false);
  assert.equal(JSON.stringify(cuerpo).includes(p.token()), false);
  const token = p.token();
  const desconocida = await (await post("/api/confirmacion/reenviar", { email: "ausente@example.com" })).json();
  const limitada = await (await post("/api/confirmacion/reenviar", { email: cuerpo.usuario.email })).json();
  assert.deepEqual(desconocida, limitada);
  assert.equal((await fetch(base + "/api/confirmacion")).status, 405);
  assert.equal((await post("/api/confirmacion", { token }, false)).status, 403);
  assert.equal((await post("/api/confirmacion", { token: "mal" })).status, 400);
  assert.equal((await p.datos.buscarPorId(cuerpo.usuario.id)).confirmado, false);
  assert.equal((await post("/api/confirmacion", { token })).status, 200);
  assert.equal((await post("/api/confirmacion", { token })).status, 400);
  p.avanzar(60000);
  const activa = await (await post("/api/confirmacion/reenviar", { email: cuerpo.usuario.email })).json();
  assert.deepEqual(activa, desconocida);
});
