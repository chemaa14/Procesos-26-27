import {
  obtenerEstadoServidor,
  registrarUsuario,
  iniciarSesion,
  obtenerSesion,
  cerrarSesion
} from "./rest.js";

const estado = document.getElementById("estado");
const estadoSesion = document.getElementById("estado-sesion");
const mensaje = document.getElementById("mensaje");
const acceso = document.getElementById("acceso");
const panelUsuario = document.getElementById("panel-usuario");
const bienvenida = document.getElementById("bienvenida");
const correoUsuario = document.getElementById("correo-usuario");
const formRegistro = document.getElementById("form-registro");
const formLogin = document.getElementById("form-login");
const botonSalir = document.getElementById("cerrar-sesion");
const botonReintentar = document.getElementById("reintentar");

let ocupado = false;

function mostrarMensaje(texto, esError = false) {
  mensaje.textContent = texto;
  mensaje.classList.toggle("error", esError);
}

function cambiarOcupado(valor) {
  ocupado = valor;

  document.querySelectorAll("input, button").forEach(elemento => {
    elemento.disabled = valor;
  });

  formRegistro.setAttribute("aria-busy", String(valor));
  formLogin.setAttribute("aria-busy", String(valor));
}

function mostrarUsuario(usuario) {
  acceso.hidden = Boolean(usuario);
  panelUsuario.hidden = !usuario;

  bienvenida.textContent = usuario
    ? `Hola, ${usuario.nombre}`
    : "";

  correoUsuario.textContent = usuario?.email ?? "";

  estadoSesion.textContent = usuario
    ? "Sesión iniciada."
    : "No has iniciado sesión.";
}

async function comprobarServidor() {
  try {
    const resultado = await obtenerEstadoServidor();

    estado.textContent = resultado.ok
      ? "Conexión con el servidor correcta."
      : "El servidor no está disponible.";
  } catch {
    estado.textContent = "No se pudo conectar con el servidor.";
  }
}

async function recuperarSesion() {
  if (ocupado) return;

  cambiarOcupado(true);
  mostrarMensaje("");
  botonReintentar.hidden = true;
  acceso.hidden = true;
  panelUsuario.hidden = true;
  estadoSesion.textContent = "Comprobando sesión...";

  try {
    const usuario = await obtenerSesion();
    mostrarUsuario(usuario);
  } catch (error) {
    estadoSesion.textContent = "No se pudo comprobar la sesión.";
    mostrarMensaje(error.message, true);
    botonReintentar.hidden = false;
  } finally {
    cambiarOcupado(false);
  }
}

formRegistro.addEventListener("submit", async evento => {
  evento.preventDefault();

  if (ocupado) return;

  const datos = Object.fromEntries(new FormData(formRegistro));

  cambiarOcupado(true);
  mostrarMensaje("Creando cuenta...");

  try {
    const usuario = await registrarUsuario(datos);

    formRegistro.reset();
    document.getElementById("login-email").value = usuario.email;

    mostrarMensaje(
      "Cuenta creada y pendiente de confirmación. " +
      "Todavía no puedes iniciar sesión. " +
      "El envío del correo de confirmación aún no está disponible."
    );
  } catch (error) {
    mostrarMensaje(error.message, true);
  } finally {
    document.getElementById("registro-password").value = "";
    cambiarOcupado(false);
  }
});

formLogin.addEventListener("submit", async evento => {
  evento.preventDefault();

  if (ocupado) return;

  const datos = Object.fromEntries(new FormData(formLogin));

  cambiarOcupado(true);
  mostrarMensaje("Iniciando sesión...");

  try {
    const usuario = await iniciarSesion(datos);

    formLogin.reset();
    mostrarUsuario(usuario);
    mostrarMensaje("Has iniciado sesión correctamente.");
    bienvenida.focus();
  } catch (error) {
    mostrarMensaje(error.message, true);
  } finally {
    document.getElementById("login-password").value = "";
    cambiarOcupado(false);
  }
});

botonSalir.addEventListener("click", async () => {
  if (ocupado) return;

  cambiarOcupado(true);
  mostrarMensaje("Cerrando sesión...");

  let salidaCorrecta = false;

  try {
    await cerrarSesion();

    formRegistro.reset();
    formLogin.reset();
    mostrarUsuario(null);
    mostrarMensaje("Has cerrado sesión.");
    salidaCorrecta = true;
  } catch (error) {
    mostrarMensaje(error.message, true);
  } finally {
    cambiarOcupado(false);
  }

  if (salidaCorrecta) {
    document.getElementById("login-email").focus();
  }
});

botonReintentar.addEventListener("click", () => {
  comprobarServidor();
  recuperarSesion();
});

comprobarServidor();
recuperarSesion();