import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { crearAplicacion } from "../Servidor/api.js";
import { DatosUsuarios } from "../Servidor/datos.js";
import { LogicaUsuarios } from "../Servidor/logica.js";
import { IntentosOAuth } from "../Servidor/intentos-oauth.js";
import { crearGoogleOAuth } from "../Servidor/google-oauth.js";
import { crearRegistroActividad } from "../Servidor/actividad.js";

const perfil = { sub: "google-identidad-123", nombre: "Ana", email: "ana@gmail.com", emailVerificado: true };
const configuracion = {
  GOOGLE_CLIENT_ID: "cliente-prueba.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "secreto-ficticio",
  GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback"
};

test("Google crea una cuenta confirmada, sin contraseña y con rol usuario", async () => {
  const datos = new DatosUsuarios();
  const logica = new LogicaUsuarios(datos);
  const usuario = await logica.autenticarGoogle({ ...perfil, rol: "administrador" });
  assert.equal(usuario.confirmado, true);
  assert.equal(usuario.rol, "usuario");
  assert.equal(await datos.buscarHashPassword(usuario.id), null);
  assert.equal(Object.hasOwn(usuario, "google_sub"), false);
  assert.equal(await logica.estaActivo(usuario.id), true);
});

test("Google reutiliza el sub aunque cambie el correo y no duplica altas simultáneas", async () => {
  const datos = new DatosUsuarios();
  const logica = new LogicaUsuarios(datos);
  const usuarios = await Promise.all(Array.from({ length: 5 }, () => logica.autenticarGoogle(perfil)));
  assert.equal(new Set(usuarios.map(u => u.id)).size, 1);
  assert.equal((await logica.listar()).length, 1);
  const repetido = await logica.autenticarGoogle({ ...perfil, email: "otro@gmail.com" });
  assert.equal(repetido.id, usuarios[0].id);
});

test("Google no vincula ni confirma una cuenta local del mismo correo", async () => {
  const datos = new DatosUsuarios();
  const logica = new LogicaUsuarios(datos);
  const local = await logica.alta(perfil);
  await assert.rejects(logica.autenticarGoogle(perfil), { codigo: "OAUTH_CUENTA_EXISTENTE" });
  assert.equal((await logica.obtener(local.id)).confirmado, false);
  assert.equal(await datos.buscarPorGoogleSub(perfil.sub), null);
});

test("Google rechaza perfiles sin verificar y cuentas eliminadas sin reactivarlas", async () => {
  const logica = new LogicaUsuarios(new DatosUsuarios());
  await assert.rejects(logica.autenticarGoogle({ ...perfil, emailVerificado: false }), { codigo: "OAUTH_INVALIDO" });
  await assert.rejects(logica.autenticarGoogle({ ...perfil, sub: "" }), { codigo: "OAUTH_INVALIDO" });
  const usuario = await logica.autenticarGoogle(perfil);
  await logica.eliminar(usuario.id);
  await assert.rejects(logica.autenticarGoogle(perfil), { codigo: "OAUTH_INVALIDO" });
  assert.equal((await logica.obtener(usuario.id)).eliminado, true);
});

test("Intento OAuth exige el navegador original, caduca y solo puede consumirse una vez", async () => {
  let ahora = 0;
  const intentos = new IntentosOAuth({ reloj: () => ahora });
  const datos = { nonce: "nonce", verificador: "verificador" };
  await intentos.guardar("estado", "navegador", datos);
  assert.equal(await intentos.consumir("estado", "otro"), null);
  const resultados = await Promise.all([intentos.consumir("estado", "navegador"), intentos.consumir("estado", "navegador")]);
  assert.deepEqual(resultados, [datos, null]);
  await intentos.guardar("estado2", "navegador", datos);
  ahora = 600000;
  assert.equal(await intentos.consumir("estado2", "navegador"), null);
});

test("Configuración OAuth: desactivada, incompleta y URI inválida", () => {
  assert.equal(crearGoogleOAuth({}), null);
  assert.throws(() => crearGoogleOAuth({ GOOGLE_CLIENT_ID: "id" }), { code: "CONFIGURACION_INVALIDA" });
  assert.throws(() => crearGoogleOAuth({ ...configuracion, NODE_ENV: "production" }), { code: "CONFIGURACION_INVALIDA" });
  assert.throws(() => crearGoogleOAuth({ ...configuracion, GOOGLE_REDIRECT_URI: "https://example.com/otra" }), { code: "CONFIGURACION_INVALIDA" });
});

test("La URL de Google solicita identidad mínima, state, nonce y PKCE S256 sin secreto", () => {
  const google = crearGoogleOAuth(configuracion);
  const url = new URL(google.generarURL({ estado: "estado", nonce: "nonce", verificador: "verificador" }));
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("state"), "estado");
  assert.equal(url.searchParams.get("nonce"), "nonce");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update("verificador").digest("base64url"));
  assert.equal(url.href.includes(configuracion.GOOGLE_CLIENT_SECRET), false);
});

test("El adaptador verifica firma, audiencia, emisor, caducidad, nonce y correo del ID token", async t => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const ahora = Math.floor(Date.now() / 1000);
  const claims = { iss: "https://accounts.google.com", aud: configuracion.GOOGLE_CLIENT_ID,
    sub: perfil.sub, email: perfil.email, email_verified: true, name: perfil.nombre,
    nonce: "nonce", iat: ahora, exp: ahora + 3600 };
  function jwt(payload, clave = privateKey) {
    const contenido = [ { alg: "RS256", kid: "prueba" }, payload ].map(v => Buffer.from(JSON.stringify(v)).toString("base64url")).join(".");
    return `${contenido}.${sign("RSA-SHA256", Buffer.from(contenido), clave).toString("base64url")}`;
  }
  let token = jwt(claims);
  t.mock.method(OAuth2Client.prototype, "getToken", async opciones => {
    assert.equal(opciones.codeVerifier, "verificador");
    return { tokens: { id_token: token } };
  });
  t.mock.method(OAuth2Client.prototype, "getFederatedSignonCertsAsync", async () => ({
    certs: { prueba: publicKey.export({ type: "spki", format: "pem" }) }, format: "PEM"
  }));
  const google = crearGoogleOAuth(configuracion);
  const intento = { nonce: "nonce", verificador: "verificador" };
  assert.deepEqual(await google.verificar("codigo", intento), perfil);
  for (const cambio of [{ aud: "otro" }, { iss: "https://falso.example" }, { exp: ahora - 600 }, { nonce: "otro" }, { email_verified: false }]) {
    token = jwt({ ...claims, ...cambio });
    await assert.rejects(google.verificar("codigo", intento), { codigo: "OAUTH_INVALIDO" });
  }
  token = jwt(claims, generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey);
  await assert.rejects(google.verificar("codigo", intento), { codigo: "OAUTH_INVALIDO" });
});

async function conServidor(comprobar, opciones = {}) {
  let llamadas = 0;
  const google = {
    origen: "http://localhost:3000",
    generarURL: ({ estado }) => `https://accounts.google.com/o/oauth2/v2/auth?state=${estado}`,
    verificar: async () => { llamadas++; return perfil; }
  };
  const registros = [];
  const app = crearAplicacion({ google, cookieSegura: false,
    registrarActividad: crearRegistroActividad({ escribir: linea => registros.push(linea) }), ...opciones });
  app.servidor.listen(0, "127.0.0.1");
  await once(app.servidor, "listening");
  const base = `http://127.0.0.1:${app.servidor.address().port}`;
  const pedir = (ruta, opciones = {}) => fetch(base + ruta, { redirect: "manual", ...opciones });
  async function iniciar() {
    const res = await pedir("/api/auth/google", { method: "POST", headers: { "X-CineMatch": "1" } });
    assert.equal(res.status, 200);
    const url = new URL((await res.json()).url);
    return { estado: url.searchParams.get("state"), cookie: res.headers.getSetCookie()[0].split(";")[0], cabecera: res.headers.getSetCookie()[0] };
  }
  try { await comprobar({ ...app, pedir, iniciar, registros, llamadas: () => llamadas }); }
  finally { await new Promise(resolve => { app.servidor.close(resolve); app.servidor.closeAllConnections(); }); }
}
const callback = estado => `/api/auth/google/callback?state=${estado}&code=codigo-secreto-prueba`;

test("OAuth HTTP: exige POST, cabecera y origen válido; desactivado responde 503", async () => {
  await conServidor(async ({ pedir }) => {
    assert.equal((await pedir("/api/auth/google")).status, 405);
    assert.equal((await pedir("/api/auth/google", { method: "POST" })).status, 403);
    assert.equal((await pedir("/api/auth/google", { method: "POST", headers: { "X-CineMatch": "1", Origin: "https://ajeno.example" } })).status, 403);
  });
  await conServidor(async ({ pedir }) => {
    assert.equal((await pedir("/api/auth/google", { method: "POST", headers: { "X-CineMatch": "1" } })).status, 503);
  }, { google: null });
});

test("OAuth HTTP: crea sesión, restaura perfil y conserva permisos; cookie segura en producción", async () => {
  await conServidor(async ({ pedir, iniciar, registros }) => {
    const { estado, cookie, cabecera } = await iniciar();
    assert.match(cabecera, /HttpOnly/);
    assert.match(cabecera, /SameSite=Lax/);
    assert.match(cabecera, /Secure/);
    const res = await pedir(callback(estado), { headers: { Cookie: cookie } });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/?oauth=correcto");
    const cookies = res.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.match(cookies[0], /Max-Age=0/);
    assert.match(cookies[1], /Secure/);
    const sesion = cookies[1].split(";")[0];
    const perfil = await pedir("/api/sesion", { headers: { Cookie: sesion } });
    assert.equal(perfil.status, 200);
    assert.equal((await perfil.json()).usuario.rol, "usuario");
    assert.equal((await pedir("/api/usuarios", { headers: { Cookie: sesion } })).status, 403);
    assert.equal((await pedir("/api/logout", { method: "POST", headers: { Cookie: sesion, "X-CineMatch": "1" } })).status, 204);
    assert.equal((await pedir("/api/sesion", { headers: { Cookie: sesion } })).status, 401);
    const logs = registros.join("\n");
    for (const secreto of [estado, cookie.split("=")[1], sesion.split("=")[1], "codigo-secreto-prueba", "ana@gmail.com"]) assert.equal(logs.includes(secreto), false);
  }, { cookieSegura: true });
});

test("OAuth HTTP: rechaza state incorrecto, cookies ausentes y reutilización sin consultar Google", async () => {
  await conServidor(async ({ pedir, iniciar, llamadas }) => {
    const { estado, cookie } = await iniciar();
    const sinCookie = await pedir(callback(estado));
    assert.equal(sinCookie.headers.get("location"), "/?oauth=error");
    const incorrecto = await pedir(callback("a".repeat(64)), { headers: { Cookie: cookie } });
    assert.equal(incorrecto.headers.get("location"), "/?oauth=error");
    assert.equal(llamadas(), 0);
    const valido = await pedir(callback(estado), { headers: { Cookie: cookie } });
    assert.equal(valido.headers.get("location"), "/?oauth=correcto");
    const repetido = await pedir(callback(estado), { headers: { Cookie: cookie } });
    assert.equal(repetido.headers.get("location"), "/?oauth=error");
    assert.equal(llamadas(), 1);
  });
});

test("OAuth HTTP: cancelación consume el intento y muestra un resultado conocido", async () => {
  await conServidor(async ({ pedir, iniciar, llamadas }) => {
    const { estado, cookie } = await iniciar();
    const cancelado = await pedir(`/api/auth/google/callback?state=${estado}&error=access_denied`, { headers: { Cookie: cookie } });
    assert.equal(cancelado.headers.get("location"), "/?oauth=cancelado");
    assert.equal((await pedir(callback(estado), { headers: { Cookie: cookie } })).headers.get("location"), "/?oauth=error");
    assert.equal(llamadas(), 0);
  });
});

test("OAuth HTTP: conflicto local y fallo del proveedor no crean sesión ni filtran detalles", async () => {
  await conServidor(async ({ logica, pedir, iniciar }) => {
    await logica.alta(perfil);
    const { estado, cookie } = await iniciar();
    const res = await pedir(callback(estado), { headers: { Cookie: cookie } });
    assert.equal(res.headers.get("location"), "/?oauth=cuenta_existente");
    assert.equal(res.headers.getSetCookie().length, 1);
  });
  await conServidor(async ({ pedir, iniciar, registros }) => {
    const { estado, cookie } = await iniciar();
    const res = await pedir(callback(estado), { headers: { Cookie: cookie } });
    assert.equal(res.headers.get("location"), "/?oauth=error");
    assert.equal(registros.join("").includes("SECRETO-PROVEEDOR"), false);
  }, { google: { generarURL: ({ estado }) => `https://accounts.google.com/?state=${estado}`, verificar: async () => { throw new Error("SECRETO-PROVEEDOR"); } } });
});
