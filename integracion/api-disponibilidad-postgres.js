import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";

import { crearPool } from "../Servidor/conexion.js";
import { DatosUsuariosPostgres } from "../Servidor/datos-postgres.js";
import { SesionesPostgres } from "../Servidor/sesiones-postgres.js";
import { PreferenciasPlataformasPostgres } from "../Servidor/preferencias-plataformas-postgres.js";
import { crearAplicacion } from "../Servidor/api.js";
import { crearCatalogoTMDB } from "../Servidor/catalogo-tmdb.js";
import { crearServicioPlataformas } from "../Servidor/plataformas-tmdb.js";
import { crearServicioDisponibilidad } from "../Servidor/disponibilidad-pelicula.js";

const PASSWORD = "Frase ficticia para disponibilidad PostgreSQL";
const TOKEN = "token-ficticio-disponibilidad-postgres";
const CONSULTADO_EN = "2026-11-13T12:00:00.000Z";
const PELICULA = 550;
const RUTA_PREFERENCIAS = "/api/preferencias/plataformas";
const RUTA_DISPONIBILIDAD = `/api/peliculas/${PELICULA}/disponibilidad`;

function respuestaJSON(cuerpo, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "content-type": "application/json" }
  });
}

function proveedor(id, nombre, logo = null) {
  return { provider_id: id, provider_name: nombre, logo_path: logo };
}

function crearProveedorSimulado() {
  const control = { fallo: false, peticiones: [] };
  const fetchImpl = async url => {
    const destino = new URL(url);
    control.peticiones.push(destino.pathname + destino.search);
    assert.equal(destino.origin, "https://api.themoviedb.org");

    if (destino.pathname === "/3/watch/providers/movie") {
      return respuestaJSON({
        results: [
          proveedor(20, "Proveedor 20", "/proveedor-20.png"),
          proveedor(10, "Proveedor 10")
        ]
      });
    }

    if (destino.pathname === `/3/movie/${PELICULA}/watch/providers`) {
      if (control.fallo) {
        return respuestaJSON({ error: TOKEN }, 500);
      }
      return respuestaJSON({
        id: PELICULA,
        results: {
          ES: {
            link: `https://www.themoviedb.org/movie/${PELICULA}-prueba/watch?locale=ES`,
            flatrate: [proveedor(20, "Proveedor 20"), proveedor(10, "Proveedor 10")],
            rent: [proveedor(10, "Proveedor 10")]
          }
        }
      });
    }

    return respuestaJSON({ error: "ruta no simulada" }, 404);
  };

  const adaptador = crearCatalogoTMDB(
    { TMDB_READ_ACCESS_TOKEN: TOKEN },
    fetchImpl
  );

  return { adaptador, control };
}

async function abrirServidor(pool, adaptador) {
  const datos = new DatosUsuariosPostgres(pool);
  const sesiones = new SesionesPostgres(pool);
  const preferencias = new PreferenciasPlataformasPostgres(pool);
  const app = crearAplicacion({
    datos,
    sesiones,
    preferencias,
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

async function iniciarSesion(base, email) {
  const respuesta = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CineMatch": "1" },
    body: JSON.stringify({ email, password: PASSWORD })
  });
  const texto = await respuesta.text();
  assert.equal(respuesta.status, 200, texto);
  assert.equal(texto.includes(PASSWORD), false);
  assert.equal(texto.includes(TOKEN), false);
  const cookie = respuesta.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie.split(";")[0];
}

async function pedir(base, ruta, { cookie, metodo = "GET", cuerpo } = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(metodo === "PUT"
        ? { "X-CineMatch": "1", "Content-Type": "application/json" }
        : {})
    },
    ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {})
  });
  const texto = await respuesta.text();
  assert.equal(texto.includes(TOKEN), false);
  return {
    estado: respuesta.status,
    cacheControl: respuesta.headers.get("cache-control"),
    texto,
    cuerpo: texto ? JSON.parse(texto) : null
  };
}

function comprobarIncluidas(respuesta, ids) {
  assert.deepEqual(respuesta.cuerpo.incluidas.map(proveedor => proveedor.id), ids);
}

test("API PostgreSQL disponibilidad: preferencias, sesión y aislamiento persisten entre servidores", async () => {
  const pools = [crearPool(), crearPool()];
  const emails = [0, 1].map(() => `${randomUUID()}@example.invalid`);
  const { adaptador } = crearProveedorSimulado();
  const servidores = [];
  let ana;

  try {
    const primero = await abrirServidor(pools[0], adaptador);
    servidores.push(primero);
    ana = await primero.logica.registrar({
      nombre: "Ana disponibilidad",
      email: emails[0],
      password: PASSWORD
    });
    await primero.logica.confirmar(ana.id);
    const cookieAna = await iniciarSesion(primero.base, emails[0]);

    const sinSeleccion = await pedir(primero.base, RUTA_DISPONIBILIDAD, { cookie: cookieAna });
    assert.equal(sinSeleccion.estado, 200);
    assert.equal(sinSeleccion.cacheControl, "no-store");
    assert.deepEqual(sinSeleccion.cuerpo.incluidas, []);
    assert.match(sinSeleccion.cuerpo.mensaje, /Selecciona/);

    const guardado = await pedir(primero.base, RUTA_PREFERENCIAS, {
      cookie: cookieAna,
      metodo: "PUT",
      cuerpo: { plataformas: [10] }
    });
    assert.equal(guardado.estado, 200);
    assert.deepEqual(guardado.cuerpo, { region: "ES", plataformas: [10] });
    assert.deepEqual(
      await new PreferenciasPlataformasPostgres(pools[0]).obtener(ana.id),
      { region: "ES", plataformas: [10] }
    );

    const disponible = await pedir(primero.base, RUTA_DISPONIBILIDAD, { cookie: cookieAna });
    assert.equal(disponible.estado, 200);
    assert.equal(disponible.cuerpo.consultadoEn, CONSULTADO_EN);
    comprobarIncluidas(disponible, [10]);
    assert.deepEqual(disponible.cuerpo.suscripcion.map(proveedor => proveedor.id), [10, 20]);
    assert.deepEqual(disponible.cuerpo.alquiler.map(proveedor => proveedor.id), [10]);
    assert.equal(disponible.cuerpo.mensaje, null);

    await primero.cerrar();

    const segundo = await abrirServidor(pools[1], adaptador);
    servidores.push(segundo);

    // La cookie y las preferencias se leen desde otro pool: simula otra instancia.
    const persistida = await pedir(segundo.base, RUTA_DISPONIBILIDAD, { cookie: cookieAna });
    assert.equal(persistida.estado, 200);
    comprobarIncluidas(persistida, [10]);
    assert.deepEqual(
      await new PreferenciasPlataformasPostgres(pools[1]).obtener(ana.id),
      { region: "ES", plataformas: [10] }
    );

    const luis = await segundo.logica.registrar({
      nombre: "Luis disponibilidad",
      email: emails[1],
      password: PASSWORD
    });
    await segundo.logica.confirmar(luis.id);
    const cookieLuis = await iniciarSesion(segundo.base, emails[1]);

    const aislada = await pedir(segundo.base, RUTA_DISPONIBILIDAD, { cookie: cookieLuis });
    assert.equal(aislada.estado, 200);
    assert.deepEqual(aislada.cuerpo.incluidas, []);
    assert.match(aislada.cuerpo.mensaje, /Selecciona/);

    await pedir(segundo.base, RUTA_PREFERENCIAS, {
      cookie: cookieLuis,
      metodo: "PUT",
      cuerpo: { plataformas: [20] }
    });
    comprobarIncluidas(
      await pedir(segundo.base, RUTA_DISPONIBILIDAD, { cookie: cookieLuis }),
      [20]
    );
    comprobarIncluidas(
      await pedir(segundo.base, RUTA_DISPONIBILIDAD, { cookie: cookieAna }),
      [10]
    );

    await pedir(segundo.base, RUTA_PREFERENCIAS, {
      cookie: cookieAna,
      metodo: "PUT",
      cuerpo: { plataformas: [] }
    });
    const vacia = await pedir(segundo.base, RUTA_DISPONIBILIDAD, { cookie: cookieAna });
    assert.deepEqual(vacia.cuerpo.incluidas, []);
    assert.match(vacia.cuerpo.mensaje, /Selecciona/);
    comprobarIncluidas(
      await pedir(segundo.base, RUTA_DISPONIBILIDAD, { cookie: cookieLuis }),
      [20]
    );
  } finally {
    for (const servidor of servidores) await servidor.cerrar();
    try {
      await pools[0].query("DELETE FROM usuarios WHERE email = ANY($1::text[])", [emails]);
    } finally {
      await Promise.all(pools.map(pool => pool.end()));
    }
  }
});

test("API PostgreSQL disponibilidad: un fallo TMDB conserva las preferencias y permite recuperarse", async () => {
  const pool = crearPool();
  const email = `${randomUUID()}@example.invalid`;
  const { adaptador, control } = crearProveedorSimulado();
  let servidor;

  try {
    servidor = await abrirServidor(pool, adaptador);
    const usuario = await servidor.logica.registrar({
      nombre: "Prueba de fallo",
      email,
      password: PASSWORD
    });
    await servidor.logica.confirmar(usuario.id);
    const cookie = await iniciarSesion(servidor.base, email);

    await pedir(servidor.base, RUTA_PREFERENCIAS, {
      cookie,
      metodo: "PUT",
      cuerpo: { plataformas: [10] }
    });

    control.fallo = true;
    const fallo = await pedir(servidor.base, RUTA_DISPONIBILIDAD, { cookie });
    assert.equal(fallo.estado, 502);
    assert.equal(fallo.texto.includes(TOKEN), false);
    assert.deepEqual(
      await new PreferenciasPlataformasPostgres(pool).obtener(usuario.id),
      { region: "ES", plataformas: [10] }
    );

    control.fallo = false;
    const recuperada = await pedir(servidor.base, RUTA_DISPONIBILIDAD, { cookie });
    assert.equal(recuperada.estado, 200);
    comprobarIncluidas(recuperada, [10]);
  } finally {
    if (servidor) await servidor.cerrar();
    try {
      await pool.query("DELETE FROM usuarios WHERE email = $1", [email]);
    } finally {
      await pool.end();
    }
  }
});
