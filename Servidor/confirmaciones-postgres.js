export class ConfirmacionesPostgres {
  constructor(pool) { this.pool = pool; }
  async reservar(email, hash) {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("BEGIN");
      const { rows: [usuario] } = await cliente.query(
        "SELECT id, email FROM usuarios WHERE email = $1 AND NOT confirmado AND NOT eliminado FOR UPDATE", [email]);
      if (!usuario) { await cliente.query("COMMIT"); return null; }
      const { rowCount } = await cliente.query(`
        INSERT INTO confirmaciones_correo (usuario_id, token_hash, caduca_en, enviado_en, ventana_inicio, cantidad)
        VALUES ($1, $2, clock_timestamp() + INTERVAL '24 hours', clock_timestamp(), clock_timestamp(), 1)
        ON CONFLICT (usuario_id) DO UPDATE SET
          token_hash = EXCLUDED.token_hash, caduca_en = EXCLUDED.caduca_en, enviado_en = EXCLUDED.enviado_en,
          ventana_inicio = CASE WHEN confirmaciones_correo.ventana_inicio <= clock_timestamp() - INTERVAL '1 hour'
            THEN clock_timestamp() ELSE confirmaciones_correo.ventana_inicio END,
          cantidad = CASE WHEN confirmaciones_correo.ventana_inicio <= clock_timestamp() - INTERVAL '1 hour'
            THEN 1 ELSE confirmaciones_correo.cantidad + 1 END
        WHERE confirmaciones_correo.enviado_en <= clock_timestamp() - INTERVAL '60 seconds'
          AND (confirmaciones_correo.ventana_inicio <= clock_timestamp() - INTERVAL '1 hour'
            OR confirmaciones_correo.cantidad < 5)
        RETURNING usuario_id`, [usuario.id, hash]);
      if (!rowCount) { await cliente.query("COMMIT"); return null; }
      // Cupo global compartido entre instancias; cuenta también intentos SMTP fallidos.
      const limite = await cliente.query(`
        UPDATE limite_correo SET
          cantidad = CASE WHEN ventana_inicio <= clock_timestamp() - INTERVAL '1 hour' THEN 1 ELSE cantidad + 1 END,
          ventana_inicio = CASE WHEN ventana_inicio <= clock_timestamp() - INTERVAL '1 hour'
            THEN clock_timestamp() ELSE ventana_inicio END
        WHERE id = 1 AND (ventana_inicio <= clock_timestamp() - INTERVAL '1 hour' OR cantidad < 100)
        RETURNING id`);
      if (!limite.rowCount) { await cliente.query("ROLLBACK"); return null; }
      await cliente.query("COMMIT"); return usuario;
    } catch (error) {
      await cliente.query("ROLLBACK"); throw error;
    } finally { cliente.release(); }
  }
  async consumir(hash) {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("BEGIN");
      // Mismo orden que reservar: bloquear usuario y después revalidar el token.
      const { rows: [registro] } = await cliente.query(
        "SELECT usuario_id FROM confirmaciones_correo WHERE token_hash = $1", [hash]);
      if (!registro) { await cliente.query("COMMIT"); return false; }
      const { rows: [usuario] } = await cliente.query(
        "SELECT id, confirmado, eliminado FROM usuarios WHERE id = $1 FOR UPDATE", [registro.usuario_id]);
      if (!usuario || usuario.confirmado || usuario.eliminado) {
        await cliente.query("COMMIT"); return false;
      }
      const resultado = await cliente.query(`
        DELETE FROM confirmaciones_correo WHERE usuario_id = $1 AND token_hash = $2
          AND caduca_en > clock_timestamp() RETURNING usuario_id`, [usuario.id, hash]);
      if (!resultado.rowCount) { await cliente.query("COMMIT"); return false; }
      await cliente.query("UPDATE usuarios SET confirmado = TRUE WHERE id = $1", [usuario.id]);
      await cliente.query("COMMIT"); return true;
    } catch (error) {
      await cliente.query("ROLLBACK"); throw error;
    } finally { cliente.release(); }
  }
}
