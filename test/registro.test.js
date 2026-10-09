import test from "node:test";
import assert from "node:assert/strict";

import { DatosUsuarios } from "../Servidor/datos.js";
import { LogicaUsuarios } from "../Servidor/logica.js";
import { verificarPassword } from "../Servidor/passwords.js";

const PASSWORD = "Mi frase secreta para CineMatch";

function preparar() {
  const datos = new DatosUsuarios();
  const logica = new LogicaUsuarios(datos);

  return { datos, logica };
}

test("registra un usuario pendiente y almacena su hash por separado", async () => {
  const { datos, logica } = preparar();

  const usuario = await logica.registrar({
    nombre: " Ana ",
    email: " ANA@example.com ",
    password: PASSWORD
  });

  assert.equal(usuario.nombre, "Ana");
  assert.equal(usuario.email, "ana@example.com");
  assert.equal(usuario.confirmado, false);
  assert.equal(logica.estaActivo(usuario.id), false);

  const hash = datos.buscarHashPassword(usuario.id);

  assert.equal(typeof hash, "string");
  assert.notEqual(hash, PASSWORD);
  assert.equal(await verificarPassword(PASSWORD, hash), true);

  // Ninguna consulta de usuarios debe devolver credenciales.
  for (const resultado of [
    usuario,
    logica.obtener(usuario.id),
    ...logica.listar(),
    datos.buscarPorId(usuario.id),
    datos.buscarPorEmail(usuario.email),
    ...datos.listar()
  ]) {
    assert.deepEqual(
      Object.keys(resultado).sort(),
      ["id", "nombre", "email", "confirmado", "eliminado"].sort()
    );
  }
});

test("rechaza una contraseña inválida sin crear el usuario", async () => {
  const { logica } = preparar();

  await assert.rejects(
    () => logica.registrar({
      nombre: "Ana",
      email: "ana@example.com",
      password: "corta"
    }),
    { codigo: "PASSWORD_INVALIDA" }
  );

  assert.deepEqual(logica.listar(), []);
});

test("rechaza un registro duplicado sin cambiar la contraseña original", async () => {
  const { datos, logica } = preparar();

  const usuario = await logica.registrar({
    nombre: "Ana",
    email: "ana@example.com",
    password: PASSWORD
  });

  const hashOriginal = datos.buscarHashPassword(usuario.id);

  await assert.rejects(
    () => logica.registrar({
      nombre: "Otra Ana",
      email: " ANA@example.com ",
      password: "Una contraseña completamente distinta"
    }),
    { codigo: "EMAIL_DUPLICADO" }
  );

  assert.equal(logica.listar().length, 1);
  assert.equal(
    datos.buscarHashPassword(usuario.id),
    hashOriginal
  );
});