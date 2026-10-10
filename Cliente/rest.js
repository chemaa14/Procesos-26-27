// Capa de comunicación: realiza peticiones HTTP.
// No accede al HTML ni almacena contraseñas o tokens.

export class ErrorAPI extends Error {
  constructor(mensaje, estado, codigo) {
    super(mensaje);
    this.name = "ErrorAPI";
    this.estado = estado;
    this.codigo = codigo;
  }
}

async function realizarPeticion(ruta, {
  metodo = "GET",
  datos
} = {}) {
  const headers = {
    Accept: "application/json"
  };

  if (metodo !== "GET") {
    headers["X-CineMatch"] = "1";
  }

  if (datos !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let respuesta;

  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      headers,
      credentials: "same-origin",
      cache: "no-store",
      ...(datos !== undefined
        ? { body: JSON.stringify(datos) }
        : {})
    });
  } catch {
    throw new ErrorAPI(
      "No se pudo conectar con el servidor. Inténtalo de nuevo.",
      0,
      "ERROR_CONEXION"
    );
  }

  if (respuesta.status === 204 && respuesta.ok) {
    return null;
  }

  let contenido;

  try {
    contenido = await respuesta.json();
  } catch {
    throw new ErrorAPI(
      "El servidor devolvió una respuesta inesperada.",
      respuesta.status,
      "RESPUESTA_INVALIDA"
    );
  }

  if (!respuesta.ok) {
    throw new ErrorAPI(
      typeof contenido?.error === "string"
        ? contenido.error
        : "No se pudo completar la operación.",
      respuesta.status,
      contenido?.codigo
    );
  }

  return contenido;
}

export function obtenerEstadoServidor() {
  return realizarPeticion("/api/health");
}

export async function registrarUsuario({ nombre, email, password }) {
  const resultado = await realizarPeticion("/api/registro", {
    metodo: "POST",
    datos: { nombre, email, password }
  });

  return resultado.usuario;
}

export async function iniciarSesion({ email, password }) {
  const resultado = await realizarPeticion("/api/login", {
    metodo: "POST",
    datos: { email, password }
  });

  return resultado.usuario;
}

export async function obtenerSesion() {
  try {
    const resultado = await realizarPeticion("/api/sesion");
    return resultado.usuario;
  } catch (error) {
    // Un 401 significa que no hay una sesión válida.
    // Los errores de conexión sí deben mostrarse al usuario.
    if (error instanceof ErrorAPI && error.estado === 401) {
      return null;
    }

    throw error;
  }
}

export function cerrarSesion() {
  return realizarPeticion("/api/logout", {
    metodo: "POST"
  });
}

export function eliminarMiCuenta() {
  return realizarPeticion("/api/perfil", {
    metodo: "DELETE"
  });
}