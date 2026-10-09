import { obtenerEstadoServidor } from "./rest.js";

// Capa de presentación: actualiza la interfaz.
async function mostrarEstado() {
  const elemento = document.getElementById("estado");

  try {
    const resultado = await obtenerEstadoServidor();

    elemento.textContent = resultado.ok
      ? "Conexión con el servidor correcta."
      : "El servidor no está disponible.";
  } catch {
    elemento.textContent = "No se pudo conectar con el servidor.";
  }
}

mostrarEstado();