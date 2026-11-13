import test from "node:test";
import assert from "node:assert/strict";
import { crearSelectorPlataformas } from "../Cliente/selector-plataformas.js";

class ElementoFalso {
  constructor(id, etiqueta = "div") {
    this.id = id;
    this.etiqueta = etiqueta;
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.checked = false;
    this.textContent = "";
    this.className = "";
    this.hijos = [];
    this.oyentes = new Map();
    this.atributos = new Map();
    this.classList = { add() {}, remove() {} };
  }

  addEventListener(tipo, oyente) {
    const oyentes = this.oyentes.get(tipo) ?? [];
    oyentes.push(oyente);
    this.oyentes.set(tipo, oyentes);
  }

  async emitir(tipo, evento = {}) {
    for (const oyente of this.oyentes.get(tipo) ?? []) await oyente(evento);
  }

  setAttribute(nombre, valor) {
    this.atributos.set(nombre, String(valor));
  }

  removeAttribute(nombre) {
    this.atributos.delete(nombre);
  }

  append(...hijos) {
    this.hijos.push(...hijos);
  }

  replaceChildren(...hijos) {
    this.hijos = hijos;
  }

  querySelectorAll(selector) {
    const encontrados = [];
    const recorrer = elemento => {
      for (const hijo of elemento.hijos) {
        if (selector === "input" && hijo.etiqueta === "input") encontrados.push(hijo);
        recorrer(hijo);
      }
    };
    recorrer(this);
    return encontrados;
  }

  focus() {}
}

function crearPanel() {
  const identidades = [
    "form-plataformas",
    "filtro-plataformas",
    "lista-plataformas",
    "resumen-plataformas",
    "mensaje-plataformas",
    "error-preferencias",
    "error-plataformas",
    "reintentar-preferencias",
    "reintentar-plataformas",
    "guardar-plataformas",
    "quitar-plataformas",
    "cantidad-plataformas"
  ];
  const elementos = new Map(
    identidades.map(id => [
      id,
      new ElementoFalso(id, id === "form-plataformas" ? "form" : "div")
    ])
  );

  return {
    panel: {
      hidden: false,
      querySelector: selector => elementos.get(selector.slice(1))
    },
    elementos
  };
}

function respuesta(datos) {
  return {
    status: 200,
    ok: true,
    async json() {
      return datos;
    }
  };
}

test("selector: avisa del guardado confirmado de una selección vacía", async () => {
  const documentoAnterior = globalThis.document;
  const fetchAnterior = globalThis.fetch;
  const { panel, elementos } = crearPanel();

  globalThis.document = {
    createElement: etiqueta => new ElementoFalso(null, etiqueta)
  };

  globalThis.fetch = async (ruta, opciones = {}) => {
    if (ruta === "/api/plataformas") {
      return respuesta({
        region: "ES",
        plataformas: [{ id: 8, nombre: "Netflix" }]
      });
    }

    if (ruta === "/api/preferencias/plataformas" && opciones.method === "PUT") {
      assert.deepEqual(JSON.parse(opciones.body), { plataformas: [] });
      return respuesta({ region: "ES", plataformas: [] });
    }

    if (ruta === "/api/preferencias/plataformas") {
      return respuesta({ region: "ES", plataformas: [8] });
    }

    throw new Error(`Petición inesperada: ${ruta}`);
  };

  try {
    let guardado = null;
    const selector = crearSelectorPlataformas(panel, {
      estaOcupado: () => false,
      alCaducar: () => assert.fail("La sesión no debía caducar."),
      alGuardar: resultado => {
        guardado = resultado;
      }
    });

    selector.cambiarUsuario({ id: 1 });
    await new Promise(resolver => setTimeout(resolver, 0));
    assert.equal(elementos.get("quitar-plataformas").disabled, false);

    await elementos.get("quitar-plataformas").emitir("click");
    assert.equal(elementos.get("guardar-plataformas").disabled, false);

    await elementos.get("form-plataformas").emitir("submit", {
      preventDefault() {}
    });

    assert.deepEqual(guardado, { region: "ES", plataformas: [] });
  } finally {
    globalThis.document = documentoAnterior;
    globalThis.fetch = fetchAnterior;
  }
});