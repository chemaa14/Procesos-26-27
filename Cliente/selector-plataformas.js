import { obtenerPlataformas, obtenerPreferenciasPlataformas, guardarPreferenciasPlataformas } from "./rest.js";
import { crearEstadoPreferencias, leerCatalogoPlataformas, opcionesPlataformas, filtrarPlataformas } from "./preferencias-estado.js";

export function crearSelectorPlataformas(panel, { estaOcupado, alCaducar, alGuardar }) {
  const estado = crearEstadoPreferencias();
  const buscar = id => panel.querySelector(`#${id}`);
  const form = buscar("form-plataformas"), filtro = buscar("filtro-plataformas");
  const lista = buscar("lista-plataformas"), resumen = buscar("resumen-plataformas");
  const mensaje = buscar("mensaje-plataformas"), errorPreferencias = buscar("error-preferencias");
  const errorCatalogo = buscar("error-plataformas"), reintentarPreferencias = buscar("reintentar-preferencias");
  const reintentarCatalogo = buscar("reintentar-plataformas"), guardar = buscar("guardar-plataformas");
  const quitar = buscar("quitar-plataformas"), cantidad = buscar("cantidad-plataformas");
  let usuarioId = null, catalogo = null, cargandoPreferencias = false, cargandoCatalogo = false, guardando = false;

  function opciones() { return opcionesPlataformas(catalogo, estado.guardadas); }
  function hayObsoletas() {
    return catalogo !== null && estado.seleccion.some(id => !catalogo.some(p => p.id === id));
  }
  function actualizarControles() {
    const bloqueado = !usuarioId || estaOcupado() || guardando;
    filtro.disabled = bloqueado || !estado.cargado;
    for (const checkbox of lista.querySelectorAll("input")) checkbox.disabled = bloqueado || !estado.cargado;
    quitar.disabled = bloqueado || !estado.cargado || estado.seleccion.length === 0;
    guardar.disabled = bloqueado || !estado.cargado || !estado.cambios ||
      (estado.seleccion.length > 0 && (catalogo === null || hayObsoletas()));
    reintentarPreferencias.disabled = bloqueado || cargandoPreferencias;
    reintentarCatalogo.disabled = bloqueado || cargandoCatalogo;
    form.setAttribute("aria-busy", String(cargandoPreferencias || guardando));
  }
  function renderizarLista() {
    lista.replaceChildren();
    const visibles = filtrarPlataformas(opciones(), filtro.value);
    const seleccionadas = new Set(estado.seleccion);
    for (const plataforma of visibles) {
      const etiqueta = document.createElement("label");
      etiqueta.className = "opcion-plataforma";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = String(plataforma.id);
      checkbox.checked = seleccionadas.has(plataforma.id);
      const texto = document.createElement("span");
      texto.textContent = plataforma.nombre;
      if (plataforma.ausente) {
        const aviso = document.createElement("small");
        aviso.textContent = plataforma.aviso;
        texto.append(document.createElement("br"), aviso);
      }
      checkbox.addEventListener("change", () => {
        estado.seleccionar(plataforma.id, checkbox.checked);
        mensaje.textContent = "";
        actualizarResumen();
        actualizarControles();
      });
      etiqueta.append(checkbox, texto);
      lista.append(etiqueta);
    }
    cantidad.textContent = visibles.length ? `${visibles.length} ${visibles.length === 1 ? "plataforma mostrada" : "plataformas mostradas"}` :
      cargandoCatalogo ? "Cargando catálogo de plataformas…" :
        catalogo === null ? "El catálogo aún no está disponible." : "No hay plataformas que coincidan con el filtro.";
    actualizarControles();
  }
  function actualizarResumen() {
    if (!estado.cargado) {
      resumen.textContent = cargandoPreferencias ? "Recuperando tus plataformas…" : "No se han podido recuperar tus preferencias.";
      return;
    }
    const numero = estado.seleccion.length;
    resumen.textContent = numero === 0 ? "No has seleccionado ninguna plataforma." :
      `${numero} ${numero === 1 ? "plataforma seleccionada" : "plataformas seleccionadas"}.`;
    if (estado.cambios) resumen.textContent += " Cambios sin guardar.";
    if (hayObsoletas()) resumen.textContent += " Retira las plataformas que ya no aparecen en el catálogo para guardar.";
    else if (catalogo === null && numero > 0) resumen.textContent += " Recupera el catálogo para guardar una selección no vacía.";
  }
  function errorCarga(elemento, boton, error) {
    elemento.textContent = error?.message ?? "No se pudieron cargar las plataformas.";
    elemento.hidden = false; boton.hidden = false;
  }
  function comprobarError(token, error) {
    if (!estado.vigente(token) || !usuarioId) return false;
    if (error?.estado === 401) { alCaducar(); return false; }
    return true;
  }
  async function cargarPreferencias() {
    if (!usuarioId || cargandoPreferencias) return;
    const token = estado.version;
    cargandoPreferencias = true;
    errorPreferencias.hidden = true; reintentarPreferencias.hidden = true;
    actualizarResumen(); actualizarControles();
    try {
      const resultado = await obtenerPreferenciasPlataformas();
      if (!estado.vigente(token) || !usuarioId) return;
      estado.recibir(token, resultado);
    } catch (error) {
      if (comprobarError(token, error)) errorCarga(errorPreferencias, reintentarPreferencias, error);
    } finally {
      if (estado.vigente(token)) {
        cargandoPreferencias = false;
        renderizarLista(); actualizarResumen(); actualizarControles();
      }
    }
  }
  async function cargarCatalogo() {
    if (!usuarioId || cargandoCatalogo) return;
    const token = estado.version;
    cargandoCatalogo = true;
    errorCatalogo.hidden = true; reintentarCatalogo.hidden = true;
    renderizarLista();
    try {
      const resultado = await obtenerPlataformas();
      if (!estado.vigente(token) || !usuarioId) return;
      catalogo = leerCatalogoPlataformas(resultado);
    } catch (error) {
      if (comprobarError(token, error)) errorCarga(errorCatalogo, reintentarCatalogo, error);
    } finally {
      if (estado.vigente(token)) {
        cargandoCatalogo = false;
        renderizarLista(); actualizarResumen(); actualizarControles();
      }
    }
  }
  form.addEventListener("submit", async evento => {
    evento.preventDefault();
    actualizarControles();
    if (guardar.disabled) return;
    const solicitud = estado.prepararGuardado();
    guardando = true;
    mensaje.classList.remove("error");
    mensaje.textContent = "Guardando tus plataformas…";
    actualizarControles();
try {
      const resultado = await guardarPreferenciasPlataformas(solicitud.ids);
      if (!estado.confirmar(solicitud, resultado)) return;
      mensaje.textContent = solicitud.ids.length ? "Tus plataformas se han guardado." : "Se ha guardado la selección vacía. No tienes plataformas seleccionadas.";
      if (typeof alGuardar === "function") {
        try {
          alGuardar(resultado);
        } catch {
        }
      }
    } catch (error) {
      if (comprobarError(solicitud.version, error)) {
        mensaje.classList.add("error");
        mensaje.textContent = `${error.message ?? "No se pudo guardar."} Tus cambios siguen pendientes. Vuelve a pulsar Guardar plataformas.`;
      }
    } finally {
      if (estado.vigente(solicitud.version)) {
        guardando = false;
        renderizarLista(); actualizarResumen(); actualizarControles();
      }
    }
  });
  filtro.addEventListener("input", renderizarLista);
  quitar.addEventListener("click", () => {
    if (quitar.disabled) return;
    estado.vaciar(); mensaje.textContent = "";
    renderizarLista(); actualizarResumen();
  });
  reintentarPreferencias.addEventListener("click", cargarPreferencias);
  reintentarCatalogo.addEventListener("click", cargarCatalogo);
  return {
    actualizarControles,
    cambiarUsuario(usuario) {
      const nuevoId = usuario?.id ?? null;
      if (nuevoId === usuarioId && nuevoId !== null) return;
      usuarioId = nuevoId;
      estado.reiniciar(); catalogo = null;
      cargandoCatalogo = false; cargandoPreferencias = false; guardando = false;
      filtro.value = ""; lista.replaceChildren(); resumen.textContent = ""; cantidad.textContent = "";
      mensaje.textContent = ""; mensaje.classList.remove("error");
      errorPreferencias.hidden = true; errorCatalogo.hidden = true;
      reintentarPreferencias.hidden = true; reintentarCatalogo.hidden = true;
      panel.hidden = !usuarioId;
      actualizarControles();
      if (usuarioId) { cargarPreferencias(); cargarCatalogo(); }
    }
  };
}
