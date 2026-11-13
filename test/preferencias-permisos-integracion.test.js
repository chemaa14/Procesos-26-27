import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";

import { crearAplicacion } from "../Servidor/api.js";
import { DatosUsuarios } from "../Servidor/datos.js";
import { Sesiones } from "../Servidor/sesiones.js";
import { PreferenciasPlataformas } from "../Servidor/preferencias-plataformas.js";
import { crearServicioPlataformas } from "../Servidor/plataformas-tmdb.js";
import { crearServicioDisponibilidad } from "../Servidor/disponibilidad-pelicula.js";
import { ErrorCatalogoTMDB } from "../Servidor/catalogo-tmdb.js";
import { crearRegistroActividad } from "../Servidor/actividad.js";

const PASSWORD = "Frase ficticia para probar preferencias y permisos";
const PRIVADO = "token-ficticio-preferencias api.themoviedb.org";
const CONSULTADO_EN = "2026-11-13T12:00:00.000Z";
const RUTA_PREFERENCIAS = "/api/preferencias/plataformas";
const RUTA_CATALOGO = "/api/plataformas";

function proveedor(id, nombre, logo = null) {
  return { provider_id: id, provider_name: nombre, logo_path: logo };
}

function crearProveedorSimulado() {
  const control = {
    llamadas: [],
    errorCatalogo: null,
    errorDisponibilidad: null
  };

  const adaptador = {
    async consultar(ruta) {
      control.llamadas.push(ruta);

      if (ruta === "/watch/providers/movie") {
        if (control.errorCatalogo) throw control.errorCatalogo;
        return {
          results: [
            proveedor(20, "Proveedor 20", "/proveedor-20.png"),
            proveedor(10, "Proveedor 10"),
            proveedor(10, "Proveedor duplicado")
          ]
        };
      }

      const coincidencia = /^\/movie\/(\d+)\/watch\/providers$/.exec(ruta);
      if (!coincidencia) throw new Error(`Ruta simulada desconocida: ${ruta}`);
      if (control.errorDisponibilidad) throw control.errorDisponibilidad;

      const id = Number(coincidencia[1]);
      return {
        id,
        results: {
          ES: {
            link: `https://www.themoviedb.org/movie/${id}-prueba/watch?locale=ES`,
            flatrate: [
              proveedor(20, "Proveedor 20", "/proveedor-20.png"),
              proveedor(10, "Proveedor 10")
            ],
            rent: [proveedor(10, "Proveedor 10")]
          }
        }
      };
    }
  };

  return { control, adaptador };
}

async function conAplicacion(comprobar) {
  const datos = new DatosUsuarios();
  const sesiones = new Sesiones();
  const preferencias = new PreferenciasPlataformas(datos);
  const { control, adaptador } = crearProveedorSimulado();
  const registros = [];
  const app = crearAplicacion({
    datos,
    sesiones,
    preferencias,
    plataformas: crearServicioPlataformas(adaptador),
    disponibilidad: crearServicioDisponibilidad(adaptador, preferencias, {
      reloj: () => new Date(CONSULTADO_EN)
    }),
    cookieSegura: false,
    registrarActividad: crearRegistroActividad({
      escribir: linea => registros.push(linea)
    })
  });

  async function crearCuenta({
    email = `${randomUUID()}@example.invalid`,
    rol = "usuario",
    confirmado = true
  } = {}) {
    const usuario = await app.logica.registrar({
      nombre: "Cuenta de prueba",
      email,
      password: PASSWORD
    });

    if (confirmado) await app.logica.confirmar(usuario.id);
    if (rol !== "usuario" || !confirmado) {
      const guardado = await datos.buscarPorId(usuario.id);
      await datos.guardar({ ...guardado, rol, confirmado });
    }

    return datos.buscarPorId(usuario.id);
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
    assert.equal(texto.includes("password_hash"), false);

    const cookie = respuesta.headers.get("set-cookie");
    assert.ok(cookie);
    assert.match(cookie, /HttpOnly/);
    return cookie.split(";")[0];
  }

  async function cerrarSesion(base, cookie) {
    const respuesta = await fetch(`${base}/api/logout`, {
      method: "POST",
      headers: { Cookie: cookie, "X-CineMatch": "1" }
    });
    await respuesta.text();
    assert.equal(respuesta.status, 204);
  }

  function pedir(base, ruta, { cookie, metodo = "GET", cuerpo, headers = {}, bruto } = {}) {
    return fetch(`${base}${ruta}`, {
      method: metodo,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(metodo === "PUT" ? { "X-CineMatch": "1", "Content-Type": "application/json" } : {}),
        ...headers
      },
      ...(cuerpo !== undefined || bruto !== undefined ? { body: bruto ?? JSON.stringify(cuerpo) } : {})
    }).then(async respuesta => {
      const texto = await respuesta.text();
      assert.equal(texto.includes(PRIVADO), false);
      return {
        estado: respuesta.status,
        allow: respuesta.headers.get("allow"),
        cacheControl: respuesta.headers.get("cache-control"),
        texto,
        cuerpo: texto ? JSON.parse(texto) : null
      };
    });
  }

  try {
    app.servidor.listen(0, "127.0.0.1");
    await once(app.servidor, "listening");
    const base = `http://127.0.0.1:${app.servidor.address().port}`;

    await comprobar({
      base,
      control,
      datos,
      registros,
      sesiones,
      crearCuenta,
      iniciarSesion,
      cerrarSesion,
      pedir
    });
  } finally {
    if (app.servidor.listening) {
      app.servidor.closeAllConnections();
      await new Promise(resolve => app.servidor.close(resolve));
    }
  }
}

test("preferencias: persisten entre sesiones, se aíslan por cuenta y guardan la selección vacía", async () => {
  await conAplicacion(async ({
    base,
    control,
    crearCuenta,
    iniciarSesion,
    pedir
  }) => {
    const ana = await crearCuenta({ email: "ana-preferencias@example.invalid" });
    const admin = await crearCuenta({
      email: "admin-preferencias@example.invalid",
      rol: "administrador"
    });
    const cookieAna = await iniciarSesion(base, ana.email);
    const cookieAdmin = await iniciarSesion(base, admin.email);

    const inicial = await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieAna });
    assert.equal(inicial.estado, 200);
    assert.equal(inicial.cacheControl, "no-store");
    assert.deepEqual(inicial.cuerpo, { region: "ES", plataformas: [] });

    const catalogo = await pedir(base, RUTA_CATALOGO, { cookie: cookieAna });
    assert.equal(catalogo.estado, 200);
    assert.deepEqual(catalogo.cuerpo, {
      region: "ES",
      plataformas: [
        { id: 10, nombre: "Proveedor 10", logo: null },
        {
          id: 20,
          nombre: "Proveedor 20",
          logo: "https://image.tmdb.org/t/p/w500/proveedor-20.png"
        }
      ]
    });

    const guardado = await pedir(base, RUTA_PREFERENCIAS, {
      cookie: cookieAna,
      metodo: "PUT",
      cuerpo: { plataformas: [20, 10, 20] }
    });
    assert.equal(guardado.estado, 200);
    assert.deepEqual(guardado.cuerpo, { region: "ES", plataformas: [10, 20] });

    const cookieAnaNueva = await iniciarSesion(base, ana.email);
    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieAnaNueva })).cuerpo,
      { region: "ES", plataformas: [10, 20] }
    );

    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieAdmin })).cuerpo,
      { region: "ES", plataformas: [] }
    );
    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, {
        cookie: cookieAdmin,
        metodo: "PUT",
        cuerpo: { plataformas: [20] }
      })).cuerpo,
      { region: "ES", plataformas: [20] }
    );
    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieAnaNueva })).cuerpo,
      { region: "ES", plataformas: [10, 20] }
    );

    const consultaAjena = await pedir(
      base,
      `${RUTA_PREFERENCIAS}?usuarioId=${ana.id}`,
      { cookie: cookieAdmin }
    );
    assert.equal(consultaAjena.estado, 400);
    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieAdmin })).cuerpo,
      { region: "ES", plataformas: [20] }
    );

    const escrituraAjena = await pedir(base, RUTA_PREFERENCIAS, {
      cookie: cookieAdmin,
      metodo: "PUT",
      cuerpo: { usuarioId: ana.id, plataformas: [10] }
    });
    assert.equal(escrituraAjena.estado, 400);
    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieAnaNueva })).cuerpo,
      { region: "ES", plataformas: [10, 20] }
    );

    const regionAjena = await pedir(base, `${RUTA_PREFERENCIAS}?region=ES`, {
      cookie: cookieAnaNueva
    });
    assert.equal(regionAjena.estado, 400);

    const vaciado = await pedir(base, RUTA_PREFERENCIAS, {
      cookie: cookieAnaNueva,
      metodo: "PUT",
      cuerpo: { plataformas: [] }
    });
    assert.equal(vaciado.estado, 200);
    assert.deepEqual(vaciado.cuerpo, { region: "ES", plataformas: [] });
    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieAna })).cuerpo,
      { region: "ES", plataformas: [] }
    );

    const cookieAnaFinal = await iniciarSesion(base, ana.email);
    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieAnaFinal })).cuerpo,
      { region: "ES", plataformas: [] }
    );
    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieAdmin })).cuerpo,
      { region: "ES", plataformas: [20] }
    );

    assert.equal(control.llamadas.filter(ruta => ruta === "/watch/providers/movie").length, 3);
    assert.equal(control.llamadas.some(ruta => /^\/movie\//.test(ruta)), false);
  });
});

test("permisos: solo una sesión confirmada y activa accede a sus propias preferencias", async () => {
  await conAplicacion(async ({
    base,
    control,
    datos,
    sesiones,
    crearCuenta,
    iniciarSesion,
    cerrarSesion,
    pedir
  }) => {
    const sinSesion = await pedir(base, RUTA_PREFERENCIAS);
    assert.equal(sinSesion.estado, 401);
    assert.equal((await pedir(base, RUTA_CATALOGO)).estado, 401);
    assert.equal((await pedir(base, RUTA_PREFERENCIAS, {
      metodo: "PUT",
      cuerpo: { plataformas: [] }
    })).estado, 401);
    assert.equal(
      (await pedir(base, RUTA_PREFERENCIAS, {
        cookie: `cinematch_sesion=${"0".repeat(64)}`
      })).estado,
      401
    );
    assert.equal(control.llamadas.length, 0);

    const pendiente = await crearCuenta({
      email: "pendiente-preferencias@example.invalid",
      confirmado: false
    });
    const cookiePendiente = `cinematch_sesion=${await sesiones.crear(pendiente.id)}`;
    assert.equal(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookiePendiente })).estado,
      401
    );

    const eliminada = await crearCuenta({ email: "eliminada-preferencias@example.invalid" });
    const cookieEliminada = await iniciarSesion(base, eliminada.email);
    await datos.guardar({ ...(await datos.buscarPorId(eliminada.id)), eliminado: true });
    assert.equal(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieEliminada })).estado,
      401
    );

    const normal = await crearCuenta({ email: "normal-preferencias@example.invalid" });
    const admin = await crearCuenta({
      email: "admin-permisos@example.invalid",
      rol: "administrador"
    });
    const cookieNormal = await iniciarSesion(base, normal.email);
    const cookieAdmin = await iniciarSesion(base, admin.email);

    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, {
        cookie: cookieNormal,
        metodo: "PUT",
        cuerpo: { plataformas: [10] }
      })).cuerpo,
      { region: "ES", plataformas: [10] }
    );
    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieAdmin })).cuerpo,
      { region: "ES", plataformas: [] }
    );
    assert.equal(
      (await pedir(base, `${RUTA_PREFERENCIAS}?usuarioId=${normal.id}`, {
        cookie: cookieAdmin
      })).estado,
      400
    );
    assert.equal(
      (await pedir(base, RUTA_PREFERENCIAS, {
        cookie: cookieAdmin,
        metodo: "PUT",
        cuerpo: { usuarioId: normal.id, plataformas: [20] }
      })).estado,
      400
    );
    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieAdmin })).cuerpo,
      { region: "ES", plataformas: [] }
    );
    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieNormal })).cuerpo,
      { region: "ES", plataformas: [10] }
    );

    for (const metodo of ["POST", "PATCH", "DELETE"]) {
      const respuesta = await pedir(base, RUTA_PREFERENCIAS, {
        cookie: cookieNormal,
        metodo
      });
      assert.equal(respuesta.estado, 405);
      assert.equal(respuesta.allow, "GET, PUT");
    }
    const catalogoSoloLectura = await pedir(base, RUTA_CATALOGO, {
      cookie: cookieNormal,
      metodo: "PUT"
    });
    assert.equal(catalogoSoloLectura.estado, 405);
    assert.equal(catalogoSoloLectura.allow, "GET");

    assert.equal(
      (await pedir(base, RUTA_PREFERENCIAS, {
        cookie: cookieNormal,
        metodo: "PUT",
        cuerpo: { plataformas: [] },
        headers: { "X-CineMatch": "0" }
      })).estado,
      403
    );
    assert.equal(
      (await pedir(base, RUTA_PREFERENCIAS, {
        cookie: cookieNormal,
        metodo: "PUT",
        cuerpo: { plataformas: [] },
        headers: { "X-CineMatch": "" }
      })).estado,
      403
    );

    for (const cuerpo of [
      {},
      [],
      null,
      { plataformas: "10" },
      { plataformas: ["10"] },
      { plataformas: [0] },
      { plataformas: [-1] },
      { plataformas: [1.5] },
      { plataformas: [2147483648] },
      { plataformas: [null] },
      { plataformas: Array(101).fill(10) },
      { plataformas: [], region: "FR" }
    ]) {
      assert.equal(
        (await pedir(base, RUTA_PREFERENCIAS, {
          cookie: cookieNormal,
          metodo: "PUT",
          cuerpo
        })).estado,
        400
      );
    }
    assert.equal(
      (await pedir(base, RUTA_PREFERENCIAS, {
        cookie: cookieNormal,
        metodo: "PUT",
        cuerpo: { plataformas: [99] }
      })).estado,
      400
    );
    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieNormal })).cuerpo,
      { region: "ES", plataformas: [10] }
    );

    await cerrarSesion(base, cookieNormal);
    assert.equal(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieNormal })).estado,
      401
    );
    assert.equal(
      (await pedir(base, RUTA_PREFERENCIAS, {
        cookie: cookieNormal,
        metodo: "PUT",
        cuerpo: { plataformas: [] }
      })).estado,
      401
    );
    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieAdmin })).cuerpo,
      { region: "ES", plataformas: [] }
    );
  });
});

test("fallos del catálogo conservan la selección y disponibilidad usa las preferencias de cada cuenta", async () => {
  await conAplicacion(async ({
    base,
    control,
    crearCuenta,
    iniciarSesion,
    pedir
  }) => {
    const ana = await crearCuenta({ email: "ana-disponibilidad@example.invalid" });
    const luis = await crearCuenta({ email: "luis-disponibilidad@example.invalid" });
    const sinPreferencias = await crearCuenta({
      email: "sin-preferencias@example.invalid"
    });
    const cookieAna = await iniciarSesion(base, ana.email);
    const cookieLuis = await iniciarSesion(base, luis.email);
    const cookieSinPreferencias = await iniciarSesion(base, sinPreferencias.email);

    await pedir(base, RUTA_PREFERENCIAS, {
      cookie: cookieAna,
      metodo: "PUT",
      cuerpo: { plataformas: [10] }
    });
    await pedir(base, RUTA_PREFERENCIAS, {
      cookie: cookieLuis,
      metodo: "PUT",
      cuerpo: { plataformas: [20] }
    });

    control.errorCatalogo = new ErrorCatalogoTMDB("TMDB_TIMEOUT");
    control.errorCatalogo.message = PRIVADO;
    const timeout = await pedir(base, RUTA_PREFERENCIAS, {
      cookie: cookieAna,
      metodo: "PUT",
      cuerpo: { plataformas: [20] }
    });
    assert.equal(timeout.estado, 504);
    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieAna })).cuerpo,
      { region: "ES", plataformas: [10] }
    );

    control.errorCatalogo = new ErrorCatalogoTMDB("TMDB_RED");
    control.errorCatalogo.message = PRIVADO;
    const red = await pedir(base, RUTA_PREFERENCIAS, {
      cookie: cookieAna,
      metodo: "PUT",
      cuerpo: { plataformas: [20] }
    });
    assert.equal(red.estado, 502);
    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, { cookie: cookieAna })).cuerpo,
      { region: "ES", plataformas: [10] }
    );

    control.errorCatalogo = null;
    assert.deepEqual(
      (await pedir(base, RUTA_PREFERENCIAS, {
        cookie: cookieAna,
        metodo: "PUT",
        cuerpo: { plataformas: [20] }
      })).cuerpo,
      { region: "ES", plataformas: [20] }
    );

    const disponibilidadAna = await pedir(
      base,
      "/api/peliculas/550/disponibilidad",
      { cookie: cookieAna }
    );
    assert.equal(disponibilidadAna.estado, 200);
    assert.equal(disponibilidadAna.cacheControl, "no-store");
    assert.deepEqual(disponibilidadAna.cuerpo.incluidas, [
      { id: 20, nombre: "Proveedor 20", logo: "https://image.tmdb.org/t/p/w500/proveedor-20.png" }
    ]);
    assert.deepEqual(disponibilidadAna.cuerpo.suscripcion.map(p => p.id), [10, 20]);
    assert.deepEqual(disponibilidadAna.cuerpo.alquiler.map(p => p.id), [10]);
    assert.equal(disponibilidadAna.cuerpo.consultadoEn, CONSULTADO_EN);
    assert.equal(disponibilidadAna.cuerpo.mensaje, null);

    const disponibilidadLuis = await pedir(
      base,
      "/api/peliculas/550/disponibilidad",
      { cookie: cookieLuis }
    );
    assert.deepEqual(disponibilidadLuis.cuerpo.incluidas, [
      { id: 20, nombre: "Proveedor 20", logo: "https://image.tmdb.org/t/p/w500/proveedor-20.png" }
    ]);

    const sinSeleccion = await pedir(
      base,
      "/api/peliculas/550/disponibilidad",
      { cookie: cookieSinPreferencias }
    );
    assert.deepEqual(sinSeleccion.cuerpo.incluidas, []);
    assert.match(sinSeleccion.cuerpo.mensaje, /Selecciona/);

    await pedir(base, RUTA_PREFERENCIAS, {
      cookie: cookieAna,
      metodo: "PUT",
      cuerpo: { plataformas: [] }
    });
    const vacia = await pedir(base, "/api/peliculas/550/disponibilidad", {
      cookie: cookieAna
    });
    assert.deepEqual(vacia.cuerpo.incluidas, []);
    assert.match(vacia.cuerpo.mensaje, /Selecciona/);

    control.errorDisponibilidad = new ErrorCatalogoTMDB("TMDB_RED");
    control.errorDisponibilidad.message = PRIVADO;
    const fallo = await pedir(base, "/api/peliculas/550/disponibilidad", {
      cookie: cookieLuis
    });
    assert.equal(fallo.estado, 502);
    assert.equal(fallo.texto.includes(PRIVADO), false);

    control.errorDisponibilidad = null;
    const recuperada = await pedir(base, "/api/peliculas/550/disponibilidad", {
      cookie: cookieLuis
    });
    assert.equal(recuperada.estado, 200);
    assert.deepEqual(recuperada.cuerpo.incluidas.map(p => p.id), [20]);
  });
});
