import test from "node:test";
import assert from "node:assert/strict";

export function definirContratoPreferencias(crearContexto) {
  test("preferencias: reemplazo, vacío, orden, copias e independencia entre cuentas", async () => {
    const ctx = await crearContexto();
    try {
      const { repositorio: repo, ids: [a, b] } = ctx;
      assert.deepEqual(await repo.obtener(a), { region: "ES", plataformas: [] });
      const entrada = [20, 10, 20];
      const guardado = await repo.guardar(a, entrada);
      assert.deepEqual(guardado, { region: "ES", plataformas: [10, 20] });
      entrada.push(30);
      guardado.plataformas.push(40);
      const leido = await repo.obtener(a);
      leido.plataformas.push(50);
      assert.deepEqual(await repo.obtener(a), { region: "ES", plataformas: [10, 20] });
      assert.deepEqual(await repo.obtener(b), { region: "ES", plataformas: [] });
      await repo.guardar(b, [99]);
      await repo.guardar(a, [30]);
      assert.deepEqual((await repo.obtener(a)).plataformas, [30]);
      await repo.guardar(a, []);
      assert.deepEqual((await repo.obtener(a)).plataformas, []);
      assert.deepEqual((await repo.obtener(b)).plataformas, [99]);
    } finally { await ctx.cerrar(); }
  });

  test("preferencias: entrada inválida no destruye la selección guardada", async () => {
    const ctx = await crearContexto();
    try {
      const { repositorio: repo, ids: [a] } = ctx;
      await repo.guardar(a, [2147483647]);
      for (const invalida of [null, {}, "10", ["10"], [0], [-1], [1.5],
        [2147483648], [NaN], [undefined], new Array(1)]) {
        await assert.rejects(repo.guardar(a, invalida), { codigo: "PREFERENCIAS_INVALIDAS" });
      }
      assert.deepEqual((await repo.obtener(a)).plataformas, [2147483647]);
      for (const id of [null, "", " ", "a\n"]) {
        await assert.rejects(repo.obtener(id), { codigo: "PREFERENCIAS_INVALIDAS" });
        await assert.rejects(repo.guardar(id, []), { codigo: "PREFERENCIAS_INVALIDAS" });
      }
    } finally { await ctx.cerrar(); }
  });

  test("preferencias: cuenta desconocida o eliminada no accede; cuenta nueva no hereda", async () => {
    const ctx = await crearContexto();
    try {
      const { repositorio: repo, ids: [a, b] } = ctx;
      await repo.guardar(a, [10]);
      await ctx.eliminar(a);
      for (const id of [a, "usuario-desconocido'; SELECT 1; --"]) {
        await assert.rejects(repo.obtener(id), { codigo: "USUARIO_NO_ENCONTRADO" });
        await assert.rejects(repo.guardar(id, []), { codigo: "USUARIO_NO_ENCONTRADO" });
      }
      assert.deepEqual((await repo.obtener(b)).plataformas, []);
      const nuevaCuenta = await ctx.crearNuevaCuenta(a);
      assert.deepEqual((await repo.obtener(nuevaCuenta)).plataformas, []);
    } finally { await ctx.cerrar(); }
  });
}
