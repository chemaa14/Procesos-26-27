import test from "node:test";
import assert from "node:assert/strict";

import {
  ErrorAPI,
  buscarPeliculas,
  obtenerDetallePelicula
} from "../Cliente/rest.js";

const fetchOriginal = globalThis.fetch;

function respuestaJSON(cuerpo, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { "Content-Type": "application/json" }
  });
}

async function conFetchSimulado(respuesta, comprobar) {
  const llamadas = [];

  globalThis.fetch = async (url, opciones) => {
    llamadas.push({ url: String(url), opciones });
    return typeof respuesta === "function" ? respuesta() : respuesta.clone();
  };

  try {
    await comprobar(llamadas);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
}

test("buscarPeliculas usa URLSearchParams, mismo origen y no-store", async () => {
  await conFetchSimulado(
    respuestaJSON({
      pagina: 2,
      totalPaginas: 3,
      totalResultados: 21,
      peliculas: []
    }),
    async llamadas => {
      const resultado = await buscarPeliculas({
        titulo: "Dune & Cía",
        anio: "2021",
        pagina: 2
      });

      assert.deepEqual(resultado, {
        pagina: 2,
        totalPaginas: 3,
        totalResultados: 21,
        peliculas: []
      });

      assert.equal(llamadas.length, 1);

      const { url, opciones } = llamadas[0];
      const dirección = new URL(url, "http://localhost");

      assert.equal(dirección.pathname, "/api/peliculas");
      assert.equal(dirección.searchParams.get("titulo"), "Dune & Cía");
      assert.equal(dirección.searchParams.get("anio"), "2021");
      assert.equal(dirección.searchParams.get("pagina"), "2");
      assert.equal(dirección.searchParams.has("token"), false);

      assert.equal(opciones.method, "GET");
      assert.equal(opciones.credentials, "same-origin");
      assert.equal(opciones.cache, "no-store");
      assert.equal(opciones.headers.Accept, "application/json");
      assert.equal("Authorization" in opciones.headers, false);
      assert.equal("X-CineMatch" in opciones.headers, false);
      assert.equal(opciones.body, undefined);
    }
  );
});

test("buscarPeliculas omite el año vacío y la página no indicada", async () => {
  await conFetchSimulado(
    respuestaJSON({
      pagina: 1,
      totalPaginas: 1,
      totalResultados: 0,
      peliculas: []
    }),
    async llamadas => {
      await buscarPeliculas({ titulo: "Matrix", anio: "" });

      const dirección = new URL(llamadas[0].url, "http://localhost");

      assert.equal(dirección.searchParams.get("titulo"), "Matrix");
      assert.equal(dirección.searchParams.has("anio"), false);
      assert.equal(dirección.searchParams.has("pagina"), false);
    }
  );
});

test("obtenerDetallePelicula codifica el identificador en la ruta", async () => {
  await conFetchSimulado(
    respuestaJSON({
      id: 550,
      titulo: "El club de la lucha",
      anio: 1999,
      sinopsis: null,
      generos: [],
      duracion: null,
      cartel: null
    }),
    async llamadas => {
      const ficha = await obtenerDetallePelicula("A/B");

      assert.equal(ficha.id, 550);
      assert.equal(llamadas.length, 1);
      assert.equal(llamadas[0].url, "/api/peliculas/A%2FB");
      assert.equal(llamadas[0].opciones.method, "GET");
      assert.equal(llamadas[0].opciones.credentials, "same-origin");
      assert.equal(llamadas[0].opciones.cache, "no-store");
      assert.equal("Authorization" in llamadas[0].opciones.headers, false);
    }
  );
});

test("las funciones de catálogo conservan los errores HTTP del servidor", async () => {
  await conFetchSimulado(
    respuestaJSON(
      {
        error: "Se requiere una sesión válida.",
        codigo: "SESION_INVALIDA"
      },
      401
    ),
    async () => {
      await assert.rejects(
        () => buscarPeliculas({ titulo: "Dune" }),
        error => {
          assert.ok(error instanceof ErrorAPI);
          assert.equal(error.estado, 401);
          assert.equal(error.codigo, "SESION_INVALIDA");
          assert.equal(error.message, "Se requiere una sesión válida.");
          return true;
        }
      );

      await assert.rejects(
        () => obtenerDetallePelicula("550"),
        error => {
          assert.ok(error instanceof ErrorAPI);
          assert.equal(error.estado, 401);
          return true;
        }
      );
    }
  );
});