import test from "node:test";
import assert from "node:assert/strict";

export function definirContratoListas(crearContexto) {
  test("listas: guardado, modificación, eliminación, copias e independencia entre cuentas", async () => {
    const ctx = await crearContexto();
    try {
      const { repositorio: repo, ids: [a, b] } = ctx;
      assert.deepEqual(await repo.listar(a), { elementos: [] });
      assert.deepEqual(await repo.listar(b), { elementos: [] });

      const guardada = await repo.guardar(a, {
        peliculaId: 550,
        estado: "quiero_ver",
        titulo: "  El club de la lucha  ",
        anio: 1999,
        cartel: "https://image.tmdb.org/t/p/w500/cartel.jpg"
      });
      assert.equal(guardada.peliculaId, 550);
      assert.equal(guardada.estado, "quiero_ver");
      assert.equal(guardada.titulo, "El club de la lucha");
      assert.equal(guardada.anio, 1999);
      assert.equal(guardada.disponibleEnPlataformas, false);
      assert.deepEqual(guardada.plataformasCoincidentes, []);
      assert.equal(guardada.recienDisponible, false);

      // Modificar la copia devuelta no altera el repositorio.
      guardada.plataformasCoincidentes.push({ id: 99, nombre: "Falsa", logo: null });
      const lecturaA = await repo.listar(a);
      assert.equal(lecturaA.elementos.length, 1);
      assert.deepEqual(lecturaA.elementos[0].plataformasCoincidentes, []);

      // Independencia entre cuentas.
      assert.deepEqual(await repo.listar(b), { elementos: [] });
      await assert.rejects(repo.eliminar(b, 550), { codigo: "ELEMENTO_NO_ENCONTRADO" });

      await repo.guardar(b, {
        peliculaId: 603,
        estado: "quiero_ver",
        titulo: "Matrix",
        anio: 1999,
        cartel: null
      });

      const movida = await repo.guardar(a, {
        peliculaId: 550,
        estado: "vistas",
        titulo: "El club de la lucha",
        anio: 1999,
        cartel: null
      });
      assert.equal(movida.estado, "vistas");
      assert.equal(movida.cartel, null);

      assert.equal((await repo.listar(a)).elementos.length, 1);
      assert.equal((await repo.listar(b)).elementos[0].peliculaId, 603);

      await repo.eliminar(a, 550);
      assert.deepEqual(await repo.listar(a), { elementos: [] });
      assert.equal((await repo.listar(b)).elementos.length, 1);
      await assert.rejects(repo.eliminar(a, 550), { codigo: "ELEMENTO_NO_ENCONTRADO" });
    } finally {
      await ctx.cerrar();
    }
  });

  test("listas: transición de disponibilidad activa y limpia alerta de nueva disponibilidad", async () => {
    const ctx = await crearContexto();
    try {
      const { repositorio: repo, ids: [a] } = ctx;
      await repo.guardar(a, {
        peliculaId: 27205,
        estado: "quiero_ver",
        titulo: "Origen",
        anio: 2010
      });

      const disponible = await repo.actualizarDisponibilidad(a, 27205, {
        disponibleEnPlataformas: true,
        plataformasCoincidentes: [{ id: 8, nombre: "Netflix", logo: null }]
      });
      assert.equal(disponible.disponibleEnPlataformas, true);
      assert.equal(disponible.recienDisponible, true);
      assert.deepEqual(disponible.plataformasCoincidentes, [{ id: 8, nombre: "Netflix", logo: null }]);

      const noDisponible = await repo.actualizarDisponibilidad(a, 27205, {
        disponibleEnPlataformas: false,
        plataformasCoincidentes: []
      });
      assert.equal(noDisponible.disponibleEnPlataformas, false);
      assert.equal(noDisponible.recienDisponible, false);
      assert.deepEqual(noDisponible.plataformasCoincidentes, []);

      assert.equal(
        await repo.actualizarDisponibilidad(a, 999999, {
          disponibleEnPlataformas: true,
          plataformasCoincidentes: []
        }),
        null
      );
    } finally {
      await ctx.cerrar();
    }
  });

  test("listas: entrada inválida no altera las listas existentes", async () => {
    const ctx = await crearContexto();
    try {
      const { repositorio: repo, ids: [a] } = ctx;
      await repo.guardar(a, {
        peliculaId: 550,
        estado: "quiero_ver",
        titulo: "El club de la lucha",
        anio: 1999
      });

      for (const entrada of [
        null,
        {},
        { peliculaId: 0, estado: "quiero_ver", titulo: "X" },
        { peliculaId: 550, estado: "favoritas", titulo: "X" },
        { peliculaId: 550, estado: "quiero_ver", titulo: "   " },
        { peliculaId: 550, estado: "quiero_ver", titulo: "X", anio: 999 },
        { peliculaId: 550, estado: "quiero_ver", titulo: "X", cartel: "https://otro.ejemplo/a.jpg" }
      ]) {
        await assert.rejects(repo.guardar(a, entrada), { codigo: "LISTA_INVALIDA" });
      }

      for (const id of [null, "", " ", "a\n"]) {
        await assert.rejects(repo.listar(id), { codigo: "LISTA_INVALIDA" });
        await assert.rejects(repo.eliminar(id, 550), { codigo: "LISTA_INVALIDA" });
      }

      assert.equal((await repo.listar(a)).elementos.length, 1);
    } finally {
      await ctx.cerrar();
    }
  });

  test("listas: cuenta desconocida o eliminada no accede; cuenta nueva no hereda", async () => {
    const ctx = await crearContexto();
    try {
      const { repositorio: repo, ids: [a, b] } = ctx;
      await repo.guardar(a, {
        peliculaId: 550,
        estado: "quiero_ver",
        titulo: "El club de la lucha",
        anio: 1999
      });
      await ctx.eliminar(a);

      for (const id of [a, "usuario-desconocido'; SELECT 1; --"]) {
        await assert.rejects(repo.listar(id), { codigo: "USUARIO_NO_ENCONTRADO" });
        await assert.rejects(
          repo.guardar(id, { peliculaId: 550, estado: "quiero_ver", titulo: "X" }),
          { codigo: "USUARIO_NO_ENCONTRADO" }
        );
        await assert.rejects(repo.eliminar(id, 550), { codigo: "USUARIO_NO_ENCONTRADO" });
      }

      assert.deepEqual(await repo.listar(b), { elementos: [] });
      const nuevaCuenta = await ctx.crearNuevaCuenta(a);
      assert.deepEqual(await repo.listar(nuevaCuenta), { elementos: [] });
    } finally {
      await ctx.cerrar();
    }
  });
}
