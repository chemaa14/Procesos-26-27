import { randomBytes } from "node:crypto";

export class Sesiones {
  constructor({
    duracionMs = 8 * 60 * 60 * 1000,
    reloj = () => Date.now()
  } = {}) {
    if (!Number.isSafeInteger(duracionMs) || duracionMs <= 0) {
      throw new Error("La duración de las sesiones debe ser positiva.");
    }

    this.sesiones = new Map();
    this.duracionMs = duracionMs;
    this.reloj = reloj;
  }

  crear(usuarioId) {
    if (typeof usuarioId !== "string" || !usuarioId.trim()) {
      throw new Error("El identificador del usuario es obligatorio.");
    }

    this.limpiarCaducadas();

    const token = randomBytes(32).toString("hex");

    this.sesiones.set(token, {
      usuarioId,
      caducaEn: this.reloj() + this.duracionMs
    });

    return token;
  }

  obtener(token) {
    const sesion = this.sesiones.get(token);

    if (!sesion) {
      return null;
    }

    if (sesion.caducaEn <= this.reloj()) {
      this.sesiones.delete(token);
      return null;
    }

    return { ...sesion };
  }

  eliminar(token) {
    this.sesiones.delete(token);
  }

  eliminarDeUsuario(usuarioId) {
    for (const [token, sesion] of this.sesiones) {
      if (sesion.usuarioId === usuarioId) {
        this.sesiones.delete(token);
      }
    }
  }

  limpiarCaducadas() {
    const ahora = this.reloj();

    for (const [token, sesion] of this.sesiones) {
      if (sesion.caducaEn <= ahora) {
        this.sesiones.delete(token);
      }
    }
  }
}