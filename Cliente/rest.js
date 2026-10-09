// Capa de comunicación: aquí realizamos las peticiones HTTP.
export async function obtenerEstadoServidor() {
  const respuesta = await fetch("/api/health");

  if (!respuesta.ok) {
    throw new Error("No se pudo consultar el servidor.");
  }

  return respuesta.json();
}