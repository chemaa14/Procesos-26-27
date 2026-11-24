import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearPool } from "../Servidor/conexion.js";
import { ListasPeliculasPostgres } from "../Servidor/listas-peliculas-postgres.js";
import { definirContratoListas } from "./contrato-listas.js";

async function crearContexto() {
  const pool = crearPool();
  const ids = [randomUUID(), randomUUID()];
  try {
    for (const id of ids) {
      await pool.query(
        "INSERT INTO usuarios(id,nombre,email,confirmado) VALUES($1,'Prueba',$2,TRUE)",
        [id, `${id}@example.invalid`]
      );
    }
  } catch (error) {
    await pool.end();
    throw error;
  }

  return {
    pool,
    ids,
    repositorio: new ListasPeliculasPostgres(pool),
    async eliminar(id) {
      await pool.query("UPDATE usuarios SET eliminado=TRUE WHERE id=$1", [id]);
    },
    async crearNuevaCuenta(anterior) {
      const id = randomUUID();
      ids.push(id);
      await pool.query(
        "INSERT INTO usuarios(id,nombre,email,confirmado) SELECT $1,nombre,email,TRUE FROM usuarios WHERE id=$2",
        [id, anterior]
      );
      return id;
    },
    async cerrar() {
      try {
        await pool.query("DELETE FROM usuarios WHERE id=ANY($1::text[])", [ids]);
      } finally {
        await pool.end();
      }
    }
  };
}

definirContratoListas(crearContexto);

test("PostgreSQL: listas persisten entre pools independientes", async () => {
  const ctx = await crearContexto();
  const segundoPool = crearPool();
  try {
    const otro = new ListasPeliculasPostgres(segundoPool);
    const id = ctx.ids[0];
    await ctx.repositorio.guardar(
      id,
      {
        peliculaId: 603,
        estado: "quiero_ver",
        titulo: "Matrix",
        anio: 1999,
        cartel: null
      },
      {
        disponibleEnPlataformas: false,
        plataformasCoincidentes: []
      }
    );

    const lectura = await otro.listar(id);
    assert.equal(lectura.elementos.length, 1);
    assert.equal(lectura.elementos[0].peliculaId, 603);
    assert.equal(lectura.elementos[0].disponibleEnPlataformas, false);

    await ctx.repositorio.actualizarDisponibilidad(id, 603, {
      disponibleEnPlataformas: true,
      plataformasCoincidentes: [{ id: 8, nombre: "Netflix", logo: null }]
    });

    const trasActualizar = await otro.listar(id);
    assert.equal(trasActualizar.elementos[0].disponibleEnPlataformas, true);
    assert.equal(trasActualizar.elementos[0].recienDisponible, true);
    assert.deepEqual(trasActualizar.elementos[0].plataformasCoincidentes, [
      { id: 8, nombre: "Netflix", logo: null }
    ]);
  } finally {
    await segundoPool.end();
    await ctx.cerrar();
  }
});

test("PostgreSQL: FK, estado, identificador, año y cascada protegen listas_peliculas", async () => {
  const ctx = await crearContexto();
  try {
    const id = ctx.ids[0];
    const insertar = (usuario, pelicula, estado, titulo, anio = 2000) => ctx.pool.query(
      "INSERT INTO listas_peliculas(usuario_id,pelicula_id,estado,titulo,anio) VALUES($1,$2,$3,$4,$5)",
      [usuario, pelicula, estado, titulo, anio]
    );

    await assert.rejects(insertar("desconocido", 10, "quiero_ver", "Prueba"), { code: "23503" });
    await assert.rejects(insertar(id, 10, "invalido", "Prueba"), { code: "23514" });
    await assert.rejects(insertar(id, 0, "quiero_ver", "Prueba"), { code: "23514" });
    await assert.rejects(insertar(id, 10, "quiero_ver", "Prueba", 999), { code: "23514" });

    await insertar(id, 10, "quiero_ver", "Prueba");
    await assert.rejects(insertar(id, 10, "vistas", "Prueba"), { code: "23505" });

    await ctx.pool.query("DELETE FROM usuarios WHERE id=$1", [id]);
    const { rows } = await ctx.pool.query("SELECT * FROM listas_peliculas WHERE usuario_id=$1", [id]);
    assert.equal(rows.length, 0);
  } finally {
    await ctx.cerrar();
  }
});
