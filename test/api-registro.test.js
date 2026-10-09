import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { crearAplicacion } from "../Servidor/api.js";

const PASSWORD = "Mi frase secreta para CineMatch";

async function conServidor(comprobar) {
  // El registro debe funcionar incluso sin token administrativo.
  const { servidor, logica } = crearAplicacion({ tokenAdmin: "" });

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

function registrar(base, datos) {
  return fetch(`${base}/api/registro`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(datos)
  });
}

test("el registro público crea una cuenta pendiente sin devolver credenciales", async () => {
  await conServidor(async (base, logica) => {
    const respuesta = await registrar(base, {
      nombre: "Ana",
      email: "ana@example.com",
      password: PASSWORD,
      confirmado: true,
      eliminado: true,
      rol: "admin"
    });

    assert.equal(respuesta.status, 201);

    const { usuario } = await respuesta.json();

    assert.equal(usuario.nombre, "Ana");
    assert.equal(usuario.email, "ana@example.com");
    assert.equal(usuario.confirmado, false);
    assert.equal(usuario.eliminado, false);
    assert.equal(logica.estaActivo(usuario.id), false);

    assert.deepEqual(
      Object.keys(usuario).sort(),
      ["id", "nombre", "email", "confirmado", "eliminado"].sort()
    );
  });
});

test("el registro responde 400 ante una contraseña inválida", async () => {
  await conServidor(async (base, logica) => {
    const respuesta = await registrar(base, {
      nombre: "Ana",
      email: "ana@example.com",
      password: "corta"
    });

    assert.equal(respuesta.status, 400);

    const cuerpo = await respuesta.json();

    assert.equal(cuerpo.codigo, "PASSWORD_INVALIDA");
    assert.deepEqual(logica.listar(), []);
  });
});

test("el registro responde 409 cuando el correo ya existe", async () => {
  await conServidor(async (base, logica) => {
    const datos = {
      nombre: "Ana",
      email: "ana@example.com",
      password: PASSWORD
    };

    const primera = await registrar(base, datos);
    assert.equal(primera.status, 201);
    await primera.json();

    const duplicada = await registrar(base, {
      ...datos,
      email: " ANA@example.com "
    });

    assert.equal(duplicada.status, 409);

    const cuerpo = await duplicada.json();

    assert.equal(cuerpo.codigo, "EMAIL_DUPLICADO");
    assert.equal(logica.listar().length, 1);
  });
});