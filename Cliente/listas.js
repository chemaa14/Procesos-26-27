import {
  obtenerListasPeliculas,
  guardarEnListaPeliculas,
  eliminarDeListaPeliculas,
  comprobarDisponibilidadListas
} from "./rest.js";
import { textoAnio, textoTitulo } from "./catalogo.js";

export function dividirListas(elementos = []) {
  const quieroVer = [];
  const vistas = [];
  for (const item of elementos) {
    if (item?.estado === "vistas") vistas.push(item);
    else if (item?.estado === "quiero_ver") quieroVer.push(item);
  }
  return { quieroVer, vistas };
}

export function contarNuevasDisponibles(elementos = []) {
  return elementos.filter(
    item => item?.estado === "quiero_ver" && Boolean(item?.recienDisponible)
  ).length;
}

export function textoAlertaDisponibilidad(elemento) {
  if (!elemento || !elemento.disponibleEnPlataformas) return "";
  const nombres = (elemento.plataformasCoincidentes ?? [])
    .map(p => p?.nombre)
    .filter(Boolean);
  const sufijo = nombres.length ? `: ${nombres.join(", ")}` : "";
  return elemento.recienDisponible
    ? `¡Nueva en tus plataformas!${sufijo}`
    : `Disponible en tus plataformas${sufijo}`;
}

function clonarElemento(elemento) {
  return {
    ...elemento,
    plataformasCoincidentes: Array.isArray(elemento?.plataformasCoincidentes)
      ? elemento.plataformasCoincidentes.map(p => ({ ...p }))
      : []
  };
}

export function crearEstadoListas() {
  let version = 0;
  let usuarioId = null;
  let elementos = [];
  let pendientes = 0;

  function esVigente(solicitud) {
    return Boolean(
      solicitud &&
      usuarioId !== null &&
      solicitud.version === version &&
      solicitud.usuarioId === usuarioId
    );
  }

  return {
    get version() { return version; },
    get usuarioId() { return usuarioId; },
    get cargando() { return pendientes > 0; },
    get elementos() { return elementos.map(clonarElemento); },
    esVigente,
    cambiarUsuario(usuario) {
      const nuevoId = usuario?.id ?? null;
      if (nuevoId === usuarioId && nuevoId !== null) return false;
      version += 1;
      usuarioId = nuevoId;
      elementos = [];
      pendientes = 0;
      return true;
    },
    iniciarOperacion() {
      if (usuarioId === null) return null;
      pendientes += 1;
      return { version, usuarioId };
    },
    finalizarOperacion(solicitud) {
      if (!esVigente(solicitud)) return false;
      pendientes = Math.max(0, pendientes - 1);
      return true;
    },
    reemplazarElementos(solicitud, lista) {
      if (!esVigente(solicitud)) return false;
      elementos = Array.isArray(lista) ? lista.map(clonarElemento) : [];
      return true;
    },
    aplicarGuardado(solicitud, elemento) {
      if (!esVigente(solicitud) || !elemento) return false;
      const copia = clonarElemento(elemento);
      const indice = elementos.findIndex(item => item.peliculaId === copia.peliculaId);
      if (indice >= 0) elementos[indice] = copia;
      else elementos.unshift(copia);
      return true;
    },
    aplicarEliminado(solicitud, peliculaId) {
      if (!esVigente(solicitud)) return false;
      elementos = elementos.filter(item => item.peliculaId !== peliculaId);
      return true;
    }
  };
}

export function crearControladorListas(dom, {
  estaOcupado = () => false,
  obtenerDetalleActual = () => null,
  abrirDetalle = () => {},
  alCaducar = () => {}
} = {}) {
  const estado = crearEstadoListas();

  function actualizarControles() {
    const listaActual = estado.elementos;
    const ficha = obtenerDetalleActual();
    const enLista = ficha
      ? (listaActual.find(item => item.peliculaId === ficha.id) ?? null)
      : null;
    const hayPendientes = listaActual.some(item => item.estado === "quiero_ver");
    const bloqueado = estado.usuarioId === null || estaOcupado() || estado.cargando;

    dom.botonComprobarListas.disabled = bloqueado || !hayPendientes;

    for (const contenedor of [dom.listaQuieroVer, dom.listaVistas]) {
      for (const boton of contenedor.querySelectorAll("button")) {
        boton.disabled = bloqueado;
      }
    }

    const habilitadoDetalle = !bloqueado && Boolean(ficha);
    dom.botonQuieroVer.disabled = !habilitadoDetalle || enLista?.estado === "quiero_ver";
    dom.botonMarcarVista.disabled = !habilitadoDetalle || enLista?.estado === "vistas";
    dom.botonQuitarLista.hidden = !enLista;
    dom.botonQuitarLista.disabled = !habilitadoDetalle || !enLista;

    if (!ficha || !enLista) {
      dom.estadoListaDetalle.textContent = "";
    } else if (enLista.estado === "quiero_ver") {
      const alerta = textoAlertaDisponibilidad(enLista);
      dom.estadoListaDetalle.textContent = alerta
        ? `En tu lista "Quiero ver". ${alerta}.`
        : 'Guardada en tu lista "Quiero ver".';
    } else {
      dom.estadoListaDetalle.textContent = 'Marcada en tu lista "Vistas".';
    }
  }

  function crearItemListaPersonal(elemento) {
    const li = document.createElement("li");
    li.className = "item-lista-personal";
    if (elemento.estado === "quiero_ver" && elemento.disponibleEnPlataformas) {
      li.classList.add("es-disponible");
    }

    const cabecera = document.createElement("div");
    cabecera.className = "item-lista-cabecera";

    const info = document.createElement("div");
    const titulo = document.createElement("p");
    titulo.className = "item-lista-titulo";
    titulo.textContent = textoTitulo(elemento.titulo);

    const anio = document.createElement("span");
    anio.className = "item-lista-anio";
    anio.textContent = textoAnio(elemento.anio);

    info.append(titulo, anio);
    cabecera.append(info);

    const textoAlerta = elemento.estado === "quiero_ver"
      ? textoAlertaDisponibilidad(elemento)
      : "";
    if (textoAlerta) {
      const badge = document.createElement("span");
      badge.className = "badge-disponible";
      badge.textContent = textoAlerta;
      cabecera.append(badge);
    }

    const acciones = document.createElement("div");
    acciones.className = "item-lista-acciones";

    const botonVerFicha = document.createElement("button");
    botonVerFicha.type = "button";
    botonVerFicha.className = "boton boton-secundario";
    botonVerFicha.textContent = "Ver ficha";
    botonVerFicha.addEventListener("click", () => {
      abrirDetalle({ id: elemento.peliculaId, titulo: elemento.titulo }, botonVerFicha);
    });

    const botonMover = document.createElement("button");
    botonMover.type = "button";
    botonMover.className = "boton boton-secundario";
    const nuevoEstado = elemento.estado === "quiero_ver" ? "vistas" : "quiero_ver";
    botonMover.textContent = nuevoEstado === "vistas" ? "Marcar vista" : "Mover a Quiero ver";
    botonMover.addEventListener("click", () => {
      void guardar({
        peliculaId: elemento.peliculaId,
        titulo: elemento.titulo,
        anio: elemento.anio,
        cartel: elemento.cartel
      }, nuevoEstado);
    });

    const botonEliminarLista = document.createElement("button");
    botonEliminarLista.type = "button";
    botonEliminarLista.className = "boton boton-peligro";
    botonEliminarLista.textContent = "Quitar";
    botonEliminarLista.addEventListener("click", () => {
      void quitar(elemento.peliculaId);
    });

    acciones.append(botonVerFicha, botonMover, botonEliminarLista);
    li.append(cabecera, acciones);
    return li;
  }

  function renderizar() {
    const listaActual = estado.elementos;
    const { quieroVer, vistas } = dividirListas(listaActual);
    dom.contadorQuieroVer.textContent = String(quieroVer.length);
    dom.contadorVistas.textContent = String(vistas.length);
    dom.vacioQuieroVer.hidden = quieroVer.length > 0;
    dom.vacioVistas.hidden = vistas.length > 0;

    dom.listaQuieroVer.replaceChildren(...quieroVer.map(crearItemListaPersonal));
    dom.listaVistas.replaceChildren(...vistas.map(crearItemListaPersonal));

    const nuevas = contarNuevasDisponibles(listaActual);
    const disponibles = quieroVer.filter(item => item.disponibleEnPlataformas).length;
    if (nuevas > 0) {
      dom.alertaListas.hidden = false;
      dom.alertaListas.textContent = nuevas === 1
        ? "¡1 película de tu lista 'Quiero ver' ya está disponible en tus plataformas!"
        : `¡${nuevas} películas de tu lista 'Quiero ver' ya están disponibles en tus plataformas!`;
    } else if (disponibles > 0) {
      dom.alertaListas.hidden = false;
      dom.alertaListas.textContent = disponibles === 1
        ? "Tienes 1 película de 'Quiero ver' incluida en tus plataformas."
        : `Tienes ${disponibles} películas de 'Quiero ver' incluidas en tus plataformas.`;
    } else {
      dom.alertaListas.hidden = true;
      dom.alertaListas.textContent = "";
    }

    actualizarControles();
  }

  async function cargar() {
    if (estado.usuarioId === null || estado.cargando) return;
    const solicitud = estado.iniciarOperacion();
    if (!solicitud) return;

    dom.estadoListas.textContent = "Cargando tus listas...";
    renderizar();

    try {
      const respuesta = await obtenerListasPeliculas();
      if (!estado.esVigente(solicitud)) return;
      estado.reemplazarElementos(solicitud, respuesta?.elementos ?? []);
      dom.estadoListas.textContent = "";
    } catch (error) {
      if (!estado.esVigente(solicitud)) return;
      if (error?.estado === 401) {
        alCaducar();
        return;
      }
      dom.estadoListas.textContent = error?.message ?? "No se pudieron cargar tus listas.";
    } finally {
      if (estado.finalizarOperacion(solicitud)) {
        renderizar();
      }
    }
  }

  async function guardar(pelicula, estadoDestino) {
    if (estado.usuarioId === null || estaOcupado() || estado.cargando) return;
    const solicitud = estado.iniciarOperacion();
    if (!solicitud) return;

    dom.estadoListas.textContent = "Guardando en tu lista...";
    renderizar();

    try {
      const { elemento } = await guardarEnListaPeliculas(pelicula.peliculaId ?? pelicula.id, {
        estado: estadoDestino,
        titulo: pelicula.titulo,
        anio: pelicula.anio ?? null,
        cartel: pelicula.cartel ?? null
      });
      if (!estado.esVigente(solicitud)) return;
      estado.aplicarGuardado(solicitud, elemento);
      dom.estadoListas.textContent = "";
    } catch (error) {
      if (!estado.esVigente(solicitud)) return;
      if (error?.estado === 401) {
        alCaducar();
        return;
      }
      dom.estadoListas.textContent = error?.message ?? "No se pudo guardar la película.";
    } finally {
      if (estado.finalizarOperacion(solicitud)) {
        renderizar();
      }
    }
  }

  async function quitar(peliculaId) {
    if (estado.usuarioId === null || estaOcupado() || estado.cargando) return;
    const solicitud = estado.iniciarOperacion();
    if (!solicitud) return;

    dom.estadoListas.textContent = "Quitando de tu lista...";
    renderizar();

    try {
      await eliminarDeListaPeliculas(peliculaId);
      if (!estado.esVigente(solicitud)) return;
      estado.aplicarEliminado(solicitud, peliculaId);
      dom.estadoListas.textContent = "";
    } catch (error) {
      if (!estado.esVigente(solicitud)) return;
      if (error?.estado === 401) {
        alCaducar();
        return;
      }
      dom.estadoListas.textContent = error?.message ?? "No se pudo quitar la película.";
    } finally {
      if (estado.finalizarOperacion(solicitud)) {
        renderizar();
      }
    }
  }

  async function comprobar({ silencioso = false } = {}) {
    if (estado.usuarioId === null || estado.cargando) return;
    if (!silencioso && estaOcupado()) return;
    if (!estado.elementos.some(item => item.estado === "quiero_ver")) return;

    const solicitud = estado.iniciarOperacion();
    if (!solicitud) return;

    if (!silencioso) {
      dom.estadoListas.textContent = "Comprobando disponibilidad en tus plataformas...";
    }
    renderizar();

    try {
      const respuesta = await comprobarDisponibilidadListas();
      if (!estado.esVigente(solicitud)) return;
      estado.reemplazarElementos(solicitud, respuesta?.elementos ?? []);
      if (!silencioso) {
        dom.estadoListas.textContent = "Disponibilidad actualizada.";
      }
    } catch (error) {
      if (!estado.esVigente(solicitud)) return;
      if (error?.estado === 401) {
        alCaducar();
        return;
      }
      if (!silencioso) {
        dom.estadoListas.textContent = error?.message ?? "No se pudo comprobar la disponibilidad.";
      }
    } finally {
      if (estado.finalizarOperacion(solicitud)) {
        renderizar();
      }
    }
  }

  dom.botonQuieroVer.addEventListener("click", () => {
    const detalle = obtenerDetalleActual();
    if (detalle) void guardar(detalle, "quiero_ver");
  });
  dom.botonMarcarVista.addEventListener("click", () => {
    const detalle = obtenerDetalleActual();
    if (detalle) void guardar(detalle, "vistas");
  });
  dom.botonQuitarLista.addEventListener("click", () => {
    const detalle = obtenerDetalleActual();
    if (detalle) void quitar(detalle.id);
  });
  dom.botonComprobarListas.addEventListener("click", () => {
    void comprobar();
  });

  return {
    actualizarControles,
    cargar,
    guardar,
    quitar,
    comprobar,
    cambiarUsuario(usuario) {
      if (!estado.cambiarUsuario(usuario)) return;
      dom.estadoListas.textContent = "";
      dom.panelListas.hidden = estado.usuarioId === null;
      renderizar();
      if (estado.usuarioId !== null) {
        void cargar();
      }
    }
  };
}
