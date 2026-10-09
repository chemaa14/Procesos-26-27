import test from "node:test";
import assert from "node:assert/strict";

import {
  generarHash,
  verificarPassword
} from "../Servidor/passwords.js";

const PASSWORD = "Mi frase secreta para CineMatch";

test("acepta la contraseña correcta y rechaza otra", async () => {
  const hash = await generarHash(PASSWORD);

  assert.notEqual(hash, PASSWORD);
  assert.equal(await verificarPassword(PASSWORD, hash), true);
  assert.equal(
    await verificarPassword("Esta es una contraseña diferente", hash),
    false
  );
});

test("la misma contraseña genera hashes distintos", async () => {
  const primero = await generarHash(PASSWORD);
  const segundo = await generarHash(PASSWORD);

  assert.notEqual(primero, segundo);
  assert.equal(await verificarPassword(PASSWORD, primero), true);
  assert.equal(await verificarPassword(PASSWORD, segundo), true);
});

test("rechaza contraseñas con formato o longitud no válidos", async () => {
  for (const password of [undefined, null, 123, "", "corta", "a".repeat(129)]) {
    await assert.rejects(
      () => generarHash(password),
      /entre 15 y 128 caracteres/
    );
  }
});

test("rechaza hashes ausentes o mal formados", async () => {
  for (const hash of [
    undefined,
    null,
    "",
    "texto-invalido",
    "scrypt-v1$zz$aa",
    `scrypt-v2$${"a".repeat(32)}$${"b".repeat(128)}`
  ]) {
    assert.equal(await verificarPassword(PASSWORD, hash), false);
  }
});

test("conserva los espacios de la contraseña", async () => {
  const password = ` ${PASSWORD} `;
  const hash = await generarHash(password);

  assert.equal(await verificarPassword(password, hash), true);
  assert.equal(await verificarPassword(password.trim(), hash), false);
});