import { hashToken } from "./sesiones-postgres.js";

// La versión en memoria se utiliza exclusivamente en pruebas.
export class IntentosOAuth {
  constructor({ reloj = () => Date.now() } = {}) {
    this.intentos = new Map();
    this.reloj = reloj;
  }
  async guardar(estado, navegador, datos) {
    for (const [clave, intento] of this.intentos) {
      if (intento.caducaEn <= this.reloj()) this.intentos.delete(clave);
    }
    this.intentos.set(hashToken(estado), {
      ...datos, navegador: hashToken(navegador), caducaEn: this.reloj() + 600000
    });
  }
  async consumir(estado, navegador) {
    const clave = hashToken(estado);
    const intento = this.intentos.get(clave);
    if (!intento || intento.navegador !== hashToken(navegador) || intento.caducaEn <= this.reloj()) return null;
    this.intentos.delete(clave);
    return { nonce: intento.nonce, verificador: intento.verificador };
  }
}

export class IntentosOAuthPostgres {
  constructor(pool) { this.pool = pool; }
  async guardar(estado, navegador, { nonce, verificador }) {
    await this.pool.query("DELETE FROM intentos_oauth WHERE caduca_en <= NOW()");
    await this.pool.query(
      `INSERT INTO intentos_oauth (estado_hash, navegador_hash, nonce, verificador, caduca_en)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
      [hashToken(estado), hashToken(navegador), nonce, verificador]
    );
  }
  async consumir(estado, navegador) {
    // DELETE RETURNING consume atómicamente: dos callbacks no pueden reutilizarlo.
    const { rows } = await this.pool.query(
      `DELETE FROM intentos_oauth WHERE estado_hash = $1 AND navegador_hash = $2 AND caduca_en > NOW()
       RETURNING nonce, verificador`,
      [hashToken(estado), hashToken(navegador)]
    );
    return rows[0] ?? null;
  }
}
