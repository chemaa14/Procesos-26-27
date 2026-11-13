import test from "node:test";
import assert from "node:assert/strict";

import {
  crearEstadoDisponibilidad,
  leerDisponibilidad,
  seccionesDisponibilidad,
  textoConsultadoEn,
  urlEnlaceDisponibilidadSegura
} from "../Cliente/disponibilidad.js";

const CONSULTADO_EN = "2026-11-13T10:00:00.000Z";

function proveedor(id, nombre, logo = null) {
  return { id, nombre, logo };
}

function respuesta(extra = {}) {
  return {
    id: 550,
    region: "ES",
    consultadoEn: CONSULTADO_EN,
    sinDatos: false,
    incluidas: [proveedor(10, "Netflix")],
    suscripcion: [proveedor(10, "Netflix"), proveedor(20, "Canal")],
    alquiler: [proveedor(10, "Netflix")],
    compra: [proveedor(30, "Compra")],
    gratis: [proveedor(40, "Gratis")],
    anuncios: [proveedor(50, "Anuncios")],
    enlace: "https://www.themoviedb.org/movie/550-fight-club/watch?locale=ES",
    mensaje: null,
    ...extra
  };
}

test("cliente disponibilidad: normaliza una respuesta válida y ordena por ID", () => {
  const datos = leerDisponibilidad(respuesta({
    suscripcion: [
      proveedor(20, " Canal "),
      proveedor(10, "Netflix", "https://image.tmdb.org/t/p/w500/netflix.jpg"),
      proveedor(20, "Duplicado")
    ],
    incluidas: [proveedor(10, "Netflix", "https://image.tmdb.org/t/p/w500/netflix.jpg")]
  }), 550);

  assert.equal(datos.id, 550);
  assert.equal(datos.region, "ES");
  assert.equal(datos.consultadoEn, CONSULTADO_EN);
  assert.equal(datos.sinDatos, false);
  assert.deepEqual(datos.incluidas.map(p => p.id), [10]);
  assert.deepEqual(datos.suscripcion.map(p => p.id), [10, 20]);
  assert.deepEqual(datos.alquiler.map(p => p.id), [10]);
  assert.equal(datos.suscripcion[0].logo, "https://image.tmdb.org/t/p/w500/netflix.jpg");
  assert.equal(datos.enlace, "https://www.themoviedb.org/movie/550-fight-club/watch?locale=ES");
  assert.equal(datos.mensaje, null);
});

test("cliente disponibilidad: rechaza respuestas malformadas o incongruentes", () => {
  for (const datos of [
    null,
    [],
    {},
    respuesta({ id: 551 }),
    respuesta({ region: "FR" }),
    respuesta({ consultadoEn: "no-es-fecha" }),
    respuesta({ sinDatos: "no" }),
    respuesta({ incluidas: null }),
    respuesta({ suscripcion: null }),
    respuesta({ alquiler: [null] }),
    respuesta({ anuncios: [proveedor(0, "X")] }),
    respuesta({ anuncios: [proveedor(10, " ")] }),
    respuesta({ anuncios: [proveedor(10, "X", "https://evil.example/logo.jpg")] }),
    respuesta({ incluidas: [proveedor(99, "Fuera de suscripción")] })
  ]) {
    assert.throws(() => leerDisponibilidad(datos, 550), /inesperada/);
  }
});

test("cliente disponibilidad: acepta el enlace TMDB seguro con slug opcional", () => {
  const validos = [
    "https://www.themoviedb.org/movie/550/watch",
    "https://www.themoviedb.org/movie/550-fight-club/watch?locale=ES",
    "https://themoviedb.org/movie/550/watch?region=es"
  ];

  for (const enlace of validos) {
    assert.equal(urlEnlaceDisponibilidadSegura(enlace, 550), enlace);
  }

  for (const enlace of [
    null,
    "",
    "http://www.themoviedb.org/movie/550/watch",
    "https://evil.example/movie/550/watch",
    "https://user:clave@www.themoviedb.org/movie/550/watch",
    "https://www.themoviedb.org:8443/movie/550/watch",
    "https://www.themoviedb.org/movie/551/watch",
    "https://www.themoviedb.org/movie/550-wrong/watch?locale=FR",
    "https://www.themoviedb.org/movie/550/watch?foo=ES",
    "https://www.themoviedb.org/movie/550/watch#fragmento"
  ]) {
    assert.equal(urlEnlaceDisponibilidadSegura(enlace, 550), null);
  }
});

test("cliente disponibilidad: un enlace inseguro no se muestra", () => {
  const datos = leerDisponibilidad(respuesta({
    enlace: "https://evil.example/movie/550/watch?locale=ES"
  }), 550);

  assert.equal(datos.enlace, null);
});

test("cliente disponibilidad: etiqueta las secciones y la fecha de consulta", () => {
  const datos = leerDisponibilidad(respuesta(), 550);
  const secciones = seccionesDisponibilidad(datos);

  assert.deepEqual(secciones.map(s => s.clave), [
    "incluidas", "suscripcion", "alquiler", "compra", "gratis", "anuncios"
  ]);
  assert.equal(secciones[0].titulo, "Incluida en tus suscripciones");
  assert.equal(secciones[1].titulo, "Suscripción en España");
  assert.equal(secciones[2].titulo, "Alquiler");
  assert.equal(secciones[3].titulo, "Compra");
  assert.equal(secciones[4].titulo, "Gratis");
  assert.equal(secciones[5].titulo, "Con anuncios");
  assert.equal(typeof textoConsultadoEn(CONSULTADO_EN), "string");
  assert.match(textoConsultadoEn(CONSULTADO_EN), /2026/);
  assert.equal(textoConsultadoEn("no-es-fecha"), null);
});

test("cliente disponibilidad: solo la última solicitud vigente puede confirmar", () => {
  const estado = crearEstadoDisponibilidad();
  const primera = estado.iniciar(550);
  const segunda = estado.iniciar(550);

  assert.equal(estado.esVigente(primera), false);
  assert.equal(estado.confirmar(primera, respuesta()), false);
  assert.equal(estado.disponibilidad, null);
  assert.equal(estado.confirmar(segunda, respuesta()), true);
  assert.equal(estado.disponibilidad.id, 550);

  estado.limpiar();
  assert.equal(estado.disponibilidad, null);
  assert.equal(estado.esVigente(segunda), false);
});

test("cliente disponibilidad: una respuesta inválida no reemplaza la anterior", () => {
  const estado = crearEstadoDisponibilidad();
  const solicitud = estado.iniciar(550);

  assert.throws(() => estado.confirmar(solicitud, respuesta({ id: 551 })), /inesperada/);
  assert.equal(estado.disponibilidad, null);
});