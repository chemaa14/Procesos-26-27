import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearPool } from "../Servidor/conexion.js";
import { PreferenciasPlataformasPostgres } from "../Servidor/preferencias-plataformas-postgres.js";
import { definirContratoPreferencias } from "./contrato-preferencias.js";

async function crearContexto() {
  const pool = crearPool();
  const ids = [randomUUID(), randomUUID()];
  try {
    for (const id of ids) await pool.query(
      "INSERT INTO usuarios(id,nombre,email,confirmado) VALUES($1,'Prueba',$2,TRUE)",
      [id, `${id}@example.invalid`]
    );
  } catch (error) { await pool.end(); throw error; }
  return {
    pool, ids, repositorio: new PreferenciasPlataformasPostgres(pool),
    async eliminar(id) { await pool.query("UPDATE usuarios SET eliminado=TRUE WHERE id=$1", [id]); },
    async crearNuevaCuenta(anterior) {
      const id = randomUUID();
      ids.push(id);
      await pool.query(
        "INSERT INTO usuarios(id,nombre,email,confirmado) SELECT $1,nombre,email,TRUE FROM usuarios WHERE id=$2",
        [id, anterior]);
      return id;
    },
    async cerrar() {
      try { await pool.query("DELETE FROM usuarios WHERE id=ANY($1::text[])", [ids]); }
      finally { await pool.end(); }
    }
  };
}

definirContratoPreferencias(crearContexto);

test("PostgreSQL: preferencias persisten entre pools y reemplazos concurrentes no se mezclan", async () => {
  const ctx = await crearContexto();
  const segundoPool = crearPool();
  try {
    const otro = new PreferenciasPlataformasPostgres(segundoPool);
    const id = ctx.ids[0];
    await ctx.repositorio.guardar(id, [10]);
    assert.deepEqual((await otro.obtener(id)).plataformas, [10]);
    const selecciones = [[20, 21], [30, 31], [40, 41]];
    await Promise.all(selecciones.map((ids, indice) =>
      (indice % 2 ? otro : ctx.repositorio).guardar(id, ids)));
    const resultado = (await otro.obtener(id)).plataformas;
    assert.ok(selecciones.some(ids => JSON.stringify(ids) === JSON.stringify(resultado)));
  } finally { await segundoPool.end(); await ctx.cerrar(); }
});

test("PostgreSQL: un fallo tras borrar hace rollback y libera la conexión", async () => {
  const ctx = await crearContexto();
  try {
    const id = ctx.ids[0];
    await ctx.repositorio.guardar(id, [10, 20]);
    let liberada = false;
    const repoFallido = new PreferenciasPlataformasPostgres({
      async connect() {
        const cliente = await ctx.pool.connect();
        return {
          async query(sql, valores) {
            if (sql.includes("INSERT INTO preferencias_plataformas")) {
              // Fallo SQL real dentro de la transacción, después del DELETE.
              return cliente.query("SELECT 1 / 0");
            }
            return cliente.query(sql, valores);
          },
          release(descartar) { liberada = true; cliente.release(descartar); }
        };
      }
    });
    await assert.rejects(repoFallido.guardar(id, [30]), { code: "22012" });
    assert.equal(liberada, true);
    assert.deepEqual((await ctx.repositorio.obtener(id)).plataformas, [10, 20]);
    await ctx.repositorio.guardar(id, [40]);
    assert.deepEqual((await ctx.repositorio.obtener(id)).plataformas, [40]);
  } finally { await ctx.cerrar(); }
});

test("PostgreSQL: FK, región, ID positivo y unicidad protegen las preferencias", async () => {
  const ctx = await crearContexto();
  try {
    const id = ctx.ids[0];
    const insertar = (usuario, region, proveedor) => ctx.pool.query(
      "INSERT INTO preferencias_plataformas(usuario_id,region,proveedor_id) VALUES($1,$2,$3)",
      [usuario, region, proveedor]);
    await assert.rejects(insertar("desconocido", "ES", 10), { code: "23503" });
    await assert.rejects(insertar(id, "FR", 10), { code: "23514" });
    await assert.rejects(insertar(id, "ES", 0), { code: "23514" });
    await insertar(id, "ES", 10);
    await assert.rejects(insertar(id, "ES", 10), { code: "23505" });
    await ctx.pool.query("DELETE FROM usuarios WHERE id=$1", [id]);
    const { rows } = await ctx.pool.query("SELECT * FROM preferencias_plataformas WHERE usuario_id=$1", [id]);
    assert.equal(rows.length, 0);
  } finally { await ctx.cerrar(); }
});
