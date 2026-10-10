import test from "node:test";
import assert from "node:assert/strict";
import { crearAplicacion } from "../Servidor/api.js";

const TOKEN_PRUEBAS = "clave-ficticia-solo-para-pruebas";

async function conServidor(comprobar, tokenAdmin = TOKEN_PRUEBAS) {
  const { servidor, logica } = crearAplicacion({ tokenAdmin });

  await new Promise((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(0, "127.0.0.1", resolve);
  });

  const base = `http://127.0.0.1:${servidor.address().port}`;

  async function pedir(ruta, opciones = {}) {
    const { headers = {}, ...resto } = opciones;

    return fetch(`${base}${ruta}`, {
      ...resto,
      headers: {
        Authorization: `Bearer ${TOKEN_PRUEBAS}`,
        ...headers
      }
    });
  }

  try {
    await comprobar({ pedir, logica });
  } finally {
    servidor.closeAllConnections();
    await new Promise((resolve) => servidor.close(resolve));
  }
}

function alta(pedir, datos = {
  nombre: "Ana",
  email: "ana@example.com"
}) {
  return pedir("/api/usuarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos)
  });
}

test("API: el alta devuelve 201 y un usuario pendiente", async () => {
  await conServidor(async ({ pedir }) => {
    const respuesta = await alta(pedir, {
      nombre: "Ana",
      email: "ana@example.com",
      confirmado: true,
      eliminado: true
    });

    assert.equal(respuesta.status, 201);

    const { usuario } = await respuesta.json();

    assert.ok(usuario.id);
    assert.equal(usuario.email, "ana@example.com");
    assert.equal(usuario.confirmado, false);
    assert.equal(usuario.eliminado, false);
  });
});

test("API: el listado incluye al usuario creado", async () => {
  await conServidor(async ({ pedir }) => {
    const creada = await alta(pedir);
    const { usuario } = await creada.json();

    const respuesta = await pedir("/api/usuarios");

    assert.equal(respuesta.status, 200);
    assert.deepEqual(await respuesta.json(), {
      usuarios: [usuario]
    });
  });
});

test("API: consulta el estado pendiente y confirmado", async () => {
  await conServidor(async ({ pedir, logica }) => {
    const creada = await alta(pedir);
    const { usuario } = await creada.json();
    const ruta = `/api/usuarios/${usuario.id}/activo`;

    const pendiente = await pedir(ruta);
    assert.equal(pendiente.status, 200);
    assert.deepEqual(await pendiente.json(), { activo: false });

    // Confirmación interna: no existe una ruta pública para hacerlo.
    (await logica.confirmar(usuario.id));

    const confirmada = await pedir(ruta);
    assert.equal(confirmada.status, 200);
    assert.deepEqual(await confirmada.json(), { activo: true });
  });
});

test("API: eliminar devuelve 204 y retira al usuario del listado", async () => {
  await conServidor(async ({ pedir, logica }) => {
    const creada = await alta(pedir);
    const { usuario } = await creada.json();
    (await logica.confirmar(usuario.id));

    const respuesta = await pedir(`/api/usuarios/${usuario.id}`, {
      method: "DELETE"
    });

    assert.equal(respuesta.status, 204);
    assert.equal(await respuesta.text(), "");

    const listado = await pedir("/api/usuarios");
    assert.deepEqual(await listado.json(), { usuarios: [] });

    const estado = await pedir(
      `/api/usuarios/${usuario.id}/activo`
    );
    assert.deepEqual(await estado.json(), { activo: false });
  });
});

test("API: los datos inválidos devuelven 400", async () => {
  await conServidor(async ({ pedir }) => {
    const casos = [
      [{ nombre: "", email: "ana@example.com" }, "NOMBRE_INVALIDO"],
      [{ nombre: "Ana", email: "incorrecto" }, "EMAIL_INVALIDO"]
    ];

    for (const [datos, codigo] of casos) {
      const respuesta = await alta(pedir, datos);

      assert.equal(respuesta.status, 400);
      assert.equal((await respuesta.json()).codigo, codigo);
    }
  });
});

test("API: un correo duplicado devuelve 409", async () => {
  await conServidor(async ({ pedir }) => {
    await alta(pedir);

    const respuesta = await alta(pedir, {
      nombre: "Otra Ana",
      email: " ANA@EXAMPLE.COM "
    });

    assert.equal(respuesta.status, 409);
    assert.equal(
      (await respuesta.json()).codigo,
      "EMAIL_DUPLICADO"
    );
  });
});

test("API: consultar o eliminar un usuario inexistente devuelve 404", async () => {
  await conServidor(async ({ pedir }) => {
    const respuestas = [
      await pedir("/api/usuarios/no-existe/activo"),
      await pedir("/api/usuarios/no-existe", { method: "DELETE" })
    ];

    for (const respuesta of respuestas) {
      assert.equal(respuesta.status, 404);
      assert.equal(
        (await respuesta.json()).codigo,
        "USUARIO_NO_ENCONTRADO"
      );
    }
  });
});

test("API: rechaza JSON mal formado y valores que no sean objetos", async () => {
  await conServidor(async ({ pedir }) => {
    for (const body of ["{", "null", "[]", '"texto"']) {
      const respuesta = await pedir("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });

      assert.equal(respuesta.status, 400);
    }

    const listado = await pedir("/api/usuarios");
    assert.deepEqual(await listado.json(), { usuarios: [] });
  });
});

test("API: un formato distinto de JSON devuelve 415", async () => {
  await conServidor(async ({ pedir }) => {
    const respuesta = await pedir("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "nombre=Ana"
    });

    assert.equal(respuesta.status, 415);
  });
});

test("API: un cuerpo demasiado grande devuelve 413", async () => {
  await conServidor(async ({ pedir }) => {
    const respuesta = await alta(pedir, {
      nombre: "a".repeat(17 * 1024),
      email: "ana@example.com"
    });

    assert.equal(respuesta.status, 413);

    const listado = await pedir("/api/usuarios");
    assert.deepEqual(await listado.json(), { usuarios: [] });
  });
});

test("API: todas las operaciones rechazan credenciales ausentes o incorrectas", async () => {
  await conServidor(async ({ pedir, logica }) => {
    const usuario = await logica.alta({
      nombre: "Ana",
      email: "ana@example.com"
    });

    const operaciones = [
      ["/api/usuarios", "GET"],
      ["/api/usuarios", "POST"],
      [`/api/usuarios/${usuario.id}/activo`, "GET"],
      [`/api/usuarios/${usuario.id}`, "DELETE"]
    ];

    for (const Authorization of ["", "Bearer incorrecto"]) {
      for (const [ruta, method] of operaciones) {
        const respuesta = await pedir(ruta, {
          method,
          headers: { Authorization }
        });

        assert.equal(respuesta.status, 401);
        assert.equal(
          respuesta.headers.get("www-authenticate"),
          "Bearer"
        );
      }
    }

    assert.equal((await logica.listar()).length, 1);
    assert.equal((await logica.obtener(usuario.id)).eliminado, false);
  });
});

test("API: sin clave configurada bloquea usuarios pero mantiene health", async () => {
  await conServidor(async ({ pedir }) => {
    const respuesta = await pedir("/api/usuarios");
    assert.equal(respuesta.status, 503);

    const health = await pedir("/api/health", {
      headers: { Authorization: "" }
    });

    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      ok: true,
      aplicacion: "CineMatch"
    });
  }, "");
});

test("API: un método no permitido devuelve 405 y la cabecera Allow", async () => {
  await conServidor(async ({ pedir }) => {
    const respuesta = await pedir("/api/usuarios", {
      method: "PUT"
    });

    assert.equal(respuesta.status, 405);
    assert.equal(respuesta.headers.get("allow"), "GET, POST");
  });
});