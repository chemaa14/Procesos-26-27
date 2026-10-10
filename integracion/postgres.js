import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { crearPool } from "../Servidor/conexion.js";
import { DatosUsuariosPostgres } from "../Servidor/datos-postgres.js";

test("PostgreSQL conserva el usuario y su hash entre conexiones", async () => {
  const id = randomUUID();
  const idDuplicado = randomUUID();

  const usuario = {
    id,
    nombre: "Prueba automática",
    email: `prueba-${id}@example.com`,
    confirmado: false,
    eliminado: false
  };

  // Valor ficticio: esta prueba comprueba almacenamiento, no autenticación.
  const hash = "hash-ficticio-solo-para-prueba-de-almacenamiento";

  let pool = crearPool();

  try {
    let datos = new DatosUsuariosPostgres(pool);

    // Guardar usuario y hash juntos.
    const creado = await datos.crearConHash(usuario, hash);

    assert.deepEqual(creado, usuario);
    assert.equal(await datos.buscarHashPassword(id), hash);

    // Las consultas públicas no incluyen el hash.
    assert.deepEqual(await datos.buscarPorId(id), usuario);
    assert.deepEqual(
      await datos.buscarPorEmail(usuario.email),
      usuario
    );

    const listado = await datos.listar();
    assert.deepEqual(
      listado.find((elemento) => elemento.id === id),
      usuario
    );

    // Un duplicado no crea otra cuenta ni cambia el hash original.
    await assert.rejects(
      () => datos.crearConHash(
        { ...usuario, id: idDuplicado },
        "otro-hash-ficticio"
      ),
      { codigo: "EMAIL_DUPLICADO" }
    );

    assert.equal(await datos.buscarPorId(idDuplicado), null);
    assert.equal(await datos.buscarHashPassword(id), hash);

    // Actualizar el estado debe conservar la contraseña.
    const confirmado = { ...usuario, confirmado: true };
    await datos.guardar(confirmado);

    assert.equal(await datos.buscarHashPassword(id), hash);

    // Cerrar todas las conexiones y crear un acceso nuevo.
    await pool.end();
    pool = crearPool();
    datos = new DatosUsuariosPostgres(pool);

    assert.deepEqual(await datos.buscarPorId(id), confirmado);
    assert.equal(await datos.buscarHashPassword(id), hash);

    // La eliminación lógica también queda guardada.
    const eliminado = { ...confirmado, eliminado: true };
    await datos.guardar(eliminado);

    assert.deepEqual(await datos.buscarPorId(id), eliminado);
  } finally {
    try {
      // Retira exclusivamente los registros de esta ejecución.
      await pool.query(
        "DELETE FROM usuarios WHERE id IN ($1, $2)",
        [id, idDuplicado]
      );
    } finally {
      await pool.end();
    }
  }
});