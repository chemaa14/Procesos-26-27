import { ErrorDatos } from "./errores-datos.js";

export const REGION_PLATAFORMAS = "ES";

export function validarUsuarioPreferencias(usuarioId) {
  if (typeof usuarioId !== "string" || !usuarioId.trim() ||
      usuarioId.length > 200 || /[\u0000-\u001f\u007f]/.test(usuarioId)) {
    throw new ErrorDatos("PREFERENCIAS_INVALIDAS", "Las preferencias no son válidas.");
  }
}

export function normalizarPlataformas(ids) {
  if (!Array.isArray(ids) || Array.from(ids).some(id =>
    !Number.isInteger(id) || id < 1 || id > 2147483647)) {
    throw new ErrorDatos("PREFERENCIAS_INVALIDAS", "Las preferencias no son válidas.");
  }
  return [...new Set(ids)].sort((a, b) => a - b);
}

export function usuarioPreferenciasNoEncontrado() {
  return new ErrorDatos("USUARIO_NO_ENCONTRADO", "El usuario no está disponible.");
}

export function resultadoPreferencias(ids) {
  return { region: REGION_PLATAFORMAS, plataformas: [...ids] };
}

export class PreferenciasPlataformas {
  constructor(datosUsuarios) {
    this.datosUsuarios = datosUsuarios;
    this.preferencias = new Map();
  }

  async comprobarUsuario(usuarioId) {
    validarUsuarioPreferencias(usuarioId);
    const usuario = await this.datosUsuarios.buscarPorId(usuarioId);
    if (!usuario || usuario.eliminado) throw usuarioPreferenciasNoEncontrado();
  }

  async obtener(usuarioId) {
    await this.comprobarUsuario(usuarioId);
    return resultadoPreferencias(this.preferencias.get(usuarioId) ?? []);
  }

  async guardar(usuarioId, ids) {
    const plataformas = normalizarPlataformas(ids);
    await this.comprobarUsuario(usuarioId);
    this.preferencias.set(usuarioId, plataformas);
    return resultadoPreferencias(plataformas);
  }
}
