import {
  confirmarCorreo,
  reenviarConfirmacion,
  prepararAccesoGoogle,
  obtenerEstadoServidor,
  registrarUsuario,
  iniciarSesion,
  obtenerSesion,
  cerrarSesion,
  eliminarMiCuenta,
  listarUsuarios,
  eliminarUsuario
} from "./rest.js";



// El fragmento no llega al servidor ni a los registros HTTP. Se retira del historial.
const enlaceInicial = new URL(window.location.href);
const fragmento = new URLSearchParams(enlaceInicial.hash.slice(1));
let tokenConfirmacion = fragmento.get("confirmar");
if (tokenConfirmacion !== null) {
  window.history.replaceState(null, "", enlaceInicial.pathname + enlaceInicial.search);
}
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
const botonEliminar = document.getElementById("eliminar-cuenta");

const panelAdmin = document.getElementById("panel-admin");
const rolUsuario = document.getElementById("rol-usuario");
const listaUsuarios = document.getElementById("lista-usuarios");
const estadoListado = document.getElementById("estado-listado");
const botonActualizar = document.getElementById("actualizar-usuarios");
let usuarioActual = null;
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
  usuarioActual = usuario;
  panelAdmin.hidden = usuario?.rol !== "administrador";
  rolUsuario.textContent = usuario ? `Rol: ${usuario.rol}` : "";
  listaUsuarios.replaceChildren();
  estadoListado.textContent = "";
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
    if (usuario?.rol === "administrador") await cargarUsuarios();
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
    const { usuario, correoEnviado } = await registrarUsuario(datos);

    formRegistro.reset();
    document.getElementById("login-email").value = usuario.email;
    document.getElementById("reenvio-email").value = usuario.email;

    mostrarMensaje(
      correoEnviado
        ? "Cuenta creada. Revisa tu correo y spam para confirmarla. El enlace caduca en 24 horas."
        : "Cuenta creada, pero no hemos podido enviar la confirmación. Solicita otro correo dentro de 60 segundos.",
      !correoEnviado
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
    if (usuario?.rol === "administrador") await cargarUsuarios();
    if (usuarioActual) mostrarMensaje("Has iniciado sesión correctamente.");
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



botonEliminar.addEventListener("click", async () => {
  if (ocupado) return;

  const confirmado = window.confirm(
    "¿Quieres eliminar tu cuenta? Perderás el acceso y se cerrarán " +
    "todas tus sesiones. No podrás recuperarla desde la aplicación."
  );

  if (!confirmado) return;

  cambiarOcupado(true);
  mostrarMensaje("Eliminando cuenta...");

  let volverAlAcceso = false;

  try {
    await eliminarMiCuenta();

    formRegistro.reset();
    formLogin.reset();
    mostrarUsuario(null);

    mostrarMensaje("Tu cuenta ha sido eliminada y tus sesiones se han cerrado.");
    volverAlAcceso = true;
  } catch (error) {
    if (error.estado === 401) {
      mostrarUsuario(null);
      mostrarMensaje(
        "Tu sesión ya no es válida. Vuelve a iniciar sesión.",
        true
      );
      volverAlAcceso = true;
    } else {
      mostrarMensaje(error.message, true);
    }
  } finally {
    cambiarOcupado(false);
  }

  if (volverAlAcceso) {
    document.getElementById("login-email").focus();
  }
});

async function cargarUsuarios() {
  listaUsuarios.replaceChildren();
  estadoListado.textContent = "Cargando usuarios...";
  try {
    const usuarios = await listarUsuarios();
    for (const usuario of usuarios) {
      const fila = document.createElement("tr");
      for (const valor of [usuario.nombre, usuario.email, usuario.rol,
        usuario.confirmado && !usuario.eliminado ? "Activo" : "Pendiente"]) {
        const celda = document.createElement("td");
        celda.textContent = valor;
        fila.append(celda);
      }
      const acciones = document.createElement("td");
      if (usuario.id === usuarioActual.id) {
        acciones.textContent = "Tu cuenta (usa Eliminar mi cuenta)";
      } else {
        const boton = document.createElement("button");
        boton.type = "button";
        boton.textContent = "Eliminar";
        boton.setAttribute("aria-label", `Eliminar a ${usuario.email}`);
        boton.disabled = ocupado;
        boton.addEventListener("click", () => borrarUsuario(usuario));
        acciones.append(boton);
      }
      fila.append(acciones);
      listaUsuarios.append(fila);
    }
    estadoListado.textContent = `${usuarios.length} usuarios.`;
  } catch (error) {
    estadoListado.textContent = error.message;
    if (error.estado === 401) mostrarUsuario(null);
    if (error.estado === 403) {
      panelAdmin.hidden = true;
      listaUsuarios.replaceChildren();
      // Refresca el rol mostrado si cambió durante la sesión.
      try { mostrarUsuario(await obtenerSesion()); } catch { /* permite reintentar */ }
    }
    mostrarMensaje(error.message, true);
  }
}

async function borrarUsuario(usuario) {
  if (ocupado) return;
  if (!window.confirm(`¿Eliminar la cuenta de ${usuario.email}? Se cerrarán sus sesiones y perderá el acceso.`)) return;
  cambiarOcupado(true);
  try {
    await eliminarUsuario(usuario.id);
    mostrarMensaje("Usuario eliminado.");
    await cargarUsuarios();
  } catch (error) {
    if (error.estado === 401) mostrarUsuario(null);
    if (error.estado === 403) {
      panelAdmin.hidden = true;
      listaUsuarios.replaceChildren();
    }
    mostrarMensaje(error.message, true);
  } finally {
    cambiarOcupado(false);
  }
}

botonActualizar.addEventListener("click", async () => {
  if (ocupado) return;
  cambiarOcupado(true);
  try { await cargarUsuarios(); } finally { cambiarOcupado(false); }
});

document.getElementById("entrar-google").addEventListener("click", async () => {
  if (ocupado) return;
  cambiarOcupado(true);
  mostrarMensaje("Abriendo Google...");
  try {
    const destino = await prepararAccesoGoogle();
    window.location.assign(destino);
  } catch (error) {
    mostrarMensaje(error.message, true);
    cambiarOcupado(false);
  }
});

async function iniciarInterfaz() {
  // Solo mostramos mensajes conocidos, nunca el texto devuelto por el proveedor.
  const url = new URL(window.location.href);
  const resultado = url.searchParams.get("oauth");
  if (resultado !== null) {
    url.searchParams.delete("oauth");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  comprobarServidor();
  await recuperarSesion();
  if (tokenConfirmacion !== null) {
    document.getElementById("panel-confirmacion").hidden = false;
    if (!/^[a-f0-9]{64}$/.test(tokenConfirmacion)) {
      document.getElementById("resultado-confirmacion").textContent = "El enlace no es válido. Solicita otro correo.";
      tokenConfirmacion = null;
      document.getElementById("confirmar-correo").hidden = true;
    }
  }
  const mensajes = {
    cancelado: "Has cancelado el acceso con Google. Puedes volver a intentarlo.",
    cuenta_existente: "Ya existe una cuenta con ese correo. Entra con tu contraseña; las cuentas no se vinculan automáticamente.",
    error: "No se pudo completar el acceso con Google. Vuelve a intentarlo desde este navegador."
  };
  if (resultado === "correcto" && usuarioActual) mostrarMensaje("Sesión iniciada con Google.");
  else if (resultado && Object.hasOwn(mensajes, resultado)) mostrarMensaje(mensajes[resultado], true);
}
document.getElementById("form-reenvio").addEventListener("submit", async evento => {
  evento.preventDefault();
  if (ocupado) return;
  cambiarOcupado(true);
  mostrarMensaje("Solicitando confirmación...");
  try {
    const resultado = await reenviarConfirmacion(document.getElementById("reenvio-email").value);
    mostrarMensaje(resultado.mensaje);
  } catch (error) { mostrarMensaje(error.message, true); }
  finally { cambiarOcupado(false); }
});
document.getElementById("confirmar-correo").addEventListener("click", async () => {
  if (ocupado || !tokenConfirmacion) return;
  cambiarOcupado(true);
  const resultado = document.getElementById("resultado-confirmacion");
  resultado.textContent = "Confirmando cuenta...";
  try {
    const respuesta = await confirmarCorreo(tokenConfirmacion);
    resultado.textContent = respuesta.mensaje;
    tokenConfirmacion = null;
    document.getElementById("confirmar-correo").hidden = true;
  } catch (error) {
    resultado.textContent = error.message;
    if (error.codigo === "CONFIRMACION_INVALIDA") {
      tokenConfirmacion = null;
      document.getElementById("confirmar-correo").hidden = true;
    }
  } finally { cambiarOcupado(false); }
});
iniciarInterfaz();