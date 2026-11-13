function idsValidos(ids) {
  if (!Array.isArray(ids) || Array.from(ids).some(id =>
    !Number.isInteger(id) || id < 1 || id > 2147483647)) {
    throw new Error("El servidor devolvió unas preferencias no válidas.");
  }
  return [...new Set(ids)].sort((a, b) => a - b);
}

function leerPreferencias(respuesta) {
  if (!respuesta || respuesta.region !== "ES") throw new Error("La región recibida no es válida.");
  return idsValidos(respuesta.plataformas);
}

export function leerCatalogoPlataformas(respuesta) {
  if (!respuesta || respuesta.region !== "ES" || !Array.isArray(respuesta.plataformas)) {
    throw new Error("El catálogo de plataformas no es válido.");
  }
  const unicas = new Map();
  for (const plataforma of respuesta.plataformas) {
    idsValidos([plataforma?.id]);
    if (typeof plataforma.nombre !== "string" || !plataforma.nombre.trim() ||
        /[\u0000-\u001f\u007f-\u009f]/.test(plataforma.nombre)) {
      throw new Error("El catálogo de plataformas no es válido.");
    }
    unicas.set(plataforma.id, { id: plataforma.id, nombre: plataforma.nombre.trim() });
  }
  return [...unicas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es") || a.id - b.id);
}

export function opcionesPlataformas(catalogo, guardadas = []) {
  const opciones = new Map((catalogo ?? []).map(p => [p.id, { ...p, ausente: false }]));
  for (const id of guardadas) if (!opciones.has(id)) opciones.set(id, {
    id, nombre: `Plataforma guardada (ID ${id})`, ausente: true,
    aviso: catalogo === null ? "Nombre no disponible" : "Ya no aparece en el catálogo de España"
  });
  return [...opciones.values()];
}

export function filtrarPlataformas(opciones, texto) {
  const normalizar = valor => valor.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const filtro = normalizar(texto);
  return opciones.filter(p => normalizar(`${p.nombre} ${p.id}`).includes(filtro));
}

export function crearEstadoPreferencias() {
  let version = 0, revision = 0, guardadas = null, seleccion = [];
  return {
    get version() { return version; },
    get cargado() { return guardadas !== null; },
    get guardadas() { return guardadas === null ? [] : [...guardadas]; },
    get seleccion() { return [...seleccion]; },
    get cambios() { return guardadas !== null && JSON.stringify(guardadas) !== JSON.stringify(seleccion); },
    vigente(token) { return token === version; },
    reiniciar() { version++; revision++; guardadas = null; seleccion = []; },
    recibir(token, respuesta) {
      if (token !== version) return false;
      guardadas = leerPreferencias(respuesta);
      seleccion = [...guardadas];
      revision++;
      return true;
    },
    seleccionar(id, marcado) {
      if (guardadas === null) return;
      idsValidos([id]);
      seleccion = idsValidos(marcado ? [...seleccion, id] : seleccion.filter(valor => valor !== id));
      revision++;
    },
    vaciar() { if (guardadas !== null) { seleccion = []; revision++; } },
    prepararGuardado() { return { version, revision, ids: [...seleccion] }; },
    confirmar(solicitud, respuesta) {
      if (solicitud.version !== version) return false;
      const confirmadas = leerPreferencias(respuesta);
      if (JSON.stringify(confirmadas) !== JSON.stringify(solicitud.ids)) {
        throw new Error("El servidor no confirmó la selección enviada. Reintenta el guardado.");
      }
      guardadas = confirmadas;
      if (revision === solicitud.revision) seleccion = [...confirmadas];
      return true;
    }
  };
}
