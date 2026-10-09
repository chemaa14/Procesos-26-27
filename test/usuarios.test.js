import test from "node:test";
import assert from "node:assert/strict";
import { DatosUsuarios } from "../Servidor/datos.js";
import {
  LogicaUsuarios,
  ErrorUsuarios
} from "../Servidor/logica.js";

function crearLogica() {
  return new LogicaUsuarios(new DatosUsuarios());
}

function comprobarError(operacion, codigo) {
  assert.throws(
    operacion,
    (error) =>
      error instanceof ErrorUsuarios &&
      error.codigo === codigo
  );
}

test("El alta guarda un usuario pendiente y normaliza sus datos", () => {
  const logica = crearLogica();

  const usuario = logica.alta({
    nombre: "  Ana  ",
    email: "  ANA@example.com  "
  });

  assert.ok(usuario.id);
  assert.equal(usuario.nombre, "Ana");
  assert.equal(usuario.email, "ana@example.com");
  assert.equal(usuario.confirmado, false);
  assert.equal(usuario.eliminado, false);
  assert.deepEqual(logica.obtener(usuario.id), usuario);
  assert.equal(logica.estaActivo(usuario.id), false);
});

test("El alta rechaza un nombre vacío", () => {
  const logica = crearLogica();

  comprobarError(
    () => logica.alta({ nombre: " ", email: "ana@example.com" }),
    "NOMBRE_INVALIDO"
  );

  assert.deepEqual(logica.listar(), []);
});

test("El alta rechaza un correo inválido", () => {
  const logica = crearLogica();

  comprobarError(
    () => logica.alta({ nombre: "Ana", email: "correo-invalido" }),
    "EMAIL_INVALIDO"
  );

  assert.deepEqual(logica.listar(), []);
});

test("No admite correos duplicados aunque cambien mayúsculas o espacios", () => {
  const logica = crearLogica();

  logica.alta({ nombre: "Ana", email: "ana@example.com" });

  comprobarError(
    () => logica.alta({
      nombre: "Otra Ana",
      email: " ANA@EXAMPLE.COM "
    }),
    "EMAIL_DUPLICADO"
  );

  assert.equal(logica.listar().length, 1);
});

test("El listado devuelve los usuarios registrados", () => {
  const logica = crearLogica();
  assert.deepEqual(logica.listar(), []);

  const ana = logica.alta({
    nombre: "Ana",
    email: "ana@example.com"
  });

  const luis = logica.alta({
    nombre: "Luis",
    email: "luis@example.com"
  });

  assert.deepEqual(logica.listar(), [ana, luis]);
});

test("Un usuario confirmado pasa a estar activo", () => {
  const logica = crearLogica();
  const usuario = logica.alta({
    nombre: "Ana",
    email: "ana@example.com"
  });

  logica.confirmar(usuario.id);

  assert.equal(logica.estaActivo(usuario.id), true);
});

test("Eliminar un usuario lo desactiva y lo excluye del listado", () => {
  const logica = crearLogica();
  const usuario = logica.alta({
    nombre: "Ana",
    email: "ana@example.com"
  });

  logica.confirmar(usuario.id);
  logica.eliminar(usuario.id);

  assert.equal(logica.estaActivo(usuario.id), false);
  assert.equal(logica.obtener(usuario.id).eliminado, true);
  assert.deepEqual(logica.listar(), []);
});

test("Consultar el estado o eliminar un usuario inexistente produce un error", () => {
  const logica = crearLogica();

  comprobarError(
    () => logica.estaActivo("no-existe"),
    "USUARIO_NO_ENCONTRADO"
  );

  comprobarError(
    () => logica.eliminar("no-existe"),
    "USUARIO_NO_ENCONTRADO"
  );
});

test("No se puede confirmar un usuario eliminado", () => {
  const logica = crearLogica();
  const usuario = logica.alta({
    nombre: "Ana",
    email: "ana@example.com"
  });

  logica.eliminar(usuario.id);

  comprobarError(
    () => logica.confirmar(usuario.id),
    "USUARIO_ELIMINADO"
  );

  assert.equal(logica.estaActivo(usuario.id), false);
});

test("Modificar un objeto devuelto no altera los datos almacenados", () => {
  const logica = crearLogica();
  const usuario = logica.alta({
    nombre: "Ana",
    email: "ana@example.com"
  });

  usuario.confirmado = true;
  const listado = logica.listar();
  listado[0].nombre = "Nombre modificado";

  assert.equal(logica.estaActivo(usuario.id), false);
  assert.equal(logica.obtener(usuario.id).nombre, "Ana");
});