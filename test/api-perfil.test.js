import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { crearAplicacion } from "../Servidor/api.js";

const PASSWORD = "Mi frase secreta para CineMatch";
const TOKEN_ADMIN = "token-ficticio-solo-para-pruebas";

async function conServidor(comprobar) {
  const { servidor, logica } = crearAplicacion({
    tokenAdmin: TOKEN_ADMIN,
    cookieSegura: false
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

async function crearUsuario(logica, email = "ana@example.com") {
  const usuario = await logica.registrar({
    nombre: "Usuario de prueba",
    email,
    password: PASSWORD
  });

  (await logica.confirmar(usuario.id));

  return usuario;
}

async function iniciarSesion(base, email = "ana@example.com") {
  const respuesta = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CineMatch": "1"
    },
    body: JSON.stringify({
      email,
      password: PASSWORD
    })
  });

  assert.equal(respuesta.status, 200);

  const cabecera = respuesta.headers.get("set-cookie");
  assert.ok(cabecera);

  await respuesta.json();

  return cabecera.split(";")[0];
}

async function comprobarEstado(base, ruta, cookie, estado) {
  const respuesta = await fetch(`${base}${ruta}`, {
    headers: { Cookie: cookie }
  });

  assert.equal(respuesta.status, estado);
  await respuesta.json();
}

test("el perfil devuelve solo los datos del usuario conectado", async () => {
  await conServidor(async (base, logica) => {
    const usuario = await crearUsuario(logica);
    const cookie = await iniciarSesion(base);

    const respuesta = await fetch(`${base}/api/perfil`, {
      headers: { Cookie: cookie }
    });

    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.headers.get("cache-control"), "no-store");

    const cuerpo = await respuesta.json();

    assert.equal(cuerpo.usuario.id, usuario.id);
    assert.equal(cuerpo.usuario.email, usuario.email);

    assert.deepEqual(
      Object.keys(cuerpo.usuario).sort(),
      ["id", "nombre", "email", "confirmado", "eliminado"].sort()
    );
  });
});

test("consultar o eliminar el perfil requiere una sesión válida", async () => {
  await conServidor(async (base, logica) => {
    const usuario = await crearUsuario(logica);

    for (const metodo of ["GET", "DELETE"]) {
      for (const cookie of [
        null,
        `cinematch_sesion=${"a".repeat(64)}`
      ]) {
        const respuesta = await fetch(`${base}/api/perfil`, {
          method: metodo,
          headers: {
            "X-CineMatch": "1",
            ...(cookie ? { Cookie: cookie } : {})
          }
        });

        assert.equal(respuesta.status, 401);
        await respuesta.json();
      }
    }

    assert.equal((await logica.estaActivo(usuario.id)), true);
  });
});

test("eliminar el perfil revoca todas sus sesiones y borra la cookie", async () => {
  await conServidor(async (base, logica) => {
    const usuario = await crearUsuario(logica);

    // Dos logins sin cookie previa simulan dos navegadores.
    const primeraCookie = await iniciarSesion(base);
    const segundaCookie = await iniciarSesion(base);

    await comprobarEstado(base, "/api/perfil", primeraCookie, 200);
    await comprobarEstado(base, "/api/perfil", segundaCookie, 200);

    const respuesta = await fetch(`${base}/api/perfil`, {
      method: "DELETE",
      headers: {
        Cookie: primeraCookie,
        "X-CineMatch": "1"
      }
    });

    assert.equal(respuesta.status, 204);
    assert.equal(await respuesta.text(), "");
    assert.match(
      respuesta.headers.get("set-cookie"),
      /;\s*Max-Age=0(?:;|$)/
    );

    assert.equal((await logica.obtener(usuario.id)).eliminado, true);
    assert.equal((await logica.estaActivo(usuario.id)), false);
    assert.deepEqual((await logica.listar()), []);

    for (const cookie of [primeraCookie, segundaCookie]) {
      await comprobarEstado(base, "/api/perfil", cookie, 401);
      await comprobarEstado(base, "/api/sesion", cookie, 401);
    }
  });
});

test("rechaza la eliminación sin cabecera de protección y conserva la cuenta", async () => {
  await conServidor(async (base, logica) => {
    const usuario = await crearUsuario(logica);
    const cookie = await iniciarSesion(base);

    const respuesta = await fetch(`${base}/api/perfil`, {
      method: "DELETE",
      headers: { Cookie: cookie }
    });

    assert.equal(respuesta.status, 403);
    await respuesta.json();

    assert.equal((await logica.estaActivo(usuario.id)), true);
    await comprobarEstado(base, "/api/perfil", cookie, 200);
  });
});

test("un identificador en la URL no permite eliminar otra cuenta desde el perfil", async () => {
  await conServidor(async (base, logica) => {
    const ana = await crearUsuario(logica);
    const otro = await crearUsuario(logica, "otro@example.com");

    const cookieAna = await iniciarSesion(base);
    const cookieOtro = await iniciarSesion(base, "otro@example.com");

    const respuesta = await fetch(
      `${base}/api/perfil?id=${otro.id}`,
      {
        method: "DELETE",
        headers: {
          Cookie: cookieAna,
          "X-CineMatch": "1"
        }
      }
    );

    assert.equal(respuesta.status, 204);
    await respuesta.text();

    // La identidad procede de la sesión, no del parámetro id.
    assert.equal((await logica.obtener(ana.id)).eliminado, true);
    assert.equal((await logica.estaActivo(otro.id)), true);

    await comprobarEstado(base, "/api/perfil", cookieOtro, 200);
  });
});

test("una sesión normal no autoriza a eliminar otra cuenta por la ruta administrativa", async () => {
  await conServidor(async (base, logica) => {
    const ana = await crearUsuario(logica);
    const otro = await crearUsuario(logica, "otro@example.com");
    const cookie = await iniciarSesion(base);

    const respuesta = await fetch(
      `${base}/api/usuarios/${otro.id}`,
      {
        method: "DELETE",
        headers: {
          Cookie: cookie,
          "X-CineMatch": "1"
        }
      }
    );

    assert.equal(respuesta.status, 401);
    await respuesta.json();

    assert.equal((await logica.estaActivo(ana.id)), true);
    assert.equal((await logica.estaActivo(otro.id)), true);
  });
});

test("la eliminación administrativa también impide usar las sesiones de la cuenta", async () => {
  await conServidor(async (base, logica) => {
    const usuario = await crearUsuario(logica);
    const cookie = await iniciarSesion(base);

    const respuesta = await fetch(
      `${base}/api/usuarios/${usuario.id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${TOKEN_ADMIN}`
        }
      }
    );

    assert.equal(respuesta.status, 204);
    await respuesta.text();

    assert.equal((await logica.obtener(usuario.id)).eliminado, true);
    await comprobarEstado(base, "/api/perfil", cookie, 401);
    await comprobarEstado(base, "/api/sesion", cookie, 401);
  });
});

test("el perfil rechaza métodos no permitidos sin modificar la cuenta", async () => {
  await conServidor(async (base, logica) => {
    const usuario = await crearUsuario(logica);
    const cookie = await iniciarSesion(base);

    const respuesta = await fetch(`${base}/api/perfil`, {
      method: "PUT",
      headers: {
        Cookie: cookie,
        "X-CineMatch": "1"
      }
    });

    assert.equal(respuesta.status, 405);
    assert.equal(respuesta.headers.get("allow"), "GET, DELETE");
    await respuesta.json();

    assert.equal((await logica.estaActivo(usuario.id)), true);
  });
});