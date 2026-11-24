import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";

import { crearAplicacion } from "../Servidor/api.js";
import { DatosUsuarios } from "../Servidor/datos.js";
import { Sesiones } from "../Servidor/sesiones.js";
import { PreferenciasPlataformas } from "../Servidor/preferencias-plataformas.js";
import { ListasPeliculas, extraerPlataformasIncluidas } from "../Servidor/listas-peliculas.js";
import { crearServicioDisponibilidad } from "../Servidor/disponibilidad-pelicula.js";
import { crearCatalogoTMDB } from "../Servidor/catalogo-tmdb.js";
import { definirContratoListas } from "../integracion/contrato-listas.js";
import {
  contarNuevasDisponibles,
  crearControladorListas,
  crearEstadoListas,
  dividirListas,
  textoAlertaDisponibilidad
} from "../Cliente/listas.js";

definirContratoListas(async () => {
  const datos = new DatosUsuarios();
  const ids = [randomUUID(), randomUUID()];
  for (const id of ids) {
    await datos.guardar({
      id,
      nombre: "Prueba",
      email: `${id}@example.invalid`,
      confirmado: true,
      eliminado: false,
      rol: "usuario"
    });
  }
  return {
    ids,
    repositorio: new ListasPeliculas(datos),
    async eliminar(id) {
      await datos.guardar({ ...(await datos.buscarPorId(id)), eliminado: true });
    },
    async crearNuevaCuenta(anterior) {
      const id = randomUUID();
      await datos.guardar({ ...(await datos.buscarPorId(anterior)), id, eliminado: false });
      return id;
    },
    async cerrar() {}
  };
});

test("extraerPlataformasIncluidas: usa el contrato real `incluidas` e ignora `suscripcion`", () => {
  const sinIncluidas = extraerPlataformasIncluidas({
    incluidas: [],
    suscripcion: [{ id: 8, nombre: "Netflix", logo: null }]
  });
  assert.deepEqual(sinIncluidas, []);

  const conIncluidas = extraerPlataformasIncluidas({
    incluidas: [{ id: 8, nombre: "Netflix", logo: "https://image.tmdb.org/t/p/w500/netflix.png" }],
    suscripcion: [
      { id: 8, nombre: "Netflix", logo: "https://image.tmdb.org/t/p/w500/netflix.png" },
      { id: 119, nombre: "Amazon Prime Video", logo: null }
    ]
  });
  assert.deepEqual(conIncluidas, [
    { id: 8, nombre: "Netflix", logo: "https://image.tmdb.org/t/p/w500/netflix.png" }
  ]);
});

test("Cliente/listas.js: divide listas, cuenta nuevas disponibles y formatea alerta", () => {
  const elementos = [
    {
      peliculaId: 1,
      estado: "quiero_ver",
      disponibleEnPlataformas: true,
      recienDisponible: true,
      plataformasCoincidentes: [{ id: 8, nombre: "Netflix" }]
    },
    {
      peliculaId: 2,
      estado: "vistas",
      disponibleEnPlataformas: false,
      recienDisponible: false,
      plataformasCoincidentes: []
    }
  ];

  const { quieroVer, vistas } = dividirListas(elementos);
  assert.equal(quieroVer.length, 1);
  assert.equal(vistas.length, 1);
  assert.equal(contarNuevasDisponibles(elementos), 1);
  assert.equal(textoAlertaDisponibilidad(elementos[0]), "¡Nueva en tus plataformas!: Netflix");
});

test("API listas: usa servicio real de disponibilidad (`incluidas`) y comprueba más de 20 películas por lotes", async () => {
  const datos = new DatosUsuarios();
  const sesiones = new Sesiones();
  const preferencias = new PreferenciasPlataformas(datos);
  const usuarioId = randomUUID();
  await datos.guardar({
    id: usuarioId,
    nombre: "Luis",
    email: "luis@example.invalid",
    confirmado: true,
    eliminado: false,
    rol: "usuario"
  });
  const token = await sesiones.crear(usuarioId);
  const cookie = `cinematch_sesion=${token}`;

  let proveedorDisponible = false;
  let activas = 0;
  let maximoConcurrentes = 0;

  const adaptador = crearCatalogoTMDB(
    { TMDB_READ_ACCESS_TOKEN: "token-ficticio-listas" },
    async url => {
      activas += 1;
      maximoConcurrentes = Math.max(maximoConcurrentes, activas);
      await new Promise(resolve => setTimeout(resolve, 5));
      activas -= 1;

      const pathname = new URL(url).pathname;
      const match = pathname.match(/^\/3\/movie\/(\d+)\/watch\/providers$/);
      if (!match) {
        return new Response(JSON.stringify({ error: "no encontrada" }), { status: 404 });
      }
      const id = Number(match[1]);
      return new Response(JSON.stringify({
        id,
        results: {
          ES: {
            link: `https://www.themoviedb.org/movie/${id}/watch?locale=ES`,
            flatrate: proveedorDisponible
              ? [{ provider_id: 8, provider_name: "Netflix", logo_path: "/netflix.png" }]
              : [{ provider_id: 119, provider_name: "Amazon Prime Video", logo_path: null }]
          }
        }
      }), { status: 200 });
    }
  );

  const disponibilidad = crearServicioDisponibilidad(adaptador, preferencias);
  const { servidor } = crearAplicacion({
    datos,
    sesiones,
    preferencias,
    disponibilidad,
    cookieSegura: false,
    registrarActividad: () => {}
  });

  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  const base = `http://127.0.0.1:${servidor.address().port}`;

  try {
    const sinSesion = await fetch(`${base}/api/listas`);
    assert.equal(sinSesion.status, 401);

    await preferencias.guardar(usuarioId, [8]);

    // Guardamos 25 películas pendientes cuando Netflix aún no las tiene.
    for (let i = 1; i <= 25; i++) {
      const id = 1000 + i;
      const res = await fetch(`${base}/api/listas/${id}`, {
        method: "PUT",
        headers: {
          Cookie: cookie,
          "X-CineMatch": "1",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          estado: "quiero_ver",
          titulo: `Película ${i}`,
          anio: 2000 + (i % 20)
        })
      });
      assert.equal(res.status, 200);
      const { elemento } = await res.json();
      assert.equal(elemento.disponibleEnPlataformas, false);
    }

    // Ahora Netflix pasa a tener las 25 películas.
    proveedorDisponible = true;
    maximoConcurrentes = 0;

    const comprobar = await fetch(`${base}/api/listas/comprobar`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "X-CineMatch": "1"
      }
    });
    assert.equal(comprobar.status, 200);
    const resultado = await comprobar.json();
    assert.equal(resultado.comprobadas, 25);
    assert.equal(resultado.nuevasDisponibles, 25);
    assert.ok(maximoConcurrentes <= 10, `Concurrencia excesiva: ${maximoConcurrentes}`);
    assert.equal(resultado.elementos.length, 25);
    for (const item of resultado.elementos) {
      assert.equal(item.disponibleEnPlataformas, true);
      assert.equal(item.recienDisponible, true);
      assert.equal(item.plataformasCoincidentes[0].nombre, "Netflix");
    }

    const borrar = await fetch(`${base}/api/listas/1025`, {
      method: "DELETE",
      headers: {
        Cookie: cookie,
        "X-CineMatch": "1"
      }
    });
    assert.equal(borrar.status, 204);
  } finally {
    servidor.closeAllConnections();
    await new Promise(resolve => servidor.close(resolve));
  }
});

class ElementoFalso {
  constructor(id, etiqueta = "div") {
    this.id = id;
    this.etiqueta = etiqueta;
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.className = "";
    this.hijos = [];
    this.oyentes = new Map();
    this.classList = { add() {}, remove() {} };
  }

  addEventListener(tipo, oyente) {
    const oyentes = this.oyentes.get(tipo) ?? [];
    oyentes.push(oyente);
    this.oyentes.set(tipo, oyentes);
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
        if (selector === "button" && hijo.etiqueta === "button") encontrados.push(hijo);
        recorrer(hijo);
      }
    };
    recorrer(this);
    return encontrados;
  }
}

function crearDomListasFalso() {
  const ids = [
    "panelListas", "botonComprobarListas", "alertaListas", "estadoListas",
    "contadorQuieroVer", "contadorVistas", "vacioQuieroVer", "vacioVistas",
    "listaQuieroVer", "listaVistas", "botonQuieroVer", "botonMarcarVista",
    "botonQuitarLista", "estadoListaDetalle"
  ];
  return Object.fromEntries(ids.map(id => [id, new ElementoFalso(id)]));
}

function crearPromesaDiferida() {
  let resolve;
  let reject;
  const promesa = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promesa, resolve, reject };
}

test("crearEstadoListas y controlador: respuestas atrasadas al cambiar de cuenta no contaminan la sesión actual", async () => {
  const estado = crearEstadoListas();
  estado.cambiarUsuario({ id: "cuenta-a" });
  const opA = estado.iniciarOperacion();
  estado.cambiarUsuario({ id: "cuenta-b" });
  assert.equal(estado.esVigente(opA), false);
  assert.equal(estado.reemplazarElementos(opA, [{ peliculaId: 1, estado: "quiero_ver" }]), false);
  assert.deepEqual(estado.elementos, []);

  const documentoAnterior = globalThis.document;
  const fetchAnterior = globalThis.fetch;
  globalThis.document = {
    createElement: etiqueta => new ElementoFalso(null, etiqueta)
  };

  const diferidos = [];
  globalThis.fetch = () => {
    const diferido = crearPromesaDiferida();
    diferidos.push(diferido);
    return diferido.promesa;
  };

  let caducidades = 0;
  const dom = crearDomListasFalso();

  try {
    const controlador = crearControladorListas(dom, {
      estaOcupado: () => false,
      obtenerDetalleActual: () => ({ id: 603, titulo: "Matrix", anio: 1999, cartel: null }),
      alCaducar: () => { caducidades += 1; }
    });

    // 1. Cuenta A inicia carga inicial (diferido[0]).
    controlador.cambiarUsuario({ id: "cuenta-a" });
    assert.equal(diferidos.length, 1);

    // 2. Antes de responder, el usuario cambia a Cuenta B (diferido[1]).
    controlador.cambiarUsuario({ id: "cuenta-b" });
    assert.equal(diferidos.length, 2);

    // Llega primero la respuesta de Cuenta B con su película.
    diferidos[1].resolve(new Response(JSON.stringify({
      elementos: [{ peliculaId: 99, estado: "quiero_ver", titulo: "Película B", anio: 2020 }]
    }), { status: 200 }));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(dom.contadorQuieroVer.textContent, "1");
    assert.equal(dom.listaQuieroVer.hijos[0].hijos[0].hijos[0].hijos[0].textContent, "Película B");

    // Ahora llega tarde la respuesta de Cuenta A (con otra película) -> debe ignorarse.
    diferidos[0].resolve(new Response(JSON.stringify({
      elementos: [
        { peliculaId: 1, estado: "quiero_ver", titulo: "Película A1", anio: 2001 },
        { peliculaId: 2, estado: "quiero_ver", titulo: "Película A2", anio: 2002 }
      ]
    }), { status: 200 }));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(dom.contadorQuieroVer.textContent, "1");
    assert.equal(dom.listaQuieroVer.hijos[0].hijos[0].hijos[0].hijos[0].textContent, "Película B");

    // 3. Cuenta B lanza guardar, eliminar y comprobar y se cierra sesión / cambia a C antes de que respondan.
    const opGuardar = controlador.guardar({ id: 603, titulo: "Matrix", anio: 1999 }, "quiero_ver");
    assert.equal(diferidos.length, 3);

    controlador.cambiarUsuario({ id: "cuenta-c" });
    assert.equal(diferidos.length, 4);
    diferidos[3].resolve(new Response(JSON.stringify({ elementos: [] }), { status: 200 }));
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(dom.contadorQuieroVer.textContent, "0");

    // Llega un 401 tardío de la operación guardar de B -> no debe disparar alCaducar ni alterar C.
    diferidos[2].resolve(new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 }));
    await opGuardar;
    assert.equal(caducidades, 0);
    assert.equal(dom.contadorQuieroVer.textContent, "0");

    // 4. Cuenta C inicia guardar, cambia a D antes de responder, y comprobar/eliminar también descartan tardías.
    const opGuardarC = controlador.guardar({ id: 500, titulo: "C", anio: 2010 }, "quiero_ver");
    assert.equal(diferidos.length, 5);
    controlador.cambiarUsuario({ id: "cuenta-d" });
    assert.equal(diferidos.length, 6);
    diferidos[5].resolve(new Response(JSON.stringify({
      elementos: [{ peliculaId: 777, estado: "quiero_ver", titulo: "Película D", anio: 2021 }]
    }), { status: 200 }));
    await new Promise(resolve => setTimeout(resolve, 0));

    diferidos[4].resolve(new Response(JSON.stringify({
      elemento: { peliculaId: 500, estado: "quiero_ver", titulo: "C", anio: 2010 }
    }), { status: 200 }));
    await opGuardarC;
    assert.equal(dom.contadorQuieroVer.textContent, "1");

    const opComprobarD = controlador.comprobar();
    assert.equal(diferidos.length, 7);
    controlador.cambiarUsuario(null);
    diferidos[6].resolve(new Response(JSON.stringify({
      elementos: [{ peliculaId: 777, estado: "quiero_ver", titulo: "Película D", anio: 2021 }]
    }), { status: 200 }));
    await opComprobarD;
    assert.equal(dom.panelListas.hidden, true);
    assert.equal(dom.contadorQuieroVer.textContent, "0");

    // 5. Cuenta E inicia quitar y cambia a F antes de responder.
    controlador.cambiarUsuario({ id: "cuenta-e" });
    assert.equal(diferidos.length, 8);
    diferidos[7].resolve(new Response(JSON.stringify({
      elementos: [{ peliculaId: 888, estado: "quiero_ver", titulo: "Película E", anio: 2022 }]
    }), { status: 200 }));
    await new Promise(resolve => setTimeout(resolve, 0));

    const opQuitarE = controlador.quitar(888);
    assert.equal(diferidos.length, 9);
    controlador.cambiarUsuario({ id: "cuenta-f" });
    assert.equal(diferidos.length, 10);
    diferidos[9].resolve(new Response(JSON.stringify({
      elementos: [{ peliculaId: 888, estado: "quiero_ver", titulo: "Película F", anio: 2023 }]
    }), { status: 200 }));
    await new Promise(resolve => setTimeout(resolve, 0));
    diferidos[8].resolve(new Response(null, { status: 204 }));
    await opQuitarE;
    assert.equal(dom.contadorQuieroVer.textContent, "1");
    assert.equal(dom.listaQuieroVer.hijos[0].hijos[0].hijos[0].hijos[0].textContent, "Película F");
  } finally {
    globalThis.document = documentoAnterior;
    globalThis.fetch = fetchAnterior;
  }
});
