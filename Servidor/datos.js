import { ErrorDatos } from "./errores-datos.js";

// Almacenamiento en memoria con un contrato asíncrono.
export class DatosUsuarios {
  constructor() {
    this.usuarios = new Map();
    this.passwords = new Map();
    this.identidadesGoogle = new Map();
  }

  async buscarPorGoogleSub(sub) {
    const id = this.identidadesGoogle.get(sub);
    const usuario = id ? await this.buscarPorId(id) : null;
    return usuario && !usuario.eliminado ? usuario : null;
  }

  async crearConGoogle(usuario, sub) {
    if (this.usuarios.get(this.identidadesGoogle.get(sub))?.eliminado === false) throw new ErrorDatos("GOOGLE_DUPLICADO", "Identidad existente.");
    if ([...this.usuarios.values()].some(u => !u.eliminado && u.email === usuario.email)) {
      throw new ErrorDatos("EMAIL_DUPLICADO", "Correo existente.");
    }
    if (this.usuarios.has(usuario.id)) throw new ErrorDatos("ID_DUPLICADO", "Identificador existente.");
    const valido = this.validarRol(usuario);
    this.usuarios.set(usuario.id, { ...valido });
    this.identidadesGoogle.set(sub, usuario.id);
    return { ...valido };
  }

  async guardar(usuario) {
    usuario = this.validarRol(usuario);
    // Comprobar y guardar sin await evita altas simultáneas con el mismo correo.
    const duplicado = [...this.usuarios.values()].some(
      (existente) => !existente.eliminado && !usuario.eliminado && existente.email === usuario.email && existente.id !== usuario.id
    );
    if (duplicado) {
      throw new ErrorDatos("EMAIL_DUPLICADO", "Ya existe un usuario con ese correo.");
    }
    this.usuarios.set(usuario.id, { ...usuario });
    return { ...usuario };
  }

  validarRol(usuario) {
    const rol = usuario.rol ?? "usuario";
    if (!["usuario", "administrador"].includes(rol)) {
      throw new ErrorDatos("ROL_INVALIDO", "El rol no es válido.");
    }
    return { ...usuario, rol };
  }

  async buscarPorId(id) {
    const usuario = this.usuarios.get(id);
    return usuario ? { ...usuario } : null;
  }

  async buscarPorEmail(email) {
    const usuario = [...this.usuarios.values()].find(
      (usuario) => !usuario.eliminado && usuario.email === email
    );

    return usuario ? { ...usuario } : null;
  }

  async listar() {
    return [...this.usuarios.values()].map(
      (usuario) => ({ ...usuario })
    );
  }

  async guardarHashPassword(id, hash) {
  this.passwords.set(id, hash);
  }

  async buscarHashPassword(id) {
    return this.passwords.get(id) ?? null;
  }

  async crearConHash(usuario, hash) {
  usuario = this.validarRol(usuario);
  const duplicado = [...this.usuarios.values()].some(
    (existente) => !existente.eliminado && !usuario.eliminado && existente.email === usuario.email
  );

  if (duplicado) {
    throw new ErrorDatos(
      "EMAIL_DUPLICADO",
      "Ya existe un usuario con ese correo."
    );
  }

  if (this.usuarios.has(usuario.id)) {
    throw new ErrorDatos(
      "ID_DUPLICADO",
      "Ya existe un usuario con ese identificador."
    );
  }

  // No hay await entre ambas escrituras.
  this.usuarios.set(usuario.id, { ...usuario });
  this.passwords.set(usuario.id, hash);

  return { ...usuario };
}

}


