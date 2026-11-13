import test from "node:test";
import assert from "node:assert/strict";
import { crearEstadoPreferencias, leerCatalogoPlataformas, opcionesPlataformas, filtrarPlataformas } from "../Cliente/preferencias-estado.js";
import { obtenerPlataformas, obtenerPreferenciasPlataformas, guardarPreferenciasPlataformas } from "../Cliente/rest.js";

const respuesta = plataformas => ({ region: "ES", plataformas });

test("selector: selección inicial, cambios, duplicados, quitar y guardar vacío", () => {
  const e = crearEstadoPreferencias();
  assert.equal(e.cargado, false);
  e.recibir(e.version, respuesta([20, 10, 20]));
  assert.deepEqual(e.seleccion, [10, 20]);
  assert.equal(e.cambios, false);
  e.seleccionar(30, true); e.seleccionar(10, false);
  assert.deepEqual(e.seleccion, [20, 30]);
  assert.equal(e.cambios, true);
  e.vaciar();
  const solicitud = e.prepararGuardado();
  assert.equal(e.confirmar(solicitud, respuesta([])), true);
  assert.deepEqual(e.guardadas, []);
  assert.equal(e.cambios, false);
});

test("selector: fallo conserva el borrador y respuesta incongruente no confirma el guardado", () => {
  const e = crearEstadoPreferencias();
  e.recibir(e.version, respuesta([10])); e.seleccionar(20, true);
  const solicitud = e.prepararGuardado();
  assert.throws(() => e.confirmar(solicitud, respuesta([10])), /no confirmó/);
  assert.deepEqual(e.guardadas, [10]);
  assert.deepEqual(e.seleccion, [10, 20]);
  e.confirmar(solicitud, respuesta([10, 20]));
  assert.equal(e.cambios, false);
});

test("selector: logout o cambio de cuenta invalida lecturas y guardados pendientes", () => {
  const e = crearEstadoPreferencias();
  const anterior = e.version;
  e.recibir(anterior, respuesta([10])); e.seleccionar(20, true);
  const solicitud = e.prepararGuardado();
  e.reiniciar();
  assert.equal(e.recibir(anterior, respuesta([10])), false);
  assert.equal(e.confirmar(solicitud, respuesta([10, 20])), false);
  assert.equal(e.cargado, false);
  assert.deepEqual(e.seleccion, []);
  e.recibir(e.version, respuesta([30]));
  assert.deepEqual(e.guardadas, [30]);
});

test("selector: edición posterior al envío y copias independientes", () => {
  const e = crearEstadoPreferencias();
  e.recibir(e.version, respuesta([10])); e.seleccionar(20, true);
  const solicitud = e.prepararGuardado();
  e.seleccionar(30, true);
  e.confirmar(solicitud, respuesta([10, 20]));
  assert.deepEqual(e.seleccion, [10, 20, 30]);
  assert.equal(e.cambios, true);
  e.guardadas.push(40); e.seleccion.push(40);
  assert.deepEqual(e.guardadas, [10, 20]);
});

test("selector: catálogos y preferencias inválidos no se interpretan como vacíos", () => {
  for (const invalida of [null, {}, respuesta([0]), respuesta(["10"]), { region: "FR", plataformas: [] }]) {
    const e = crearEstadoPreferencias();
    assert.throws(() => e.recibir(e.version, invalida));
    assert.equal(e.cargado, false);
  }
  for (const invalido of [null, {}, respuesta([null]), respuesta([{ id: 1, nombre: "" }])]) {
    assert.throws(() => leerCatalogoPlataformas(invalido));
  }
});

test("selector: guarda IDs ausentes, distingue fallo de catálogo y filtra sin acentos", () => {
  const catalogo = leerCatalogoPlataformas(respuesta([{ id: 20, nombre: "Ciné Club" }, { id: 10, nombre: "Otra" }]));
  const opciones = opcionesPlataformas(catalogo, [99]);
  assert.equal(opciones.find(p => p.id === 99).ausente, true);
  assert.match(opciones.find(p => p.id === 99).aviso, /Ya no aparece/);
  assert.match(opcionesPlataformas(null, [99])[0].aviso, /Nombre no disponible/);
  assert.equal(filtrarPlataformas(opciones, "cine")[0].id, 20);
  assert.equal(filtrarPlataformas(opciones, "99")[0].id, 99);
  assert.deepEqual(filtrarPlataformas(opciones, "no coincide"), []);
});

test("REST preferencias: rutas, sesión del mismo origen y escritura protegida sin IDs de usuario", async () => {
  const original = globalThis.fetch;
  const llamadas = [];
  globalThis.fetch = async (url, opciones) => {
    llamadas.push({ url, opciones });
    return new Response(JSON.stringify(respuesta([10])), { status: 200 });
  };
  try {
    await obtenerPlataformas(); await obtenerPreferenciasPlataformas(); await guardarPreferenciasPlataformas([10]);
    assert.deepEqual(llamadas.map(l => l.url), ["/api/plataformas", "/api/preferencias/plataformas", "/api/preferencias/plataformas"]);
    for (const { opciones } of llamadas) {
      assert.equal(opciones.credentials, "same-origin"); assert.equal(opciones.cache, "no-store");
      assert.equal(opciones.headers.Authorization, undefined);
    }
    assert.equal(llamadas[2].opciones.method, "PUT");
    assert.equal(llamadas[2].opciones.headers["X-CineMatch"], "1");
    assert.deepEqual(JSON.parse(llamadas[2].opciones.body), { plataformas: [10] });
  } finally { globalThis.fetch = original; }
});
