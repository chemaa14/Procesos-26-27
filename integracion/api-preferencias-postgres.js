import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { crearPool } from "../Servidor/conexion.js";
import { DatosUsuariosPostgres } from "../Servidor/datos-postgres.js";
import { SesionesPostgres } from "../Servidor/sesiones-postgres.js";
import { PreferenciasPlataformasPostgres } from "../Servidor/preferencias-plataformas-postgres.js";
import { crearAplicacion } from "../Servidor/api.js";
import { crearServicioPlataformas } from "../Servidor/plataformas-tmdb.js";
import { crearCatalogoTMDB } from "../Servidor/catalogo-tmdb.js";

// Solo el transporte del proveedor es simulado. HTTP, adaptador, sesión y SQL son reales.
const plataformas = crearServicioPlataformas(crearCatalogoTMDB(
  { TMDB_READ_ACCESS_TOKEN: "token-ficticio-integracion" },
  async () => new Response(JSON.stringify({ results: [
    { provider_id: 10, provider_name: "Proveedor de prueba" }
  ] }), { status: 200 })
));

test("API PostgreSQL: sesión local y Google verificada, persistencia entre servidores y aislamiento", async () => {
  const pools = [crearPool(), crearPool()];
  const servidores = [];
  const emails = [0, 1].map(() => `${randomUUID()}@example.invalid`);
  try {
    async function abrir(pool) {
      const sesiones = new SesionesPostgres(pool);
      const app = crearAplicacion({ datos: new DatosUsuariosPostgres(pool), sesiones,
        preferencias: new PreferenciasPlataformasPostgres(pool), plataformas,
        cookieSegura: false, registrarActividad: () => {} });
      servidores.push(app.servidor);
      app.servidor.listen(0, "127.0.0.1");
      await once(app.servidor, "listening");
      return { ...app, sesiones, base: `http://127.0.0.1:${app.servidor.address().port}` };
    }
    const a = await abrir(pools[0]);
    const password = "Frase ficticia para la prueba";
    const usuario = await a.logica.registrar({ nombre: "Prueba local", email: emails[0], password });
    await a.logica.confirmar(usuario.id);
    const login = await fetch(a.base + "/api/login", { method: "POST",
      headers: { "Content-Type": "application/json", "X-CineMatch": "1" },
      body: JSON.stringify({ email: emails[0], password }) });
    assert.equal(login.status, 200);
    await login.json();
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const put = await fetch(a.base + "/api/preferencias/plataformas", { method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json", "X-CineMatch": "1" },
      body: JSON.stringify({ plataformas: [10] }) });
    assert.equal(put.status, 200);
    assert.deepEqual(await put.json(), { region: "ES", plataformas: [10] });
    a.servidor.closeAllConnections();
    await new Promise(resolve => a.servidor.close(resolve));

    const b = await abrir(pools[1]);
    const lectura = await fetch(b.base + "/api/preferencias/plataformas", { headers: { Cookie: cookie } });
    assert.equal(lectura.status, 200);
    assert.deepEqual(await lectura.json(), { region: "ES", plataformas: [10] });
    // Perfil ficticio ya verificado; no se contacta con Google ni se prueba su pantalla de login.
    const google = await b.logica.autenticarGoogle({ sub: `prueba-${randomUUID()}`, email: emails[1],
      nombre: "Google de prueba", emailVerificado: true });
    const cookieGoogle = `cinematch_sesion=${await b.sesiones.crear(google.id)}`;
    const otra = await fetch(b.base + "/api/preferencias/plataformas", { headers: { Cookie: cookieGoogle } });
    assert.deepEqual(await otra.json(), { region: "ES", plataformas: [] });
    const ataque = await fetch(b.base + `/api/preferencias/plataformas?usuarioId=${usuario.id}`,
      { headers: { Cookie: cookieGoogle } });
    assert.equal(ataque.status, 400);
    await ataque.json();
    const logout = await fetch(b.base + "/api/logout", { method: "POST",
      headers: { Cookie: cookie, "X-CineMatch": "1" } });
    assert.equal(logout.status, 204);
    const revocada = await fetch(b.base + "/api/preferencias/plataformas", { headers: { Cookie: cookie } });
    assert.equal(revocada.status, 401);
    await revocada.json();
  } finally {
    for (const servidor of servidores) if (servidor.listening) {
      servidor.closeAllConnections();
      await new Promise(resolve => servidor.close(resolve));
    }
    try { await pools[0].query("DELETE FROM usuarios WHERE email=ANY($1::text[])", [emails]); }
    finally { await Promise.all(pools.map(pool => pool.end())); }
  }
});
