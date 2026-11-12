import {
  REGION_PLATAFORMAS,
  normalizarPlataformas,
  resultadoPreferencias,
  usuarioPreferenciasNoEncontrado,
  validarUsuarioPreferencias
} from "./preferencias-plataformas.js";

export class PreferenciasPlataformasPostgres {
  constructor(pool) {
    this.pool = pool;
  }

  async obtener(usuarioId) {
    validarUsuarioPreferencias(usuarioId);
    const { rows } = await this.pool.query(
      `SELECT p.proveedor_id FROM usuarios u
       LEFT JOIN preferencias_plataformas p
         ON p.usuario_id = u.id AND p.region = $2
       WHERE u.id = $1 AND u.eliminado = FALSE
       ORDER BY p.proveedor_id`,
      [usuarioId, REGION_PLATAFORMAS]
    );
    if (!rows.length) throw usuarioPreferenciasNoEncontrado();
    return resultadoPreferencias(rows.flatMap(fila =>
      fila.proveedor_id === null ? [] : [fila.proveedor_id]));
  }

  async guardar(usuarioId, ids) {
    validarUsuarioPreferencias(usuarioId);
    const plataformas = normalizarPlataformas(ids);
    const cliente = await this.pool.connect();
    let transaccion = false;
    let descartar = false;
    try {
      await cliente.query("BEGIN");
      transaccion = true;
      // Serializa reemplazos de la misma cuenta, incluso si no tiene preferencias.
      const usuario = await cliente.query(
        "SELECT id FROM usuarios WHERE id = $1 AND eliminado = FALSE FOR UPDATE",
        [usuarioId]
      );
      if (!usuario.rows.length) throw usuarioPreferenciasNoEncontrado();
      await cliente.query(
        "DELETE FROM preferencias_plataformas WHERE usuario_id = $1 AND region = $2",
        [usuarioId, REGION_PLATAFORMAS]
      );
      if (plataformas.length) {
        await cliente.query(
          `INSERT INTO preferencias_plataformas (usuario_id, region, proveedor_id)
           SELECT $1, $2, unnest($3::integer[])`,
          [usuarioId, REGION_PLATAFORMAS, plataformas]
        );
      }
      await cliente.query("COMMIT");
      transaccion = false;
      return resultadoPreferencias(plataformas);
    } catch (error) {
      if (transaccion) {
        try { await cliente.query("ROLLBACK"); }
        catch { /* Conservar el error original y descartar la conexión. */
          descartar = true;
          throw error;
        }
      }
      throw error;
    } finally {
      cliente.release(descartar);
    }
  }
}
