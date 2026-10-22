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
    rol: "usuario",
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
    const confirmado = { ...usuario, confirmado: true, rol: "administrador" };
    await datos.guardar(confirmado);

    assert.equal(await datos.buscarHashPassword(id), hash);

    // Cerrar todas las conexiones y crear un acceso nuevo.
    await pool.end();
    pool = crearPool();
    datos = new DatosUsuariosPostgres(pool);

    assert.deepEqual(await datos.buscarPorId(id), confirmado);
    assert.equal(await datos.buscarHashPassword(id), hash);

    // La restricción impide guardar roles desconocidos.
    await assert.rejects(
      datos.guardar({ ...confirmado, rol: "superadmin" }),
      { code: "23514" }
    );
    assert.deepEqual(await datos.buscarPorId(id), confirmado);

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
// Usa dos pools para representar dos instancias distintas de Cloud Run.
test("PostgreSQL comparte identidad Google, sesiones e intentos de un solo uso", async () => {
  const { LogicaUsuarios } = await import("../Servidor/logica.js");
  const { SesionesPostgres, hashToken } = await import("../Servidor/sesiones-postgres.js");
  const { IntentosOAuthPostgres } = await import("../Servidor/intentos-oauth.js");
  const { crearValorOAuth } = await import("../Servidor/google-oauth.js");
  const idPrueba = randomUUID();
  const perfil = { sub: `prueba-${idPrueba}`, email: `oauth-${idPrueba}@example.com`, nombre: "Google de prueba", emailVerificado: true };
  const poolA = crearPool();
  const poolB = crearPool();
  const datosA = new DatosUsuariosPostgres(poolA);
  const datosB = new DatosUsuariosPostgres(poolB);
  const logicaA = new LogicaUsuarios(datosA);
  const logicaB = new LogicaUsuarios(datosB);
  const sesionesA = new SesionesPostgres(poolA);
  const sesionesB = new SesionesPostgres(poolB);
  const intentosA = new IntentosOAuthPostgres(poolA);
  const intentosB = new IntentosOAuthPostgres(poolB);
  const estado = crearValorOAuth(), navegador = crearValorOAuth();
  const intento = { nonce: crearValorOAuth(), verificador: crearValorOAuth() };
  try {
    const [a, b] = await Promise.all([logicaA.autenticarGoogle(perfil), logicaB.autenticarGoogle(perfil)]);
    assert.equal(a.id, b.id);
    assert.equal(a.confirmado, true);
    assert.equal(a.rol, "usuario");
    assert.equal(await datosB.buscarHashPassword(a.id), null);
    assert.deepEqual(await datosB.buscarPorGoogleSub(perfil.sub), a);
    await assert.rejects(logicaB.autenticarGoogle({ ...perfil, sub: `otro-${idPrueba}` }), { codigo: "OAUTH_CUENTA_EXISTENTE" });

    const token = await sesionesA.crear(a.id);
    assert.equal((await sesionesB.obtener(token)).usuarioId, a.id);
    assert.equal((await poolB.query("SELECT token_hash FROM sesiones WHERE usuario_id=$1", [a.id])).rows[0].token_hash, hashToken(token));
    await sesionesB.eliminar(token);
    assert.equal(await sesionesA.obtener(token), null);
    const token2 = await sesionesA.crear(a.id);
    await poolB.query("UPDATE sesiones SET caduca_en=NOW()-INTERVAL '1 second' WHERE token_hash=$1", [hashToken(token2)]);
    assert.equal(await sesionesA.obtener(token2), null);
    const token3 = await sesionesA.crear(a.id);
    await sesionesB.eliminarDeUsuario(a.id);
    assert.equal(await sesionesA.obtener(token3), null);

    await intentosA.guardar(estado, navegador, intento);
    assert.equal(await intentosB.consumir(estado, crearValorOAuth()), null);
    const consumos = await Promise.all([intentosA.consumir(estado, navegador), intentosB.consumir(estado, navegador)]);
    assert.equal(consumos.filter(Boolean).length, 1);
    assert.deepEqual(consumos.find(Boolean), intento);
    await intentosA.guardar(estado, navegador, intento);
    await poolB.query("UPDATE intentos_oauth SET caduca_en=NOW()-INTERVAL '1 second' WHERE estado_hash=$1", [hashToken(estado)]);
    assert.equal(await intentosB.consumir(estado, navegador), null);

    await datosA.guardar({ ...a, rol: "administrador" });
    assert.equal((await logicaB.autenticarGoogle(perfil)).rol, "administrador");
    await logicaA.eliminar(a.id);
    const nueva = await logicaB.autenticarGoogle(perfil);
    assert.notEqual(nueva.id, a.id);
    assert.equal(nueva.rol, "usuario");
    assert.equal(nueva.confirmado, true);
    assert.equal(nueva.eliminado, false);
    assert.equal((await datosA.buscarPorId(a.id)).eliminado, true);
    assert.equal((await datosA.buscarPorGoogleSub(perfil.sub)).id, nueva.id);
    assert.equal((await logicaA.autenticarGoogle(perfil)).id, nueva.id);
  } finally {
    try {
      await poolA.query("DELETE FROM intentos_oauth WHERE estado_hash=$1", [hashToken(estado)]);
      await poolA.query("DELETE FROM usuarios WHERE email=$1", [perfil.email]);
    } finally { await Promise.all([poolA.end(), poolB.end()]); }
  }
});

test("PostgreSQL confirma una sola vez y controla reenvíos entre conexiones", async () => {
  const { ConfirmacionesPostgres } = await import("../Servidor/confirmaciones-postgres.js");
  const { hashConfirmacion } = await import("../Servidor/confirmaciones.js");
  const pool = crearPool();
  const otroPool = crearPool();
  const datos = new DatosUsuariosPostgres(pool);
  const repo = new ConfirmacionesPostgres(pool);
  const otro = new ConfirmacionesPostgres(otroPool);
  const id = randomUUID();
  const email = `confirmacion-${id}@example.com`;
  const h1 = hashConfirmacion(randomUUID()), h2 = hashConfirmacion(randomUUID());
  try {
    await datos.guardar({ id, nombre: "Confirmación", email, rol: "usuario", confirmado: false, eliminado: false });
    const reservas = await Promise.all([repo.reservar(email, h1), otro.reservar(email, h2)]);
    assert.equal(reservas.filter(Boolean).length, 1);
    const hashInicial = reservas[0] ? h1 : h2;
    assert.equal(await otro.reservar(email, hashConfirmacion(randomUUID())), null);
    await pool.query("UPDATE confirmaciones_correo SET enviado_en = NOW() - INTERVAL '61 seconds' WHERE usuario_id = $1", [id]);
    const nuevo = hashConfirmacion(randomUUID());
    assert.ok(await otro.reservar(email, nuevo));
    assert.equal(await repo.consumir(hashInicial), false);
    await pool.query("UPDATE confirmaciones_correo SET caduca_en = NOW() - INTERVAL '1 second' WHERE usuario_id = $1", [id]);
    assert.equal(await repo.consumir(nuevo), false);
    await pool.query("UPDATE confirmaciones_correo SET caduca_en = NOW() + INTERVAL '1 hour' WHERE usuario_id = $1", [id]);
    await pool.query("UPDATE usuarios SET eliminado = TRUE WHERE id = $1", [id]);
    assert.equal(await repo.consumir(nuevo), false);
    await pool.query("UPDATE usuarios SET eliminado = FALSE WHERE id = $1", [id]);
    const consumos = await Promise.all([repo.consumir(nuevo), otro.consumir(nuevo)]);
    assert.equal(consumos.filter(Boolean).length, 1);
    const usuario = await datos.buscarPorId(id);
    assert.equal(usuario.confirmado, true);
    assert.equal(usuario.rol, "usuario");
    assert.equal(await repo.consumir(nuevo), false);
    assert.equal(await repo.reservar(email, h1), null);
  } finally {
    await pool.query("DELETE FROM usuarios WHERE id = $1", [id]);
    await pool.end(); await otroPool.end();
  }
});

test('PostgreSQL libera correo y Google tras la baja y mantiene unicidad concurrente', async () => {
  const pool = crearPool(); const datos = new DatosUsuariosPostgres(pool);
  const ids = Array.from({length:4}, () => randomUUID());
  const email = `baja-${ids[0]}@example.com`;
  const sub = `sub-${ids[0]}`;
  const usuario = id => ({id,nombre:'Prueba baja',email,rol:'usuario',confirmado:true,eliminado:false});
  try {
    await datos.crearConGoogle(usuario(ids[0]),sub);
    await datos.guardar({...usuario(ids[0]),eliminado:true});
    assert.equal(await datos.buscarPorEmail(email),null);
    assert.equal(await datos.buscarPorGoogleSub(sub),null);
    const resultados = await Promise.allSettled(ids.slice(1,3).map(id => datos.crearConGoogle(usuario(id),sub)));
    assert.equal(resultados.filter(r=>r.status==='fulfilled').length,1);
    const nueva = resultados.find(r=>r.status==='fulfilled').value;
    assert.notEqual(nueva.id,ids[0]);
    await datos.guardar({...nueva,eliminado:true});
    await datos.crearConHash({...usuario(ids[3]),confirmado:false},'hash-nuevo');
    assert.equal((await datos.buscarPorEmail(email)).id,ids[3]);
    assert.equal(await datos.buscarPorGoogleSub(sub),null);
  } finally {
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1::text[])',[ids]);
    await pool.end();
  }
});
