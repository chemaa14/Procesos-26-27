// Lógica de confirmación; el repositorio reserva y consume de forma atómica.
import { randomBytes, createHash } from "node:crypto";
import { normalizarEmail } from "./logica.js";
export const hashConfirmacion = token => createHash("sha256").update(token).digest("hex");
export class ErrorConfirmacion extends Error {
  constructor(codigo, mensaje, estado = 400) {
    super(mensaje); this.codigo = codigo; this.estado = estado;
  }
}
export class Confirmaciones {
  constructor({ repositorio, correo, urlPublica, registrarActividad = () => {} }) {
    Object.assign(this, { repositorio, correo, urlPublica, registrarActividad });
  }
  async solicitar(email) {
    const normalizado = normalizarEmail(email);
    const token = randomBytes(32).toString("hex");
    const usuario = await this.repositorio.reservar(normalizado, hashConfirmacion(token));
    if (!usuario) return false;
    const enlace = new URL("/", this.urlPublica);
    enlace.hash = "confirmar=" + token;
    try {
      await this.correo.enviar({ email: usuario.email, enlace: enlace.href });
      this.registrarActividad("confirmacion_enviada", { objetivoId: usuario.id });
      return true;
    } catch (error) {
      this.registrarActividad("error_correo", {
        codigo: ["EAUTH", "ETIMEDOUT", "ECONNECTION", "ESOCKET", "EENVELOPE"].includes(error?.code)
          ? error.code : "CORREO_NO_ENVIADO"
      });
      return false;
    }
  }
  async confirmar(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token) ||
        !await this.repositorio.consumir(hashConfirmacion(token))) {
      throw new ErrorConfirmacion("CONFIRMACION_INVALIDA",
        "El enlace no es válido, ha caducado o ya se utilizó. Si tu cuenta sigue pendiente, solicita otro correo.");
    }
  }
}
// Adaptador de pruebas: comparte el mapa de DatosUsuarios. Sin await entre cambios.
export class ConfirmacionesMemoria {
  constructor(datos, reloj = () => Date.now()) {
    this.datos = datos; this.reloj = reloj; this.tokens = new Map(); this.envios = [];
  }
  async reservar(email, hash) {
    const ahora = this.reloj();
    this.envios = this.envios.filter(t => t > ahora - 3600000);
    const usuario = [...this.datos.usuarios.values()].find(u => u.email === email);
    if (!usuario || usuario.confirmado || usuario.eliminado) return null;
    const previo = this.tokens.get(usuario.id);
    const mismaHora = previo && previo.inicio > ahora - 3600000;
    if ((previo && previo.enviado > ahora - 60000) ||
        (mismaHora && previo.cantidad >= 5) || this.envios.length >= 100) return null;
    this.tokens.set(usuario.id, { hash, caduca: ahora + 86400000, enviado: ahora,
      inicio: mismaHora ? previo.inicio : ahora, cantidad: mismaHora ? previo.cantidad + 1 : 1 });
    this.envios.push(ahora);
    return { ...usuario };
  }
  async consumir(hash) {
    for (const [id, registro] of this.tokens) {
      if (registro.hash !== hash) continue;
      const usuario = this.datos.usuarios.get(id);
      if (registro.caduca <= this.reloj() || !usuario || usuario.confirmado || usuario.eliminado) return false;
      this.tokens.delete(id);
      this.datos.usuarios.set(id, { ...usuario, confirmado: true });
      return true;
    }
    return false;
  }
}
