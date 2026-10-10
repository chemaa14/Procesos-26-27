// Capa de lógica de negocio.
// Recibe la capa de datos; no depende de HTTP ni de la interfaz.
import { ErrorDatos } from "./errores-datos.js";
import { randomUUID } from "node:crypto";
import { generarHash,verificarPassword } from "./passwords.js";

// Permite realizar también el cálculo cuando el correo no existe.
// Este valor ficticio nunca permite autenticar a un usuario.
const HASH_FICTICIO =
  `scrypt-v1$${"0".repeat(32)}$${"0".repeat(128)}`;

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

  async alta({ nombre, email } = {},hash=null) {
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

    if (await this.datos.buscarPorEmail(emailNormalizado)) {
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

    try {
      if (hash !== null) {
        return await this.datos.crearConHash(usuario, hash);
      }

      return await this.datos.guardar(usuario);

    } catch (error) {
      if (error instanceof ErrorDatos && error.codigo === "EMAIL_DUPLICADO") {
        throw new ErrorUsuarios("EMAIL_DUPLICADO", "Ya existe un usuario con ese correo.");
      }
      throw error;
    }
  }

  async obtener(id) {
    const usuario = await this.datos.buscarPorId(id);

    if (!usuario) {
      throw new ErrorUsuarios(
        "USUARIO_NO_ENCONTRADO",
        "El usuario no existe."
      );
    }

    return usuario;
  }

  async listar() {
    return (await this.datos.listar()).filter(
      (usuario) => !usuario.eliminado
    );
  }

  async estaActivo(id) {
    const usuario = await this.obtener(id);
    return usuario.confirmado && !usuario.eliminado;
  }

  async confirmar(id) {
    const usuario = await this.obtener(id);

    if (usuario.eliminado) {
      throw new ErrorUsuarios(
        "USUARIO_ELIMINADO",
        "No se puede confirmar un usuario eliminado."
      );
    }

    usuario.confirmado = true;
    return await this.datos.guardar(usuario);
  }

  async eliminar(id) {
    const usuario = await this.obtener(id);
    usuario.eliminado = true;
    await this.datos.guardar(usuario);
  }

  async registrar({ nombre, email, password } = {}) {
  let hash;

  try {
    hash = await generarHash(password);
  } catch (error) {
    if (
      typeof password !== "string" ||
      [...password].length < 15 ||
      [...password].length > 128
    ) {
      throw new ErrorUsuarios(
        "PASSWORD_INVALIDA",
        "La contraseña debe tener entre 15 y 128 caracteres."
      );
    }

    throw error;
  }

  // alta valida nombre, correo y duplicados antes de guardar.
  return await this.alta({ nombre, email }, hash);

}
async autenticar({ email, password } = {}) {
  const errorAcceso = () => new ErrorUsuarios(
    "CREDENCIALES_INVALIDAS",
    "No se ha podido iniciar sesión con esas credenciales."
  );

  if (typeof email !== "string" || typeof password !== "string") {
    throw errorAcceso();
  }

  const emailNormalizado = email.trim().toLowerCase();
  const usuario = await this.datos.buscarPorEmail(emailNormalizado);

  const hash = usuario
    ? await this.datos.buscarHashPassword(usuario.id)
    : null;

  const passwordCorrecta = await verificarPassword(
    password,
    hash ?? HASH_FICTICIO
  );

  if (!usuario || !hash || !passwordCorrecta) {
    throw errorAcceso();
  }

  // Consultamos de nuevo porque el estado podría haber cambiado
  // mientras se comprobaba la contraseña.
  const usuarioActual = await this.datos.buscarPorId(usuario.id);

  if (
    !usuarioActual ||
    !usuarioActual.confirmado ||
    usuarioActual.eliminado
  ) {
    throw errorAcceso();
  }

  return usuarioActual;
}


}

