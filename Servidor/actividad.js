// Lista cerrada de campos: nunca serializamos peticiones, usuarios ni errores.
const MENSAJES = Object.freeze({
  peticion_http: "Petición HTTP completada.",
  peticion_interrumpida: "La conexión se cerró antes de completar la respuesta.",
  usuario_registrado: "Cuenta registrada pendiente de confirmación.",
  usuario_creado: "Cuenta creada desde administración.",
  login_correcto: "Inicio de sesión correcto.",
  login_rechazado: "Inicio de sesión rechazado.",
  logout: "Cierre de sesión procesado.",
  usuario_eliminado: "Cuenta eliminada y sesiones revocadas.",
  usuarios_listados: "Listado de usuarios consultado.",
  estado_consultado: "Estado de usuario consultado.",
  acceso_denegado: "Acceso denegado.",
  peticion_rechazada: "Petición rechazada.",
  error_interno: "Error interno al procesar una petición.",
  servidor_iniciado: "CineMatch con PostgreSQL iniciado.",
  servidor_memoria_iniciado: "CineMatch en memoria iniciado.",
  servidor_cerrando: "Cerrando CineMatch.",
  servidor_cerrado: "CineMatch cerrado.",
  error_inicio: "No se pudo iniciar CineMatch. Revisa PostgreSQL, las variables y las migraciones.",
  error_cierre: "Error al cerrar la aplicación.",
  error_postgres: "Error en una conexión inactiva de PostgreSQL."
});
const RUTAS = new Set([
  "/", "/gui.js", "/rest.js", "/api/health", "/api/registro", "/api/login",
  "/api/logout", "/api/sesion", "/api/perfil", "/api/usuarios",
  "/api/usuarios/:id", "/api/usuarios/:id/activo", "otra"
]);
const METODOS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGOS = new Set([
  "NOMBRE_INVALIDO", "EMAIL_INVALIDO", "PASSWORD_INVALIDA", "EMAIL_DUPLICADO",
  "USUARIO_NO_ENCONTRADO", "USUARIO_ELIMINADO", "CREDENCIALES_INVALIDAS",
  "SESION_INVALIDA", "PERMISO_DENEGADO", "CONFIGURACION_INVALIDA",
  "23505", "23514", "28P01", "3D000", "42P01", "42703", "42501",
  "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EADDRINUSE"
]);

export function rutaParaRegistro(pathname) {
  if (RUTAS.has(pathname)) return pathname;
  if (/^\/api\/usuarios\/[^/]+\/activo$/.test(pathname)) return "/api/usuarios/:id/activo";
  if (/^\/api\/usuarios\/[^/]+$/.test(pathname)) return "/api/usuarios/:id";
  return "otra";
}

export function crearRegistroActividad({ escribir = linea => console.log(linea), reloj = () => new Date() } = {}) {
  return function registrar(evento, campos = {}) {
    // Un fallo del destino de logs no debe cambiar el resultado de la operación.
    try {
      if (!Object.hasOwn(MENSAJES, evento)) return;
      const estado = Number.isInteger(campos.estado) && campos.estado >= 100 && campos.estado <= 599
        ? campos.estado : undefined;
      const severity = evento.startsWith("error_") || estado >= 500 ? "ERROR"
        : estado >= 400 || ["login_rechazado", "acceso_denegado", "peticion_interrumpida"].includes(evento)
          ? "WARNING" : "INFO";
      const registro = { time: reloj().toISOString(), severity, evento, message: MENSAJES[evento] };
      if (estado !== undefined) registro.estado = estado;
      if (RUTAS.has(campos.ruta)) registro.ruta = campos.ruta;
      if (METODOS.has(campos.metodo)) registro.metodo = campos.metodo;
      for (const clave of ["solicitudId", "usuarioId", "objetivoId"]) {
        if (typeof campos[clave] === "string" && UUID.test(campos[clave])) registro[clave] = campos[clave];
      }
      if (typeof campos.duracionMs === "number" && Number.isFinite(campos.duracionMs) && campos.duracionMs >= 0) {
        registro.duracionMs = Math.round(campos.duracionMs * 100) / 100;
      }
      if (CODIGOS.has(campos.codigo)) registro.codigo = campos.codigo;
      if (Number.isInteger(campos.puerto) && campos.puerto >= 1 && campos.puerto <= 65535) registro.puerto = campos.puerto;
      escribir(JSON.stringify(registro));
    } catch {
      // No imprimir el error del logger: también puede contener información sensible.
    }
  };
}
