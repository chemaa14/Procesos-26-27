import { createHash, randomBytes } from "node:crypto";

export const hashToken = valor => createHash("sha256").update(valor).digest("hex");
const valido = valor => typeof valor === "string" && /^[a-f0-9]{64}$/.test(valor);

// Mismo contrato que Sesiones, pero compartido entre instancias de Cloud Run.
export class SesionesPostgres {
  constructor(pool) { this.pool = pool; }

  async crear(usuarioId) {
    const token = randomBytes(32).toString("hex");
    await this.pool.query("DELETE FROM sesiones WHERE caduca_en <= NOW()");
    await this.pool.query(
      "INSERT INTO sesiones (token_hash, usuario_id, caduca_en) VALUES ($1, $2, NOW() + INTERVAL '8 hours')",
      [hashToken(token), usuarioId]
    );
    return token;
  }

  async obtener(token) {
    if (!valido(token)) return null;
    const { rows } = await this.pool.query(
      'SELECT usuario_id AS "usuarioId", caduca_en AS "caducaEn" FROM sesiones WHERE token_hash = $1 AND caduca_en > NOW()',
      [hashToken(token)]
    );
    return rows[0] ? { ...rows[0], caducaEn: rows[0].caducaEn.getTime() } : null;
  }

  async eliminar(token) {
    if (valido(token)) await this.pool.query("DELETE FROM sesiones WHERE token_hash = $1", [hashToken(token)]);
  }

  async eliminarDeUsuario(id) {
    await this.pool.query("DELETE FROM sesiones WHERE usuario_id = $1", [id]);
  }
}
