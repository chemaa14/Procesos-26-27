// Capa de lógica de negocio.
// Recibe la capa de datos; no depende de HTTP ni de la interfaz.
import { randomUUID } from "node:crypto";

export class ErrorUsuarios extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = "ErrorUsuarios";
    this.codigo = codigo;
  }
}

export class LogicaUsuarios {
  constructor(datos) {
    this.datos = datos;
  }

  alta({ nombre, email } = {}) {
    if (typeof nombre !== "string" || !nombre.trim()) {
      throw new ErrorUsuarios(
        "NOMBRE_INVALIDO",
        "El nombre es obligatorio."
      );
    }

    if (typeof email !== "string") {
      throw new ErrorUsuarios(
        "EMAIL_INVALIDO",
        "El correo electrónico no es válido."
      );
    }

    const emailNormalizado = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
      throw new ErrorUsuarios(
        "EMAIL_INVALIDO",
        "El correo electrónico no es válido."
      );
    }

    if (this.datos.buscarPorEmail(emailNormalizado)) {
      throw new ErrorUsuarios(
        "EMAIL_DUPLICADO",
        "Ya existe un usuario con ese correo."
      );
    }

    const usuario = {
      id: randomUUID(),
      nombre: nombre.trim(),
      email: emailNormalizado,
      confirmado: false,
      eliminado: false
    };

    return this.datos.guardar(usuario);
  }

  obtener(id) {
    const usuario = this.datos.buscarPorId(id);

    if (!usuario) {
      throw new ErrorUsuarios(
        "USUARIO_NO_ENCONTRADO",
        "El usuario no existe."
      );
    }

    return usuario;
  }

  listar() {
    return this.datos.listar().filter(
      (usuario) => !usuario.eliminado
    );
  }

  estaActivo(id) {
    const usuario = this.obtener(id);
    return usuario.confirmado && !usuario.eliminado;
  }

  confirmar(id) {
    const usuario = this.obtener(id);

    if (usuario.eliminado) {
      throw new ErrorUsuarios(
        "USUARIO_ELIMINADO",
        "No se puede confirmar un usuario eliminado."
      );
    }

    usuario.confirmado = true;
    return this.datos.guardar(usuario);
  }

  eliminar(id) {
    const usuario = this.obtener(id);
    usuario.eliminado = true;
    this.datos.guardar(usuario);
  }
}