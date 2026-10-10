import test from "node:test";
import assert from "node:assert/strict";

import { DatosUsuarios } from "../Servidor/datos.js";
import { LogicaUsuarios } from "../Servidor/logica.js";

const PASSWORD = "Mi frase secreta para CineMatch";

const ERROR_ACCESO = {
  codigo: "CREDENCIALES_INVALIDAS",
  message: "No se ha podido iniciar sesión con esas credenciales."
};

async function prepararUsuario() {
  const datos = new DatosUsuarios();
  const logica = new LogicaUsuarios(datos);

  const usuario = await logica.registrar({
    nombre: "Ana",
    email: "ana@example.com",
    password: PASSWORD
  });

  return { logica, usuario };
}

test("autentica una cuenta confirmada con la contraseña correcta", async () => {
  const { logica, usuario } = await prepararUsuario();
  (await logica.confirmar(usuario.id));

  const resultado = await logica.autenticar({
    email: " ANA@example.com ",
    password: PASSWORD
  });

  assert.equal(resultado.id, usuario.id);

  assert.deepEqual(
    Object.keys(resultado).sort(),
    ["id", "nombre", "email", "confirmado", "eliminado"].sort()
  );
});

test("rechaza una cuenta pendiente aunque la contraseña sea correcta", async () => {
  const { logica } = await prepararUsuario();

  await assert.rejects(
    () => logica.autenticar({
      email: "ana@example.com",
      password: PASSWORD
    }),
    ERROR_ACCESO
  );
});

test("rechaza una cuenta eliminada aunque estuviera confirmada", async () => {
  const { logica, usuario } = await prepararUsuario();

  (await logica.confirmar(usuario.id));
  (await logica.eliminar(usuario.id));

  await assert.rejects(
    () => logica.autenticar({
      email: "ana@example.com",
      password: PASSWORD
    }),
    ERROR_ACCESO
  );
});

test("usa el mismo error para correo inexistente y contraseña incorrecta", async () => {
  const { logica, usuario } = await prepararUsuario();
  (await logica.confirmar(usuario.id));

  for (const credenciales of [
    {
      email: "noexiste@example.com",
      password: PASSWORD
    },
    {
      email: "ana@example.com",
      password: "Una contraseña distinta de la correcta"
    }
  ]) {
    await assert.rejects(
      () => logica.autenticar(credenciales),
      ERROR_ACCESO
    );
  }
});

test("rechaza credenciales ausentes o con tipos incorrectos", async () => {
  const logica = new LogicaUsuarios(new DatosUsuarios());

  for (const credenciales of [
    undefined,
    {},
    { email: 123, password: PASSWORD },
    { email: "ana@example.com", password: null }
  ]) {
    await assert.rejects(
      () => logica.autenticar(credenciales),
      ERROR_ACCESO
    );
  }
});