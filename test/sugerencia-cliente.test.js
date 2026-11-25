import test from "node:test";
import assert from "node:assert/strict";

import {
  OPCIONES_DURACION,
  OPCIONES_VALORACION,
  filtrosOtraSugerencia,
  generosValidos,
  leerFiltrosSugerencia,
  textoOpcionDuracion,
  textoOpcionValoracion,
  textoResultadoSugerencia
} from "../Cliente/sugerencia.js";

test("sugerencia cliente: los desplegables vacíos no envían filtros", () => {
  assert.deepEqual(
    leerFiltrosSugerencia({ genero: "", duracionMaxima: "", valoracionMinima: "" }),
    { valido: true, filtros: {} }
  );
});

test("sugerencia cliente: combina género, duración y valoración", () => {
  assert.deepEqual(
    leerFiltrosSugerencia({ genero: "18", duracionMaxima: "120", valoracionMinima: "7" }),
    { valido: true, filtros: { genero: "18", duracionMaxima: "120", valoracionMinima: "7" } }
  );
});

test("sugerencia cliente: rechaza valores que no están en las listas", () => {
  for (const campos of [
    { genero: "drama" },
    { duracionMaxima: "95" },
    { valoracionMinima: "10" },
    { valoracionMinima: "-1" }
  ]) {
    assert.equal(leerFiltrosSugerencia(campos).valido, false, JSON.stringify(campos));
  }
});

test("sugerencia cliente: las opciones coinciden con los límites del servidor", () => {
  assert.ok(OPCIONES_DURACION.every(minutos => minutos >= 30 && minutos <= 400));
  assert.ok(OPCIONES_VALORACION.every(nota => nota >= 1 && nota <= 9));
  assert.equal(textoOpcionDuracion(120), "Hasta 2 h");
  assert.equal(textoOpcionDuracion(90), "Hasta 1 h 30 min");
  assert.equal(textoOpcionValoracion(7), "7 o más en TMDB");
});

test("sugerencia cliente: filtra géneros mal formados", () => {
  assert.deepEqual(
    generosValidos({ generos: [{ id: 18, nombre: " Drama " }, { id: "x", nombre: "Mal" }, { id: 28, nombre: "" }] }),
    [{ id: 18, nombre: "Drama" }]
  );
  assert.deepEqual(generosValidos(null), []);
});

test("sugerencia cliente: textos del resultado", () => {
  assert.equal(
    textoResultadoSugerencia({ pelicula: { id: 550, titulo: "El club de la lucha" }, totalCandidatas: 1200 }),
    "Te proponemos «El club de la lucha». Elegida al azar entre 1200 películas de tus plataformas."
      .replace("1200", (1200).toLocaleString("es-ES"))
  );
  assert.equal(
    textoResultadoSugerencia({ pelicula: { id: 1, titulo: "Única" }, totalCandidatas: 1 }),
    "Te proponemos «Única»."
  );
  assert.equal(
    textoResultadoSugerencia({ pelicula: null, mensaje: "Selecciona al menos una plataforma." }),
    "Selecciona al menos una plataforma."
  );
});

test("sugerencia cliente: «otra sugerencia» mantiene los filtros y excluye la anterior", () => {
  const filtros = { genero: "18" };
  assert.deepEqual(filtrosOtraSugerencia(filtros, { id: 550 }), { genero: "18", excluir: "550" });
  assert.deepEqual(filtros, { genero: "18" });
  assert.deepEqual(filtrosOtraSugerencia({}, null), {});
});
