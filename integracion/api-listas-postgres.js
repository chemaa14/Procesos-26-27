import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";

import { crearPool } from "../Servidor/conexion.js";
import { DatosUsuariosPostgres } from "../Servidor/datos-postgres.js";
import { SesionesPostgres } from "../Servidor/sesiones-postgres.js";
import { PreferenciasPlataformasPostgres } from "../Servidor/preferencias-plataformas-postgres.js";
import { ListasPeliculasPostgres } from "../Servidor/listas-peliculas-postgres.js";
import { crearAplicacion } from "../Servidor/api.js";
import { crearCatalogoTMDB } from "../Servidor/catalogo-tmdb.js";
import { crearServicioPlataformas } from "../Servidor/plataformas-tmdb.js";
import { crearServicioDisponibilidad } from "../Servidor/disponibilidad-pelicula.js";

const PASSWORD = "Frase ficticia para listas PostgreSQL";
const TOKEN = "token-ficticio-listas-postgres";
const CONSULTADO_EN = "2026-11-24T12:00:00.000Z";
const PELICULA_A = 603;
const PELICULA_B = 550;

function respuestaJSON(cuerpo, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "content-type": "application/json" }
  });
}

function crearAdaptadorSimulado() {
  const fetchImpl = async url => {
    const destino = new URL(url);
    assert.equal(destino.origin, "https://api.themoviedb.org");

    if (destino.pathname === "/3/watch/providers/movie") {
      return respuestaJSON({
        results: [
          { provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.png" },
          { provider_id: 119, provider_name: "Amazon Prime Video", logo_path: "/prime.png" }
        ]
      });
    }

    if (destino.pathname === `/3/movie/${PELICULA_A}/watch/providers`) {
      return respuestaJSON({
        id: PELICULA_A,
        results: {
          ES: {
            link: `https://www.themoviedb.org/movie/${PELICULA_A}/watch?locale=ES`,
            flatrate: [{ provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.png" }]
          }
        }
      });
    }

    if (destino.pathname === `/3/movie/${PELICULA_B}/watch/providers`) {
      return respuestaJSON({
        id: PELICULA_B,
        results: {
          ES: {
            link: `https://www.themoviedb.org/movie/${PELICULA_B}/watch?locale=ES`,
            flatrate: [{ provider_id: 119, provider_name: "Amazon Prime Video", logo_path: "/prime.png" }]
          }
        }
      });
    }

    return respuestaJSON({ error: "ruta no simulada" }, 404);
  };

  return crearCatalogoTMDB({ TMDB_READ_ACCESS_TOKEN: TOKEN }, fetchImpl);
}

async function abrirServidor(pool, adaptador) {
  const datos = new DatosUsuariosPostgres(pool);
  const sesiones = new SesionesPostgres(pool);
  const preferencias = new PreferenciasPlataformasPostgres(pool);
  const listas = new ListasPeliculasPostgres(pool);
  const app = crearAplicacion({
    datos,
    sesiones,
    preferencias,
    listas,
    plataformas: crearServicioPlataformas(adaptador),
    disponibilidad: crearServicioDisponibilidad(adaptador, preferencias, {
      reloj: () => new Date(CONSULTADO_EN)
    }),
    cookieSegura: false,
    registrarActividad: () => {}
  });

  app.servidor.listen(0, "127.0.0.1");
  await once(app.servidor, "listening");

  return {
    ...app,
    base: `http://127.0.0.1:${app.servidor.address().port}`,
    async cerrar() {
      if (!app.servidor.listening) return;
      app.servidor.closeAllConnections();
      await new Promise(resolve => app.servidor.close(resolve));
    }
  };
}

test("API listas PostgreSQL: guardado, modificación, eliminación, alertas e independencia entre cuentas", async () => {
  const pools = [crearPool(), crearPool()];
  const servidores = [];
  const emails = [0, 1].map(() => `${randomUUID()}@example.invalid`);
  const adaptador = crearAdaptadorSimulado();

  try {
    const servidor1 = await abrirServidor(pools[0], adaptador);
    servidores.push(servidor1);

    const usuarioA = await servidor1.logica.registrar({
      nombre: "Cuenta A",
      email: emails[0],
      password: PASSWORD
    });
    await servidor1.logica.confirmar(usuarioA.id);

    const loginA = await fetch(`${servidor1.base}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CineMatch": "1" },
      body: JSON.stringify({ email: emails[0], password: PASSWORD })
    });
    assert.equal(loginA.status, 200);
    await loginA.json();
    const cookieA = loginA.headers.get("set-cookie").split(";")[0];

    const guardarA = await fetch(`${servidor1.base}/api/listas/${PELICULA_A}`, {
      method: "PUT",
      headers: { Cookie: cookieA, "Content-Type": "application/json", "X-CineMatch": "1" },
      body: JSON.stringify({ estado: "quiero_ver", titulo: "Matrix", anio: 1999 })
    });
    assert.equal(guardarA.status, 200);
    const { elemento: elemA } = await guardarA.json();
    assert.equal(elemA.disponibleEnPlataformas, false);
    assert.deepEqual(elemA.plataformasCoincidentes, []);

    await servidor1.cerrar();

    // Segunda instancia con distinto pool para validar persistencia real en PostgreSQL.
    const servidor2 = await abrirServidor(pools[1], adaptador);
    servidores.push(servidor2);

    const lecturaA = await fetch(`${servidor2.base}/api/listas`, {
      headers: { Cookie: cookieA }
    });
    assert.equal(lecturaA.status, 200);
    const cuerpoA = await lecturaA.json();
    assert.equal(cuerpoA.elementos.length, 1);
    assert.equal(cuerpoA.elementos[0].peliculaId, PELICULA_A);

    // Cuenta B independiente (autenticada por Google simulado).
    const usuarioB = await servidor2.logica.autenticarGoogle({
      sub: `prueba-${randomUUID()}`,
      email: emails[1],
      nombre: "Cuenta B",
      emailVerificado: true
    });
    const cookieB = `cinematch_sesion=${await servidor2.sesiones.crear(usuarioB.id)}`;

    const lecturaB = await fetch(`${servidor2.base}/api/listas`, {
      headers: { Cookie: cookieB }
    });
    assert.equal(lecturaB.status, 200);
    assert.deepEqual(await lecturaB.json(), { elementos: [] });

    // B no puede eliminar la película de A.
    const intentoBorrarAjeno = await fetch(`${servidor2.base}/api/listas/${PELICULA_A}`, {
      method: "DELETE",
      headers: { Cookie: cookieB, "X-CineMatch": "1" }
    });
    assert.equal(intentoBorrarAjeno.status, 404);
    await intentoBorrarAjeno.json();

    // A selecciona Netflix y comprueba disponibilidad usando el contrato real (`incluidas`).
    const putPrefsA = await fetch(`${servidor2.base}/api/preferencias/plataformas`, {
      method: "PUT",
      headers: { Cookie: cookieA, "Content-Type": "application/json", "X-CineMatch": "1" },
      body: JSON.stringify({ plataformas: [8] })
    });
    assert.equal(putPrefsA.status, 200);
    await putPrefsA.json();

    const comprobarA = await fetch(`${servidor2.base}/api/listas/comprobar`, {
      method: "POST",
      headers: { Cookie: cookieA, "X-CineMatch": "1" }
    });
    assert.equal(comprobarA.status, 200);
    const resComprobarA = await comprobarA.json();
    assert.equal(resComprobarA.comprobadas, 1);
    assert.equal(resComprobarA.nuevasDisponibles, 1);
    assert.equal(resComprobarA.elementos[0].disponibleEnPlataformas, true);
    assert.equal(resComprobarA.elementos[0].recienDisponible, true);
    assert.deepEqual(resComprobarA.elementos[0].plataformasCoincidentes, [
      { id: 8, nombre: "Netflix", logo: "https://image.tmdb.org/t/p/w500/netflix.png" }
    ]);

    // A mueve a vistas y luego elimina.
    const moverA = await fetch(`${servidor2.base}/api/listas/${PELICULA_A}`, {
      method: "PUT",
      headers: { Cookie: cookieA, "Content-Type": "application/json", "X-CineMatch": "1" },
      body: JSON.stringify({ estado: "vistas", titulo: "Matrix", anio: 1999 })
    });
    assert.equal(moverA.status, 200);
    assert.equal((await moverA.json()).elemento.estado, "vistas");

    const borrarA = await fetch(`${servidor2.base}/api/listas/${PELICULA_A}`, {
      method: "DELETE",
      headers: { Cookie: cookieA, "X-CineMatch": "1" }
    });
    assert.equal(borrarA.status, 204);

    const finalA = await fetch(`${servidor2.base}/api/listas`, {
      headers: { Cookie: cookieA }
    });
    assert.deepEqual(await finalA.json(), { elementos: [] });
  } finally {
    await Promise.all(servidores.map(s => s.cerrar()));
    try {
      await pools[0].query("DELETE FROM usuarios WHERE email=ANY($1::text[])", [emails]);
    } finally {
      await Promise.all(pools.map(pool => pool.end()));
    }
  }
});
