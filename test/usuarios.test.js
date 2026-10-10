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

async function comprobarError(operacion, codigo) {
  await assert.rejects(
    operacion,
    (error) =>
      error instanceof ErrorUsuarios &&
      error.codigo === codigo
  );
}

test("El alta guarda un usuario pendiente y normaliza sus datos", async () => {
  const logica = crearLogica();

  const usuario = await logica.alta({
    nombre: "  Ana  ",
    email: "  ANA@example.com  "
  });

  assert.ok(usuario.id);
  assert.equal(usuario.nombre, "Ana");
  assert.equal(usuario.email, "ana@example.com");
  assert.equal(usuario.confirmado, false);
  assert.equal(usuario.eliminado, false);
  assert.deepEqual((await logica.obtener(usuario.id)), usuario);
  assert.equal((await logica.estaActivo(usuario.id)), false);
});

test("El alta rechaza un nombre vacío", async () => {
  const logica = crearLogica();

  await comprobarError(
    async () => await logica.alta({ nombre: " ", email: "ana@example.com" }),
    "NOMBRE_INVALIDO"
  );

  assert.deepEqual((await logica.listar()), []);
});

test("El alta rechaza un correo inválido", async () => {
  const logica = crearLogica();

  await comprobarError(
    async () => await logica.alta({ nombre: "Ana", email: "correo-invalido" }),
    "EMAIL_INVALIDO"
  );

  assert.deepEqual((await logica.listar()), []);
});

test("No admite correos duplicados aunque cambien mayúsculas o espacios", async () => {
  const logica = crearLogica();

  await logica.alta({ nombre: "Ana", email: "ana@example.com" });

  await comprobarError(
    async () => await logica.alta({
      nombre: "Otra Ana",
      email: " ANA@EXAMPLE.COM "
    }),
    "EMAIL_DUPLICADO"
  );

  assert.equal((await logica.listar()).length, 1);
});

test("El listado devuelve los usuarios registrados", async () => {
  const logica = crearLogica();
  assert.deepEqual((await logica.listar()), []);

  const ana = await logica.alta({
    nombre: "Ana",
    email: "ana@example.com"
  });

  const luis = await logica.alta({
    nombre: "Luis",
    email: "luis@example.com"
  });

  assert.deepEqual((await logica.listar()), [ana, luis]);
});

test("Un usuario confirmado pasa a estar activo", async () => {
  const logica = crearLogica();
  const usuario = await logica.alta({
    nombre: "Ana",
    email: "ana@example.com"
  });

  (await logica.confirmar(usuario.id));

  assert.equal((await logica.estaActivo(usuario.id)), true);
});

test("Eliminar un usuario lo desactiva y lo excluye del listado", async () => {
  const logica = crearLogica();
  const usuario = await logica.alta({
    nombre: "Ana",
    email: "ana@example.com"
  });

  (await logica.confirmar(usuario.id));
  (await logica.eliminar(usuario.id));

  assert.equal((await logica.estaActivo(usuario.id)), false);
  assert.equal((await logica.obtener(usuario.id)).eliminado, true);
  assert.deepEqual((await logica.listar()), []);
});

test("Consultar el estado o eliminar un usuario inexistente produce un error", async () => {
  const logica = crearLogica();

  await comprobarError(
    async () => (await logica.estaActivo("no-existe")),
    "USUARIO_NO_ENCONTRADO"
  );

  await comprobarError(
    async () => (await logica.eliminar("no-existe")),
    "USUARIO_NO_ENCONTRADO"
  );
});

test("No se puede confirmar un usuario eliminado", async () => {
  const logica = crearLogica();
  const usuario = await logica.alta({
    nombre: "Ana",
    email: "ana@example.com"
  });

  (await logica.eliminar(usuario.id));

  await comprobarError(
    async () => (await logica.confirmar(usuario.id)),
    "USUARIO_ELIMINADO"
  );

  assert.equal((await logica.estaActivo(usuario.id)), false);
});

test("Modificar un objeto devuelto no altera los datos almacenados", async () => {
  const logica = crearLogica();
  const usuario = await logica.alta({
    nombre: "Ana",
    email: "ana@example.com"
  });

  usuario.confirmado = true;
  const listado = (await logica.listar());
  listado[0].nombre = "Nombre modificado";

  assert.equal((await logica.estaActivo(usuario.id)), false);
  assert.equal((await logica.obtener(usuario.id)).nombre, "Ana");
});