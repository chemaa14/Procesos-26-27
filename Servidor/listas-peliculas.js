import { ErrorDatos } from "./errores-datos.js";

export const ESTADOS_LISTA = Object.freeze(["quiero_ver", "vistas"]);

const CARTEL_SEGURO = /^https:\/\/image\.tmdb\.org\/t\/p\/w500\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export class ErrorListas extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = "ErrorListas";
    this.codigo = codigo;
  }
}

export function validarUsuarioLista(usuarioId) {
  if (typeof usuarioId !== "string" || !usuarioId.trim() ||
      usuarioId.length > 200 || CONTROL.test(usuarioId)) {
    throw new ErrorListas("LISTA_INVALIDA", "La lista solicitada no es válida.");
  }
}

export function validarPeliculaIdLista(peliculaId) {
  const numero = typeof peliculaId === "string" && /^[1-9]\d*$/.test(peliculaId)
    ? Number(peliculaId)
    : peliculaId;
  if (!Number.isInteger(numero) || numero < 1 || numero > 2147483647) {
    throw new ErrorListas("LISTA_INVALIDA", "El identificador de la película no es válido.");
  }
  return numero;
}

export function validarElementoLista(peliculaId, cuerpo) {
  const id = validarPeliculaIdLista(peliculaId);
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    throw new ErrorListas("LISTA_INVALIDA", "Los datos de la película no son válidos.");
  }
  if (!ESTADOS_LISTA.includes(cuerpo.estado)) {
    throw new ErrorListas("LISTA_INVALIDA", "El estado de la lista debe ser 'quiero_ver' o 'vistas'.");
  }
  if (typeof cuerpo.titulo !== "string" || CONTROL.test(cuerpo.titulo)) {
    throw new ErrorListas("LISTA_INVALIDA", "El título de la película no es válido.");
  }
  const titulo = cuerpo.titulo.trim();
  if (!titulo || titulo.length > 200) {
    throw new ErrorListas("LISTA_INVALIDA", "El título de la película no es válido.");
  }

  let anio = null;
  if (cuerpo.anio !== undefined && cuerpo.anio !== null && cuerpo.anio !== "") {
    if (!Number.isInteger(cuerpo.anio) || cuerpo.anio < 1000 || cuerpo.anio > 9999) {
      throw new ErrorListas("LISTA_INVALIDA", "El año de la película no es válido.");
    }
    anio = cuerpo.anio;
  }

  let cartel = null;
  if (cuerpo.cartel !== undefined && cuerpo.cartel !== null && cuerpo.cartel !== "") {
    if (typeof cuerpo.cartel !== "string" || cuerpo.cartel.length > 300 || !CARTEL_SEGURO.test(cuerpo.cartel)) {
      throw new ErrorListas("LISTA_INVALIDA", "La URL del cartel no es válida.");
    }
    cartel = cuerpo.cartel;
  }

  return { peliculaId: id, estado: cuerpo.estado, titulo, anio, cartel };
}

export function normalizarPlataformasCoincidentes(lista) {
  if (!Array.isArray(lista)) return [];
  const vistas = new Set();
  const salida = [];
  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    if (!Number.isInteger(item.id) || item.id < 1 || item.id > 2147483647) continue;
    if (typeof item.nombre !== "string" || !item.nombre.trim() || CONTROL.test(item.nombre)) continue;
    if (vistas.has(item.id)) continue;
    vistas.add(item.id);
    salida.push({
      id: item.id,
      nombre: item.nombre.trim(),
      logo: typeof item.logo === "string" && CARTEL_SEGURO.test(item.logo) ? item.logo : null
    });
  }
  return salida;
}

export function extraerPlataformasIncluidas(disponibilidad) {
  return normalizarPlataformasCoincidentes(disponibilidad?.incluidas);
}

function clonarElemento(elemento) {
  return {
    ...elemento,
    plataformasCoincidentes: elemento.plataformasCoincidentes.map(p => ({ ...p }))
  };
}

export class ListasPeliculas {
  constructor(datosUsuarios) {
    this.datosUsuarios = datosUsuarios;
    this.listas = new Map();
  }

  async comprobarUsuario(usuarioId) {
    validarUsuarioLista(usuarioId);
    const usuario = await this.datosUsuarios.buscarPorId(usuarioId);
    if (!usuario || usuario.eliminado) {
      throw new ErrorDatos("USUARIO_NO_ENCONTRADO", "El usuario no está disponible.");
    }
  }

  async listar(usuarioId) {
    await this.comprobarUsuario(usuarioId);
    const mapa = this.listas.get(usuarioId);
    if (!mapa) return { elementos: [] };
    const elementos = [...mapa.values()]
      .sort((a, b) =>
        (new Date(b.actualizadoEn).getTime() - new Date(a.actualizadoEn).getTime()) ||
        (a.peliculaId - b.peliculaId)
      )
      .map(clonarElemento);
    return { elementos };
  }

  async guardar(usuarioId, entrada, disponibilidadInicial = null) {
    validarUsuarioLista(usuarioId);
    const datos = validarElementoLista(entrada?.peliculaId, entrada);
    await this.comprobarUsuario(usuarioId);
    let mapa = this.listas.get(usuarioId);
    if (!mapa) {
      mapa = new Map();
      this.listas.set(usuarioId, mapa);
    }

    const previo = mapa.get(datos.peliculaId);
    const coincidentes = disponibilidadInicial
      ? normalizarPlataformasCoincidentes(disponibilidadInicial.plataformasCoincidentes)
      : (previo?.plataformasCoincidentes ?? []);
    const disponible = disponibilidadInicial
      ? Boolean(disponibilidadInicial.disponibleEnPlataformas)
      : (previo?.disponibleEnPlataformas ?? false);

    const elemento = {
      peliculaId: datos.peliculaId,
      estado: datos.estado,
      titulo: datos.titulo,
      anio: datos.anio,
      cartel: datos.cartel,
      disponibleEnPlataformas: disponible,
      plataformasCoincidentes: coincidentes,
      recienDisponible: disponible ? (previo?.recienDisponible ?? false) : false,
      actualizadoEn: new Date().toISOString()
    };

    mapa.set(datos.peliculaId, elemento);
    return clonarElemento(elemento);
  }

  async eliminar(usuarioId, peliculaId) {
    validarUsuarioLista(usuarioId);
    const id = validarPeliculaIdLista(peliculaId);
    await this.comprobarUsuario(usuarioId);
    const mapa = this.listas.get(usuarioId);
    if (!mapa || !mapa.delete(id)) {
      throw new ErrorListas("ELEMENTO_NO_ENCONTRADO", "La película no está en tu lista.");
    }
  }

  async actualizarDisponibilidad(usuarioId, peliculaId, { disponibleEnPlataformas, plataformasCoincidentes }) {
    validarUsuarioLista(usuarioId);
    const id = validarPeliculaIdLista(peliculaId);
    await this.comprobarUsuario(usuarioId);
    const mapa = this.listas.get(usuarioId);
    const previo = mapa?.get(id);
    if (!previo) return null;

    const ahoraDisponible = Boolean(disponibleEnPlataformas);
    const coincidentes = normalizarPlataformasCoincidentes(plataformasCoincidentes);
    const recienDisponible = !previo.disponibleEnPlataformas && ahoraDisponible;

    const actualizado = {
      ...previo,
      disponibleEnPlataformas: ahoraDisponible,
      plataformasCoincidentes: coincidentes,
      recienDisponible: ahoraDisponible ? (recienDisponible || previo.recienDisponible) : false
    };
    mapa.set(id, actualizado);
    return clonarElemento(actualizado);
  }
}
