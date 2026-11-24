import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";

import { crearAplicacion } from "./api.js";
import { DatosUsuarios } from "./datos.js";
import { Sesiones } from "./sesiones.js";
import { PreferenciasPlataformas } from "./preferencias-plataformas.js";
import { ListasPeliculas, extraerPlataformasIncluidas } from "./listas-peliculas.js";

const PELICULAS_DEMO = [
  {
    id: 603,
    titulo: "Matrix",
    anio: 1999,
    duracion: 136,
    generos: ["Acción", "Ciencia ficción"],
    sinopsis: "Un programador descubre la verdadera naturaleza de su realidad y su papel en la guerra contra sus controladores.",
    cartel: "https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
    suscripcion: [{ id: 8, nombre: "Netflix", logo: null }],
    alquiler: [{ id: 2, nombre: "Apple TV", logo: null }],
    compra: [{ id: 2, nombre: "Apple TV", logo: null }],
    gratis: [],
    anuncios: []
  },
  {
    id: 27205,
    titulo: "Origen",
    anio: 2010,
    duracion: 148,
    generos: ["Acción", "Ciencia ficción", "Suspense"],
    sinopsis: "Un ladrón que roba secretos corporativos mediante el uso de la tecnología de sueños compartidos recibe la tarea inversa de implantar una idea.",
    cartel: "https://image.tmdb.org/t/p/w500/tXQvtRWfkUUnWJAn2tN3jERIUG.jpg",
    suscripcion: [{ id: 119, nombre: "Amazon Prime Video", logo: null }],
    alquiler: [{ id: 2, nombre: "Apple TV", logo: null }],
    compra: [{ id: 3, nombre: "Google Play Movies", logo: null }],
    gratis: [],
    anuncios: []
  },
  {
    id: 157336,
    titulo: "Interstellar",
    anio: 2014,
    duracion: 169,
    generos: ["Aventura", "Drama", "Ciencia ficción"],
    sinopsis: "Un equipo de exploradores viaja a través de un agujero de gusano en el espacio en un intento por asegurar la supervivencia de la humanidad.",
    cartel: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    suscripcion: [{ id: 337, nombre: "Disney Plus", logo: null }, { id: 119, nombre: "Amazon Prime Video", logo: null }],
    alquiler: [],
    compra: [{ id: 2, nombre: "Apple TV", logo: null }],
    gratis: [],
    anuncios: []
  },
  {
    id: 496243,
    titulo: "Parásitos",
    anio: 2019,
    duracion: 132,
    generos: ["Comedia", "Suspense", "Drama"],
    sinopsis: "Toda la familia de Ki-taek está en el paro y se interesa mucho por el tren de vida de la adinerada familia Park.",
    cartel: "https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
    suscripcion: [{ id: 63, nombre: "Filmin", logo: null }],
    alquiler: [{ id: 2, nombre: "Apple TV", logo: null }],
    compra: [],
    gratis: [],
    anuncios: []
  }
];

const PLATAFORMAS_DEMO = [
  { id: 8, nombre: "Netflix", logo: null },
  { id: 63, nombre: "Filmin", logo: null },
  { id: 119, nombre: "Amazon Prime Video", logo: null },
  { id: 337, nombre: "Disney Plus", logo: null }
];

const datos = new DatosUsuarios();
const sesiones = new Sesiones();
const preferencias = new PreferenciasPlataformas(datos);
const listas = new ListasPeliculas(datos);

const usuarioId = randomUUID();
await datos.guardar({
  id: usuarioId,
  nombre: "Usuario Demo",
  email: "demo@cinematch.local",
  rol: "usuario",
  confirmado: true,
  eliminado: false
});
await preferencias.guardar(usuarioId, [8]);

const tokenDemo = await sesiones.crear(usuarioId);

const catalogo = {
  async buscar({ titulo = "", anio, pagina = 1 } = {}) {
    const q = titulo.trim().toLowerCase();
    const filtradas = PELICULAS_DEMO.filter(p =>
      (!q || p.titulo.toLowerCase().includes(q)) &&
      (!anio || String(p.anio) === String(anio))
    );
    return {
      pagina: Number(pagina) || 1,
      totalPaginas: 1,
      totalResultados: filtradas.length,
      peliculas: filtradas.map(({ id, titulo: t, anio: a, cartel }) => ({ id, titulo: t, anio: a, cartel }))
    };
  }
};

const detalle = {
  async obtener(id) {
    const pelicula = PELICULAS_DEMO.find(p => p.id === Number(id));
    if (!pelicula) throw new Error("Película no encontrada.");
    const { id: pid, titulo, anio, duracion, generos, sinopsis, cartel } = pelicula;
    return { id: pid, titulo, anio, duracion, generos, sinopsis, cartel };
  }
};

const plataformas = {
  async listar() {
    return { region: "ES", plataformas: PLATAFORMAS_DEMO };
  }
};

const disponibilidad = {
  async obtener(id, uid) {
    const pelicula = PELICULAS_DEMO.find(p => p.id === Number(id));
    if (!pelicula) throw new Error("Película no encontrada.");
    const prefs = await preferencias.obtener(uid);
    const seleccion = new Set(prefs.plataformas);
    const incluidas = pelicula.suscripcion.filter(p => seleccion.has(p.id));
    const sinDatos = pelicula.suscripcion.length === 0 &&
      pelicula.alquiler.length === 0 &&
      pelicula.compra.length === 0 &&
      pelicula.gratis.length === 0 &&
      pelicula.anuncios.length === 0;
    let mensaje = null;
    if (seleccion.size === 0) {
      mensaje = "Selecciona al menos una plataforma para comprobar si está incluida en tus suscripciones.";
    } else if (sinDatos || incluidas.length === 0) {
      mensaje = "No consta disponibilidad en tus suscripciones en España.";
    }
    return {
      id: pelicula.id,
      region: "ES",
      consultadoEn: new Date().toISOString(),
      sinDatos,
      incluidas,
      suscripcion: pelicula.suscripcion,
      alquiler: pelicula.alquiler,
      compra: pelicula.compra,
      gratis: pelicula.gratis,
      anuncios: pelicula.anuncios,
      enlace: "https://www.themoviedb.org/",
      mensaje
    };
  }
};

// Precargamos "Origen" (Amazon Prime Video) en Quiero ver y "Matrix" (Netflix) como disponible.
const dispMatrix = await disponibilidad.obtener("603", usuarioId);
await listas.guardar(
  usuarioId,
  { peliculaId: 603, estado: "quiero_ver", titulo: "Matrix", anio: 1999, cartel: PELICULAS_DEMO[0].cartel },
  {
    disponibleEnPlataformas: true,
    plataformasCoincidentes: extraerPlataformasIncluidas(dispMatrix)
  }
);
await listas.guardar(
  usuarioId,
  { peliculaId: 27205, estado: "quiero_ver", titulo: "Origen", anio: 2010, cartel: PELICULAS_DEMO[1].cartel },
  { disponibleEnPlataformas: false, plataformasCoincidentes: [] }
);

const { servidor: appServidor } = crearAplicacion({
  cookieSegura: false,
  datos,
  sesiones,
  preferencias,
  listas,
  catalogo,
  detalle,
  plataformas,
  disponibilidad
});

const servidorDemo = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/demo") {
    res.writeHead(302, {
      Location: "/",
      "Set-Cookie": `cinematch_sesion=${tokenDemo}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`,
      "Cache-Control": "no-store"
    });
    res.end();
    return;
  }
  appServidor.emit("request", req, res);
});

const puerto = Number(process.env.PORT || 3000);
servidorDemo.listen(puerto, "127.0.0.1");
await once(servidorDemo, "listening");
console.log(`CineMatch Demo listo en http://127.0.0.1:${puerto}/demo`);
