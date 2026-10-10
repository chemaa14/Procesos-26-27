import { ErrorDatos } from "./errores-datos.js";

// Almacenamiento en memoria con un contrato asíncrono.
export class DatosUsuarios {
  constructor() {
    this.usuarios = new Map();
    this.passwords = new Map();
  }

  async guardar(usuario) {
    // Comprobar y guardar sin await evita altas simultáneas con el mismo correo.
    const duplicado = [...this.usuarios.values()].some(
      (existente) => existente.email === usuario.email && existente.id !== usuario.id
    );
    if (duplicado) {
      throw new ErrorDatos("EMAIL_DUPLICADO", "Ya existe un usuario con ese correo.");
    }
    this.usuarios.set(usuario.id, { ...usuario });
    return { ...usuario };
  }

  async buscarPorId(id) {
    const usuario = this.usuarios.get(id);
    return usuario ? { ...usuario } : null;
  }

  async buscarPorEmail(email) {
    const usuario = [...this.usuarios.values()].find(
      (usuario) => usuario.email === email
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
  const duplicado = [...this.usuarios.values()].some(
    (existente) => existente.email === usuario.email
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


