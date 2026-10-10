import test from "node:test";
import assert from "node:assert/strict";

import { Sesiones } from "../Servidor/sesiones.js";

test("crea una sesión asociada al usuario", () => {
  const sesiones = new Sesiones({
    reloj: () => 1000,
    duracionMs: 5000
  });

  const token = sesiones.crear("usuario-1");

  assert.match(token, /^[a-f0-9]{64}$/);

  assert.deepEqual(sesiones.obtener(token), {
    usuarioId: "usuario-1",
    caducaEn: 6000
  });
});

test("crea identificadores diferentes incluso para el mismo usuario", () => {
  const sesiones = new Sesiones();

  const primero = sesiones.crear("usuario-1");
  const segundo = sesiones.crear("usuario-1");

  assert.notEqual(primero, segundo);
  assert.equal(sesiones.obtener(primero).usuarioId, "usuario-1");
  assert.equal(sesiones.obtener(segundo).usuarioId, "usuario-1");
});

test("rechaza sesiones desconocidas", () => {
  const sesiones = new Sesiones();

  assert.equal(sesiones.obtener("inventada"), null);
  assert.equal(sesiones.obtener(undefined), null);
});

test("rechaza la sesión al alcanzar su caducidad", () => {
  let ahora = 1000;

  const sesiones = new Sesiones({
    reloj: () => ahora,
    duracionMs: 5000
  });

  const token = sesiones.crear("usuario-1");

  ahora = 5999;
  assert.notEqual(sesiones.obtener(token), null);

  ahora = 6000;
  assert.equal(sesiones.obtener(token), null);
});

test("cerrar una sesión invalida su identificador", () => {
  const sesiones = new Sesiones();

  const token = sesiones.crear("usuario-1");

  sesiones.eliminar(token);

  assert.equal(sesiones.obtener(token), null);
  assert.doesNotThrow(() => sesiones.eliminar(token));
});

test("elimina todas las sesiones de un usuario sin afectar a otro", () => {
  const sesiones = new Sesiones();

  const primera = sesiones.crear("usuario-1");
  const segunda = sesiones.crear("usuario-1");
  const otra = sesiones.crear("usuario-2");

  sesiones.eliminarDeUsuario("usuario-1");

  assert.equal(sesiones.obtener(primera), null);
  assert.equal(sesiones.obtener(segunda), null);
  assert.equal(sesiones.obtener(otra).usuarioId, "usuario-2");
});

test("modificar una sesión devuelta no altera la almacenada", () => {
  const sesiones = new Sesiones();
  const token = sesiones.crear("usuario-1");

  const copia = sesiones.obtener(token);
  copia.usuarioId = "otro-usuario";
  copia.caducaEn = 0;

  assert.equal(sesiones.obtener(token).usuarioId, "usuario-1");
  assert.notEqual(sesiones.obtener(token).caducaEn, 0);
});