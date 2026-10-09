// Capa de datos.
// En la tercera rama implementaremos las operaciones sobre este Map.
//Este módulo almacena y recupera usuarios mediante un Map. Devuelve copias para evitar que quien consulte un usuario modifique accidentalmente el objeto almacenado.
export class DatosUsuarios {
  constructor() {
    this.usuarios = new Map();
    this.passwords = new Map();
  }

  guardar(usuario) {
    this.usuarios.set(usuario.id, { ...usuario });
    return { ...usuario };
  }

  buscarPorId(id) {
    const usuario = this.usuarios.get(id);
    return usuario ? { ...usuario } : null;
  }

  buscarPorEmail(email) {
    const usuario = [...this.usuarios.values()].find(
      (usuario) => usuario.email === email
    );

    return usuario ? { ...usuario } : null;
  }

  listar() {
    return [...this.usuarios.values()].map(
      (usuario) => ({ ...usuario })
    );
  }

  guardarHashPassword(id, hash) {
  this.passwords.set(id, hash);
  }

  buscarHashPassword(id) {
    return this.passwords.get(id) ?? null;
  }

}


