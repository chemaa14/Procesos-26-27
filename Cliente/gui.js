import { crearSelectorPlataformas } from "./selector-plataformas.js";
import {
  TEXTO_DISPONIBILIDAD_CARGANDO,
  TEXTO_DISPONIBILIDAD_FUENTE,
  crearEstadoDisponibilidad,
  seccionesDisponibilidad,
  textoConsultadoEn
} from "./disponibilidad.js";
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
  eliminarUsuario,
  buscarPeliculas,
  obtenerDetallePelicula,
  obtenerDisponibilidadPelicula
} from "./rest.js";
import {
  TEXTO_ANIO_AUSENTE,
  TEXTO_CARTEL_AUSENTE,
  crearEstadoCatalogo,
  textoAnio,
  textoDuracion,
  textoGeneros,
  textoPaginaActual,
  textoResumenResultados,
  textoSinopsis,
  textoTitulo,
  urlCartelSegura,
  validarBusqueda
} from "./catalogo.js";



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

const panelCatalogo = document.getElementById("panel-catalogo");
const formBusqueda = document.getElementById("form-busqueda");
const busquedaTitulo = document.getElementById("busqueda-titulo");
const busquedaAnio = document.getElementById("busqueda-anio");
const botonBuscar = document.getElementById("boton-buscar");
const estadoCatalogo = document.getElementById("estado-catalogo");
const errorCatalogo = document.getElementById("error-catalogo");
const botonReintentarCatalogo = document.getElementById("reintentar-catalogo");
const resultados = document.getElementById("resultados");
const listaPeliculas = document.getElementById("lista-peliculas");
const resumenResultados = document.getElementById("resumen-resultados");
const paginacion = document.getElementById("paginacion");
const paginaActual = document.getElementById("pagina-actual");
const botonAnterior = document.getElementById("pagina-anterior");
const botonSiguiente = document.getElementById("pagina-siguiente");
const detallePelicula = document.getElementById("detalle-pelicula");
const detalleContenido = document.getElementById("detalle-contenido");
const detalleCartel = document.getElementById("detalle-cartel");
const detalleTitulo = document.getElementById("detalle-titulo");
const detalleAnio = document.getElementById("detalle-anio");
const detalleDuracion = document.getElementById("detalle-duracion");
const detalleGeneros = document.getElementById("detalle-generos");
const detalleSinopsis = document.getElementById("detalle-sinopsis");
const estadoDetalle = document.getElementById("estado-detalle");
const errorDetalle = document.getElementById("error-detalle");
const botonReintentarDetalle = document.getElementById("reintentar-detalle");
const botonVolver = document.getElementById("volver-resultados");
const disponibilidadPelicula = document.getElementById("disponibilidad-pelicula");
const estadoDisponibilidad = document.getElementById("estado-disponibilidad");
const errorDisponibilidad = document.getElementById("error-disponibilidad");
const botonReintentarDisponibilidad = document.getElementById("reintentar-disponibilidad");
const contenidoDisponibilidad = document.getElementById("contenido-disponibilidad");
const mensajeDisponibilidad = document.getElementById("mensaje-disponibilidad");
const gruposDisponibilidad = document.getElementById("grupos-disponibilidad");
const fuenteDisponibilidad = document.getElementById("fuente-disponibilidad");
const fechaDisponibilidad = document.getElementById("fecha-disponibilidad");
const enlaceDisponibilidad = document.getElementById("enlace-disponibilidad");

const estadoCatalogoUI = crearEstadoCatalogo();
const estadoDisponibilidadUI = crearEstadoDisponibilidad();
let usuarioActual = null;
let ocupado = false;
let cargandoBusqueda = false;
let cargandoDetalle = false;
let cargandoDisponibilidad = false;
let reintentoBusqueda = null;
let detallePendiente = null;
let disponibilidadPendiente = null;
let focoDetalle = null;
const selectorPlataformas = crearSelectorPlataformas(document.getElementById("panel-plataformas"), {
  estaOcupado: () => ocupado,
  alCaducar: () => volverAlAccesoPorSesion(),
  alGuardar: () => {
    if (estadoCatalogoUI.detalle && !detalleContenido.hidden) {
      void cargarDisponibilidad(estadoCatalogoUI.detalle.id);
    }
  }
});

function mostrarMensaje(texto, esError = false) {
  mensaje.textContent = texto;
  mensaje.classList.toggle("error", esError);
}

function cambiarOcupado(valor) {
  ocupado = valor;

  document.querySelectorAll("input, button").forEach(elemento => {
    elemento.disabled = valor;
  });

  selectorPlataformas.actualizarControles();
  formRegistro.setAttribute("aria-busy", String(valor));
  formLogin.setAttribute("aria-busy", String(valor));
  actualizarControlesCatalogo();
}

function mostrarUsuario(usuario) {
  const cambiaUsuario = (usuario?.id ?? null) !== (usuarioActual?.id ?? null);

  usuarioActual = usuario;
  selectorPlataformas.cambiarUsuario(usuario);

  if (cambiaUsuario || !usuario) {
    limpiarCatalogoUI();
  }

  panelAdmin.hidden = usuario?.rol !== "administrador";
  panelCatalogo.hidden = !usuario;
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

  actualizarControlesCatalogo();
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
  panelCatalogo.hidden = true;
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

function actualizarControlesCatalogo() {
  const habilitado = Boolean(usuarioActual) && !ocupado;

  busquedaTitulo.disabled = !habilitado;
  busquedaAnio.disabled = !habilitado;
  botonBuscar.disabled = !habilitado;
  botonAnterior.disabled = !habilitado || cargandoBusqueda ||
    !estadoCatalogoUI.puedeAnterior();
  botonSiguiente.disabled = !habilitado || cargandoBusqueda ||
    !estadoCatalogoUI.puedeSiguiente();
  botonVolver.disabled = !habilitado;
  botonReintentarCatalogo.disabled = !habilitado || cargandoBusqueda;
  botonReintentarDetalle.disabled = !habilitado || cargandoDetalle;
  botonReintentarDisponibilidad.disabled = !habilitado || cargandoDisponibilidad;

  formBusqueda.setAttribute("aria-busy", String(cargandoBusqueda));
  detallePelicula.setAttribute("aria-busy", String(cargandoDetalle));
  disponibilidadPelicula.setAttribute("aria-busy", String(cargandoDisponibilidad));

  if (!estadoCatalogoUI.busqueda) {
    paginacion.hidden = true;
  }
}

function ocultarErrorCatalogo() {
  errorCatalogo.textContent = "";
  errorCatalogo.hidden = true;
  botonReintentarCatalogo.hidden = true;
}

function mostrarErrorCatalogo(texto) {
  errorCatalogo.textContent = texto;
  errorCatalogo.hidden = false;
}

function ocultarErrorDetalle() {
  errorDetalle.textContent = "";
  errorDetalle.hidden = true;
  botonReintentarDetalle.hidden = true;
}

function mostrarErrorDetalle(texto) {
  errorDetalle.textContent = texto;
  errorDetalle.hidden = false;
}

function ocultarErrorDisponibilidad() {
  errorDisponibilidad.textContent = "";
  errorDisponibilidad.hidden = true;
  botonReintentarDisponibilidad.hidden = true;
}

function mostrarErrorDisponibilidad(texto) {
  errorDisponibilidad.textContent = texto;
  errorDisponibilidad.hidden = false;
}

function limpiarDisponibilidadUI() {
  estadoDisponibilidadUI.limpiar();
  cargandoDisponibilidad = false;
  disponibilidadPendiente = null;

  disponibilidadPelicula.hidden = true;
  estadoDisponibilidad.textContent = "";
  contenidoDisponibilidad.hidden = true;
  mensajeDisponibilidad.textContent = "";
  mensajeDisponibilidad.hidden = true;
  gruposDisponibilidad.replaceChildren();
  fuenteDisponibilidad.textContent = "";
  fechaDisponibilidad.textContent = "";
  fechaDisponibilidad.removeAttribute("datetime");
  enlaceDisponibilidad.hidden = true;
  enlaceDisponibilidad.removeAttribute("href");
  ocultarErrorDisponibilidad();
}

function crearGrupoDisponibilidad(seccion) {
  const grupo = document.createElement("div");
  grupo.className = "grupo-disponibilidad";
  const titulo = document.createElement("h5");
  titulo.textContent = seccion.titulo;
  const lista = document.createElement("ul");

  for (const proveedor of seccion.proveedores) {
    const elemento = document.createElement("li");
    elemento.textContent = proveedor.nombre;
    lista.append(elemento);
  }

  grupo.append(titulo, lista);
  return grupo;
}

function renderizarDisponibilidad(disponibilidad) {
  gruposDisponibilidad.replaceChildren();

  for (const seccion of seccionesDisponibilidad(disponibilidad)) {
    if (seccion.proveedores.length > 0) {
      gruposDisponibilidad.append(crearGrupoDisponibilidad(seccion));
    }
  }

  mensajeDisponibilidad.textContent = disponibilidad.mensaje ?? "";
  mensajeDisponibilidad.hidden = !disponibilidad.mensaje;

  const fecha = textoConsultadoEn(disponibilidad.consultadoEn);
  fechaDisponibilidad.textContent = fecha
    ? `Consultado en CineMatch: ${fecha}.`
    : "";
  if (fecha) {
    fechaDisponibilidad.dateTime = disponibilidad.consultadoEn;
  } else {
    fechaDisponibilidad.removeAttribute("datetime");
  }

  fuenteDisponibilidad.textContent = TEXTO_DISPONIBILIDAD_FUENTE;
  enlaceDisponibilidad.hidden = !disponibilidad.enlace;
  if (disponibilidad.enlace) {
    enlaceDisponibilidad.href = disponibilidad.enlace;
  } else {
    enlaceDisponibilidad.removeAttribute("href");
  }

  contenidoDisponibilidad.hidden = false;
  disponibilidadPelicula.hidden = false;
  estadoDisponibilidad.textContent = "";
  ocultarErrorDisponibilidad();
  actualizarControlesCatalogo();
}

async function cargarDisponibilidad(id) {
  if (!usuarioActual || ocupado) return;

  const solicitud = estadoDisponibilidadUI.iniciar(id);

  disponibilidadPendiente = { id };
  cargandoDisponibilidad = true;
  disponibilidadPelicula.hidden = false;
  contenidoDisponibilidad.hidden = true;
  mensajeDisponibilidad.textContent = "";
  mensajeDisponibilidad.hidden = true;
  gruposDisponibilidad.replaceChildren();
  fuenteDisponibilidad.textContent = "";
  fechaDisponibilidad.textContent = "";
  fechaDisponibilidad.removeAttribute("datetime");
  enlaceDisponibilidad.hidden = true;
  enlaceDisponibilidad.removeAttribute("href");
  estadoDisponibilidad.textContent = TEXTO_DISPONIBILIDAD_CARGANDO;
  ocultarErrorDisponibilidad();
  actualizarControlesCatalogo();

  try {
    const datos = await obtenerDisponibilidadPelicula(id);

    if (!estadoDisponibilidadUI.esVigente(solicitud) || !usuarioActual) {
      return;
    }

    if (!estadoDisponibilidadUI.confirmar(solicitud, datos)) return;

    disponibilidadPendiente = null;
    renderizarDisponibilidad(estadoDisponibilidadUI.disponibilidad);
  } catch (error) {
    if (!estadoDisponibilidadUI.esVigente(solicitud) || !usuarioActual) {
      return;
    }

    if (error?.estado === 401) {
      volverAlAccesoPorSesion();
      return;
    }

    estadoDisponibilidad.textContent = "";
    mostrarErrorDisponibilidad(
      error?.message ??
        "No se pudo consultar la disponibilidad. Puedes reintentar."
    );
    botonReintentarDisponibilidad.hidden = false;
    errorDisponibilidad.focus();
  } finally {
    if (estadoDisponibilidadUI.esVigente(solicitud)) {
      cargandoDisponibilidad = false;
      actualizarControlesCatalogo();
    }
  }
}

function limpiarCatalogoUI() {
  estadoCatalogoUI.limpiar();
  cargandoBusqueda = false;
  cargandoDetalle = false;
  reintentoBusqueda = null;
  detallePendiente = null;
  focoDetalle = null;

  formBusqueda.reset();
  listaPeliculas.replaceChildren();
  resultados.hidden = true;
  resumenResultados.textContent = "";
  paginaActual.textContent = "";
  paginacion.hidden = true;

  detallePelicula.hidden = true;
  detalleContenido.hidden = true;
  detalleCartel.replaceChildren();
  detalleTitulo.textContent = "";
  detalleAnio.textContent = "";
  detalleDuracion.textContent = "";
  detalleGeneros.textContent = "";
  detalleSinopsis.textContent = "";
  limpiarDisponibilidadUI();

  estadoCatalogo.textContent = "";
  estadoDetalle.textContent = "";
  ocultarErrorCatalogo();
  ocultarErrorDetalle();
  actualizarControlesCatalogo();
}

function crearTextoCartelNoDisponible() {
  const texto = document.createElement("span");
  texto.className = "cartel-no-disponible";
  texto.textContent = TEXTO_CARTEL_AUSENTE;
  return texto;
}

function crearCartel(url, titulo) {
  const marco = document.createElement("span");
  marco.className = "cartel-marco";
  const urlSegura = urlCartelSegura(url);

  if (!urlSegura) {
    marco.append(crearTextoCartelNoDisponible());
    return marco;
  }

  const imagen = document.createElement("img");
  imagen.className = "cartel-imagen";
  imagen.src = urlSegura;
  imagen.alt = `Cartel de ${titulo}`;
  imagen.loading = "lazy";
  imagen.decoding = "async";
  imagen.addEventListener("error", () => {
    imagen.remove();
    marco.append(crearTextoCartelNoDisponible());
  }, { once: true });
  marco.append(imagen);
  return marco;
}

function crearTarjeta(pelicula) {
  const titulo = textoTitulo(pelicula?.titulo);
  const anio = textoAnio(pelicula?.anio);
  const item = document.createElement("li");
  const boton = document.createElement("button");

  boton.type = "button";
  boton.className = "tarjeta-pelicula";
  boton.setAttribute("aria-label", `Ver ficha de ${titulo}. ${anio}`);

  const datos = document.createElement("span");
  datos.className = "tarjeta-datos";

  const tituloElemento = document.createElement("span");
  tituloElemento.className = "tarjeta-titulo";
  tituloElemento.textContent = titulo;

  const anioElemento = document.createElement("span");
  anioElemento.className = "tarjeta-anio";
  anioElemento.textContent = anio;

  datos.append(tituloElemento, anioElemento);
  boton.append(crearCartel(pelicula?.cartel, titulo), datos);
  boton.addEventListener("click", () => abrirDetalle(pelicula, boton));
  item.append(boton);
  return item;
}

function renderizarResultados() {
  const busqueda = estadoCatalogoUI.busqueda;

  listaPeliculas.replaceChildren();
  ocultarErrorCatalogo();

  if (!busqueda || busqueda.peliculas.length === 0) {
    resultados.hidden = true;
    resumenResultados.textContent = "";
    paginaActual.textContent = "";
    paginacion.hidden = true;
    estadoCatalogo.textContent =
      "No se encontraron películas con esos criterios. Prueba otro título o año.";
    actualizarControlesCatalogo();
    return;
  }

  for (const pelicula of busqueda.peliculas) {
    listaPeliculas.append(crearTarjeta(pelicula));
  }

  resumenResultados.textContent = textoResumenResultados(busqueda);
  paginaActual.textContent = textoPaginaActual(
    busqueda.pagina,
    busqueda.totalPaginas
  );
  paginacion.hidden = false;
  resultados.hidden = false;
  estadoCatalogo.textContent = "";
  actualizarControlesCatalogo();
}

function renderizarDetalle(ficha) {
  const titulo = textoTitulo(ficha?.titulo);
  const anio = textoAnio(ficha?.anio);

  detalleCartel.replaceChildren(crearCartel(ficha?.cartel, titulo));
  detalleTitulo.textContent = titulo;
  detalleAnio.textContent = anio === TEXTO_ANIO_AUSENTE
    ? anio
    : `Año: ${anio}`;
  detalleDuracion.textContent = textoDuracion(ficha?.duracion);
  detalleGeneros.textContent = textoGeneros(ficha?.generos);
  detalleSinopsis.textContent = textoSinopsis(ficha?.sinopsis);
  detalleContenido.hidden = false;
  estadoDetalle.textContent = "";
  ocultarErrorDetalle();
  actualizarControlesCatalogo();
}

function volverAlAccesoPorSesion() {
  mostrarUsuario(null);
  mostrarMensaje(
    "Tu sesión ya no es válida. Vuelve a iniciar sesión.",
    true
  );
  document.getElementById("login-email").focus();
}

async function ejecutarBusqueda(consulta, solicitudExistente = null) {
  if (!usuarioActual || ocupado) return;

  cerrarDetalle({ restaurarFoco: false });

  const solicitud = solicitudExistente ??
    estadoCatalogoUI.iniciarBusqueda(
      consulta.titulo,
      consulta.anio,
      consulta.pagina ?? 1
    );

  reintentoBusqueda = { ...solicitud.consulta };
  cargandoBusqueda = true;

  listaPeliculas.replaceChildren();
  resultados.hidden = true;
  paginacion.hidden = true;
  resumenResultados.textContent = "";
  paginaActual.textContent = "";
  estadoCatalogo.textContent = "Buscando películas...";
  ocultarErrorCatalogo();
  actualizarControlesCatalogo();

  try {
    const respuesta = await buscarPeliculas(solicitud.consulta);

    if (!estadoCatalogoUI.esVigenteBusqueda(solicitud) || !usuarioActual) {
      return;
    }

    if (!estadoCatalogoUI.confirmarBusqueda(solicitud, respuesta)) return;

    reintentoBusqueda = null;
    renderizarResultados();

    if (estadoCatalogoUI.busqueda.peliculas.length > 0) {
      resumenResultados.focus();
    } else {
      estadoCatalogo.focus();
    }
  } catch (error) {
    if (!estadoCatalogoUI.esVigenteBusqueda(solicitud) || !usuarioActual) {
      return;
    }

    if (error?.estado === 401) {
      volverAlAccesoPorSesion();
      return;
    }

    estadoCatalogo.textContent = "";
    mostrarErrorCatalogo(
      error?.message ?? "No se pudo realizar la búsqueda."
    );
    botonReintentarCatalogo.hidden = false;
    errorCatalogo.focus();
  } finally {
    if (estadoCatalogoUI.esVigenteBusqueda(solicitud)) {
      cargandoBusqueda = false;
      actualizarControlesCatalogo();
    }
  }
}

async function cargarDetalle(id) {
  if (!usuarioActual || ocupado) return;

  const solicitud = estadoCatalogoUI.iniciarDetalle(id);

  detallePendiente = { id };
  cargandoDetalle = true;
  detalleContenido.hidden = true;
  detalleCartel.replaceChildren();
  detalleTitulo.textContent = "";
  detalleAnio.textContent = "";
  detalleDuracion.textContent = "";
  detalleGeneros.textContent = "";
  detalleSinopsis.textContent = "";
  estadoDetalle.textContent = "Cargando ficha...";
  limpiarDisponibilidadUI();
  ocultarErrorDetalle();
  actualizarControlesCatalogo();

  try {
    const ficha = await obtenerDetallePelicula(id);

    if (!estadoCatalogoUI.esVigenteDetalle(solicitud) || !usuarioActual) {
      return;
    }

    if (!estadoCatalogoUI.confirmarDetalle(solicitud, ficha)) return;

    renderizarDetalle(ficha);
    detalleTitulo.focus();
    void cargarDisponibilidad(ficha.id);
  } catch (error) {
    if (!estadoCatalogoUI.esVigenteDetalle(solicitud) || !usuarioActual) {
      return;
    }

    if (error?.estado === 401) {
      volverAlAccesoPorSesion();
      return;
    }

    estadoDetalle.textContent = "";
    mostrarErrorDetalle(
      error?.message ?? "No se pudo cargar la ficha de la película."
    );
    botonReintentarDetalle.hidden = false;
    errorDetalle.focus();
  } finally {
    if (estadoCatalogoUI.esVigenteDetalle(solicitud)) {
      cargandoDetalle = false;
      actualizarControlesCatalogo();
    }
  }
}

function abrirDetalle(pelicula, boton) {
  if (ocupado || !usuarioActual) return;

  if (!Number.isSafeInteger(pelicula?.id) || pelicula.id <= 0) {
    mostrarMensaje("No se pudo abrir la ficha de la película.", true);
    return;
  }

  focoDetalle = boton ?? null;
  resultados.hidden = true;
  detallePelicula.hidden = false;
  detallePelicula.focus();
  cargarDetalle(pelicula.id);
}

function cerrarDetalle({ restaurarFoco = true } = {}) {
  estadoCatalogoUI.cerrarDetalle();
  cargandoDetalle = false;
  detallePendiente = null;

  detallePelicula.hidden = true;
  detalleContenido.hidden = true;
  detalleCartel.replaceChildren();
  detalleTitulo.textContent = "";
  detalleAnio.textContent = "";
  detalleDuracion.textContent = "";
  detalleGeneros.textContent = "";
  detalleSinopsis.textContent = "";
  estadoDetalle.textContent = "";
  limpiarDisponibilidadUI();
  ocultarErrorDetalle();

  const busqueda = estadoCatalogoUI.busqueda;
  resultados.hidden = !busqueda || busqueda.peliculas.length === 0;
  actualizarControlesCatalogo();

  const destino = focoDetalle;
  focoDetalle = null;

  if (restaurarFoco && destino?.isConnected) {
    destino.focus();
  }
}

function irAPagina(direccion) {
  if (ocupado || cargandoBusqueda || !usuarioActual) return;

  const solicitud = direccion === "anterior"
    ? estadoCatalogoUI.irPaginaAnterior()
    : estadoCatalogoUI.irPaginaSiguiente();

  if (!solicitud) return;

  ejecutarBusqueda(solicitud.consulta, solicitud);
}

function validarFormularioBusqueda() {
  const validacion = validarBusqueda({
    titulo: busquedaTitulo.value,
    anio: busquedaAnio.value
  });

  busquedaTitulo.removeAttribute("aria-invalid");
  busquedaAnio.removeAttribute("aria-invalid");

  if (validacion.valido) return validacion;

  const campo = validacion.campo === "anio" ? busquedaAnio : busquedaTitulo;
  campo.setAttribute("aria-invalid", "true");
  campo.focus();
  mostrarErrorCatalogo(validacion.error);
  botonReintentarCatalogo.hidden = true;
  return null;
}

formBusqueda.addEventListener("submit", evento => {
  evento.preventDefault();

  if (ocupado || !usuarioActual) return;

  const validacion = validarFormularioBusqueda();
  if (!validacion) return;

  ejecutarBusqueda({
    titulo: validacion.titulo,
    anio: validacion.anio,
    pagina: 1
  });
});

botonAnterior.addEventListener("click", () => irAPagina("anterior"));
botonSiguiente.addEventListener("click", () => irAPagina("siguiente"));

botonReintentarCatalogo.addEventListener("click", () => {
  if (ocupado || cargandoBusqueda || !reintentoBusqueda) return;
  ejecutarBusqueda({ ...reintentoBusqueda });
});

botonReintentarDetalle.addEventListener("click", () => {
  if (ocupado || cargandoDetalle || !detallePendiente) return;
  cargarDetalle(detallePendiente.id);
});

botonReintentarDisponibilidad.addEventListener("click", () => {
  if (ocupado || cargandoDisponibilidad || !disponibilidadPendiente) return;
  cargarDisponibilidad(disponibilidadPendiente.id);
});

botonVolver.addEventListener("click", () => cerrarDetalle());

detallePelicula.addEventListener("keydown", evento => {
  if (evento.key === "Escape") {
    evento.preventDefault();
    cerrarDetalle();
  }
});

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
// El botón funciona con ratón y teclado y nunca envía el formulario.
for (const boton of document.querySelectorAll("[data-password]")) {
  const campo = document.getElementById(boton.dataset.password);
  const actualizar = (visible) => {
    campo.type = visible ? "text" : "password";
    boton.setAttribute("aria-pressed", String(visible));
    const texto = visible ? "Ocultar contraseña" : "Mostrar contraseña";
    boton.setAttribute("aria-label", texto);
    boton.querySelector("[data-texto]").textContent = texto;
  };
  boton.addEventListener("click", () => actualizar(campo.type === "password"));
  campo.form.addEventListener("submit", () => actualizar(false));
}

const passwordRegistro = document.getElementById("registro-password");
passwordRegistro.addEventListener("input", () => {
  const longitud = [...passwordRegistro.value].length;
  passwordRegistro.setCustomValidity(longitud >= 8 && longitud <= 128
    ? "" : "La contraseña debe tener entre 8 y 128 caracteres.");
});
