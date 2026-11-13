import { ErrorDatos } from "./errores-datos.js";
import { normalizarPlataformas } from "./preferencias-plataformas.js";

export class ErrorPlataformas extends Error {
  constructor(codigo) {
    const mensajes = {
      PLATAFORMAS_RESPUESTA_INVALIDA: "El catálogo de plataformas devolvió una respuesta no válida.",
      CATALOGO_NO_CONFIGURADO: "El catálogo de plataformas no está disponible.",
      PLATAFORMA_NO_ADMITIDA: "Selecciona únicamente plataformas del catálogo de España."
    };
    super(mensajes[codigo]);
    this.name = "ErrorPlataformas";
    this.codigo = codigo;
  }
}

export function validarSeleccionPlataformas(cuerpo) {
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo) ||
      Object.keys(cuerpo).length !== 1 || !Object.hasOwn(cuerpo, "plataformas") ||
      !Array.isArray(cuerpo.plataformas) || cuerpo.plataformas.length > 100) {
    throw new ErrorDatos("PREFERENCIAS_INVALIDAS", "Las preferencias no son válidas.");
  }
  return normalizarPlataformas(cuerpo.plataformas);
}

export function crearServicioPlataformas(adaptador) {
  if (!adaptador || typeof adaptador.consultar !== "function") {
    throw new TypeError("Se requiere un adaptador de catálogo.");
  }
  return Object.freeze({
    async listar() {
      const datos = await adaptador.consultar("/watch/providers/movie", {
        watch_region: "ES", language: "es-ES"
      });
      if (!datos || !Array.isArray(datos.results)) {
        throw new ErrorPlataformas("PLATAFORMAS_RESPUESTA_INVALIDA");
      }
      const unicas = new Map();
      for (const proveedor of datos.results) {
        if (!proveedor || !Number.isInteger(proveedor.provider_id) ||
            proveedor.provider_id < 1 || proveedor.provider_id > 2147483647 ||
            typeof proveedor.provider_name !== "string" || !proveedor.provider_name.trim() ||
            /[\u0000-\u001f\u007f-\u009f]/.test(proveedor.provider_name)) {
          throw new ErrorPlataformas("PLATAFORMAS_RESPUESTA_INVALIDA");
        }
        const ruta = proveedor.logo_path;
        const logo = typeof ruta === "string" && ruta.length <= 200 &&
          /^\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(ruta)
          ? `https://image.tmdb.org/t/p/w500${ruta}` : null;
        if (!unicas.has(proveedor.provider_id)) unicas.set(proveedor.provider_id, {
          id: proveedor.provider_id, nombre: proveedor.provider_name.trim(), logo
        });
      }
      return { region: "ES", plataformas: [...unicas.values()].sort((a, b) => a.id - b.id) };
    }
  });
}
