import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { crearAplicacion } from "../Servidor/api.js";

const PASSWORD = "Mi frase secreta para CineMatch";

async function conServidor(comprobar, { cookieSegura = false } = {}) {
  const { servidor, logica } = crearAplicacion({
    tokenAdmin: "",
    cookieSegura
  });

  try {
    servidor.listen(0, "127.0.0.1");
    await once(servidor, "listening");

    const base = `http://127.0.0.1:${servidor.address().port}`;

    await comprobar(base, logica);
  } finally {
    if (servidor.listening) {
      const cerrado = new Promise((resolve, reject) => {
        servidor.close(error => error ? reject(error) : resolve());
      });

      servidor.closeAllConnections();
      await cerrado;
    }
  }
}

async function crearUsuario(logica, confirmado = true) {
  const usuario = await logica.registrar({
    nombre: "Ana",
    email: "ana@example.com",
    password: PASSWORD
  });

  if (confirmado) {
    (await logica.confirmar(usuario.id));
  }

  return usuario;
}

function login(base, {
  email = "ana@example.com",
  password = PASSWORD,
  cookie
} = {}) {
  return fetch(`${base}/api/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CineMatch": "1",
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: JSON.stringify({ email, password })
  });
}

function extraerCookie(respuesta) {
  const cabecera = respuesta.headers.get("set-cookie");

  assert.ok(cabecera, "La respuesta debe incluir una cookie");

  return cabecera.split(";")[0];
}

async function comprobarSesion(base, cookie, estadoEsperado) {
  const respuesta = await fetch(`${base}/api/sesion`, {
    headers: cookie ? { Cookie: cookie } : {}
  });

  assert.equal(respuesta.status, estadoEsperado);

  return respuesta.json();
}

test("el login crea una cookie y permite consultar la sesión repetidamente", async () => {
  await conServidor(async (base, logica) => {
    const usuario = await crearUsuario(logica);

    const respuesta = await login(base);
    assert.equal(respuesta.status, 200);

    const cabecera = respuesta.headers.get("set-cookie");
    const cookie = extraerCookie(respuesta);

    assert.match(cabecera, /;\s*HttpOnly(?:;|$)/);
    assert.match(cabecera, /;\s*SameSite=Lax(?:;|$)/);
    assert.match(cabecera, /;\s*Max-Age=28800(?:;|$)/);
    assert.match(cabecera, /;\s*Path=\/(?:;|$)/);
    assert.doesNotMatch(cabecera, /;\s*Secure(?:;|$)/);

    const cuerpo = await respuesta.json();

    assert.equal(cuerpo.usuario.id, usuario.id);
    assert.deepEqual(
      Object.keys(cuerpo.usuario).sort(),
      ["id", "nombre", "email", "confirmado", "eliminado"].sort()
    );

    // Simula nuevas peticiones usando la misma cookie.
    for (let intento = 0; intento < 2; intento++) {
      const sesion = await comprobarSesion(base, cookie, 200);
      assert.deepEqual(sesion.usuario, cuerpo.usuario);
    }
  });
});

test("rechaza consultas sin cookie o con una cookie inventada", async () => {
  await conServidor(async base => {
    await comprobarSesion(base, undefined, 401);

    await comprobarSesion(
      base,
      `cinematch_sesion=${"a".repeat(64)}`,
      401
    );

    await comprobarSesion(base, "cinematch_sesion=invalida", 401);
  });
});

test("el logout borra la cookie e invalida la sesión en el servidor", async () => {
  await conServidor(async (base, logica) => {
    await crearUsuario(logica);

    const acceso = await login(base);
    assert.equal(acceso.status, 200);

    const cookie = extraerCookie(acceso);
    await acceso.json();

    const salida = await fetch(`${base}/api/logout`, {
      method: "POST",
      headers: {
        "X-CineMatch": "1",
        Cookie: cookie
      }
    });

    assert.equal(salida.status, 204);
    assert.equal(await salida.text(), "");
    assert.match(
      salida.headers.get("set-cookie"),
      /;\s*Max-Age=0(?:;|$)/
    );

    // Aunque alguien conserve la cookie anterior, ya no funciona.
    await comprobarSesion(base, cookie, 401);
  });
});

test("una cuenta pendiente no puede iniciar sesión", async () => {
  await conServidor(async (base, logica) => {
    await crearUsuario(logica, false);

    const respuesta = await login(base);

    assert.equal(respuesta.status, 401);
    assert.equal(respuesta.headers.get("set-cookie"), null);

    const cuerpo = await respuesta.json();
    assert.equal(cuerpo.codigo, "CREDENCIALES_INVALIDAS");
  });
});

test("el login devuelve el mismo error para correo inexistente y contraseña incorrecta", async () => {
  await conServidor(async (base, logica) => {
    await crearUsuario(logica);

    const inexistente = await login(base, {
      email: "noexiste@example.com"
    });

    const incorrecta = await login(base, {
      password: "Esta contraseña no es la correcta"
    });

    assert.equal(inexistente.status, 401);
    assert.equal(incorrecta.status, 401);
    assert.equal(inexistente.headers.get("set-cookie"), null);
    assert.equal(incorrecta.headers.get("set-cookie"), null);

    const primerError = await inexistente.json();
    const segundoError = await incorrecta.json();

    assert.deepEqual(primerError, segundoError);
    assert.equal(primerError.codigo, "CREDENCIALES_INVALIDAS");
  });
});

test("eliminar un usuario invalida su acceso y evita nuevos logins", async () => {
  await conServidor(async (base, logica) => {
    const usuario = await crearUsuario(logica);

    const acceso = await login(base);
    assert.equal(acceso.status, 200);

    const cookie = extraerCookie(acceso);
    await acceso.json();

    (await logica.eliminar(usuario.id));

    await comprobarSesion(base, cookie, 401);

    const nuevoAcceso = await login(base);
    assert.equal(nuevoAcceso.status, 401);
    assert.equal(nuevoAcceso.headers.get("set-cookie"), null);
    await nuevoAcceso.json();
  });
});

test("un nuevo login sustituye la sesión anterior del navegador", async () => {
  await conServidor(async (base, logica) => {
    await crearUsuario(logica);

    const primero = await login(base);
    assert.equal(primero.status, 200);

    const cookieAnterior = extraerCookie(primero);
    await primero.json();

    const segundo = await login(base, {
      cookie: cookieAnterior
    });

    assert.equal(segundo.status, 200);

    const cookieNueva = extraerCookie(segundo);
    await segundo.json();

    assert.notEqual(cookieNueva, cookieAnterior);

    await comprobarSesion(base, cookieAnterior, 401);
    await comprobarSesion(base, cookieNueva, 200);
  });
});

test("login y logout requieren la cabecera de protección", async () => {
  await conServidor(async (base, logica) => {
    await crearUsuario(logica);

    const accesoSinCabecera = await fetch(`${base}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "ana@example.com",
        password: PASSWORD
      })
    });

    assert.equal(accesoSinCabecera.status, 403);
    assert.equal(accesoSinCabecera.headers.get("set-cookie"), null);
    await accesoSinCabecera.json();

    const acceso = await login(base);
    assert.equal(acceso.status, 200);

    const cookie = extraerCookie(acceso);
    await acceso.json();

    const salidaSinCabecera = await fetch(`${base}/api/logout`, {
      method: "POST",
      headers: { Cookie: cookie }
    });

    assert.equal(salidaSinCabecera.status, 403);
    await salidaSinCabecera.json();

    // El intento rechazado no debe cerrar la sesión.
    await comprobarSesion(base, cookie, 200);
  });
});

test("las cookies llevan Secure cuando se configura producción", async () => {
  await conServidor(async (base, logica) => {
    await crearUsuario(logica);

    const respuesta = await login(base);

    assert.equal(respuesta.status, 200);
    assert.match(
      respuesta.headers.get("set-cookie"),
      /;\s*Secure(?:;|$)/
    );

    await respuesta.json();
  }, { cookieSegura: true });
});

test("las rutas de sesión rechazan métodos no permitidos", async () => {
  await conServidor(async base => {
    for (const [ruta, metodo, permitido] of [
      ["/api/login", "GET", "POST"],
      ["/api/sesion", "POST", "GET"],
      ["/api/logout", "GET", "POST"]
    ]) {
      const respuesta = await fetch(`${base}${ruta}`, {
        method: metodo
      });

      assert.equal(respuesta.status, 405);
      assert.equal(respuesta.headers.get("allow"), permitido);
      await respuesta.json();
    }
  });
});