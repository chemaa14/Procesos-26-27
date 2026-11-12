import { randomUUID } from "node:crypto";
import { DatosUsuarios } from "../Servidor/datos.js";
import { PreferenciasPlataformas } from "../Servidor/preferencias-plataformas.js";
import { definirContratoPreferencias } from "../integracion/contrato-preferencias.js";

definirContratoPreferencias(async () => {
  const datos = new DatosUsuarios();
  const ids = [randomUUID(), randomUUID()];
  for (const id of ids) await datos.guardar({
    id, nombre: "Prueba", email: `${id}@example.invalid`, confirmado: true, eliminado: false
  });
  return {
    ids, repositorio: new PreferenciasPlataformas(datos),
    async eliminar(id) { await datos.guardar({ ...(await datos.buscarPorId(id)), eliminado: true }); },
    async crearNuevaCuenta(anterior) {
      const id = randomUUID();
      await datos.guardar({ ...(await datos.buscarPorId(anterior)), id, eliminado: false });
      return id;
    },
    async cerrar() {}
  };
});
