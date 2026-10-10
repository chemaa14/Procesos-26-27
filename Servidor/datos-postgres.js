import { ErrorDatos } from "./errores-datos.js";

const CAMPOS = "id, nombre, email, confirmado, eliminado";

export class DatosUsuariosPostgres {
  constructor(pool) {
    this.pool = pool;
  }

  async guardar(usuario) {
    try {
      const resultado = await this.pool.query(
        `INSERT INTO usuarios
          (id, nombre, email, confirmado, eliminado)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           nombre = EXCLUDED.nombre,
           email = EXCLUDED.email,
           confirmado = EXCLUDED.confirmado,
           eliminado = EXCLUDED.eliminado
         RETURNING ${CAMPOS}`,
        [
          usuario.id,
          usuario.nombre,
          usuario.email,
          usuario.confirmado,
          usuario.eliminado
        ]
      );

      return resultado.rows[0];
    } catch (error) {
      if (
        error.code === "23505" &&
        error.constraint === "usuarios_email_unico"
      ) {
        throw new ErrorDatos(
          "EMAIL_DUPLICADO",
          "Ya existe un usuario con ese correo."
        );
      }

      throw error;
    }
  }

  async buscarPorId(id) {
    const resultado = await this.pool.query(
      `SELECT ${CAMPOS} FROM usuarios WHERE id = $1`,
      [id]
    );

    return resultado.rows[0] ?? null;
  }

  async buscarPorEmail(email) {
    const resultado = await this.pool.query(
      `SELECT ${CAMPOS} FROM usuarios WHERE email = $1`,
      [email]
    );

    return resultado.rows[0] ?? null;
  }

  async listar() {
    const resultado = await this.pool.query(
      `SELECT ${CAMPOS} FROM usuarios ORDER BY orden`
    );

    return resultado.rows;
  }

  async guardarHashPassword(id, hash) {
    const resultado = await this.pool.query(
      "UPDATE usuarios SET password_hash = $2 WHERE id = $1",
      [id, hash]
    );

    if (resultado.rowCount === 0) {
      throw new ErrorDatos(
        "USUARIO_NO_ENCONTRADO",
        "El usuario no existe."
      );
    }
  }

  async buscarHashPassword(id) {
    const resultado = await this.pool.query(
      "SELECT password_hash FROM usuarios WHERE id = $1",
      [id]
    );

    return resultado.rows[0]?.password_hash ?? null;
  }
  async crearConHash(usuario, hash) {
  try {
    const resultado = await this.pool.query(
      `INSERT INTO usuarios
        (id, nombre, email, confirmado, eliminado, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${CAMPOS}`,
      [
        usuario.id,
        usuario.nombre,
        usuario.email,
        usuario.confirmado,
        usuario.eliminado,
        hash
      ]
    );

    return resultado.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      if (error.constraint === "usuarios_email_unico") {
        throw new ErrorDatos(
          "EMAIL_DUPLICADO",
          "Ya existe un usuario con ese correo."
        );
      }

      if (error.constraint === "usuarios_pkey") {
        throw new ErrorDatos(
          "ID_DUPLICADO",
          "Ya existe un usuario con ese identificador."
        );
      }
    }

    throw error;
  }
}
  
}