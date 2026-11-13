import test from "node:test";
import assert from "node:assert/strict";
import { crearServicioPlataformas } from "../Servidor/plataformas-tmdb.js";

test("plataformas TMDB: consulta España, normaliza, ordena, deduplica y protege logos", async () => {
  const servicio = crearServicioPlataformas({ async consultar(ruta, parametros) {
    assert.equal(ruta, "/watch/providers/movie");
    assert.deepEqual(parametros, { watch_region: "ES", language: "es-ES" });
    return { results: [
      { provider_id: 20, provider_name: " Plataforma B ", logo_path: "https://externo.invalid/a.jpg" },
      { provider_id: 10, provider_name: "Plataforma A", logo_path: "/logo.jpg" },
      { provider_id: 10, provider_name: "Duplicada" }
    ] };
  } });
  assert.deepEqual(await servicio.listar(), { region: "ES", plataformas: [
    { id: 10, nombre: "Plataforma A", logo: "https://image.tmdb.org/t/p/w500/logo.jpg" },
    { id: 20, nombre: "Plataforma B", logo: null }
  ] });
});

test("plataformas TMDB: respuesta vacía válida y estructuras inválidas seguras", async () => {
  assert.deepEqual(await crearServicioPlataformas({ async consultar() {
    return { results: [] };
  } }).listar(), { region: "ES", plataformas: [] });
  for (const datos of [null, [], {}, { results: null }, { results: [null] },
    { results: [{ provider_id: 0, provider_name: "X" }] },
    { results: [{ provider_id: 2147483648, provider_name: "X" }] },
    { results: [{ provider_id: 1, provider_name: " \n " }] }]) {
    await assert.rejects(crearServicioPlataformas({ async consultar() { return datos; } }).listar(),
      { codigo: "PLATAFORMAS_RESPUESTA_INVALIDA" });
  }
});
