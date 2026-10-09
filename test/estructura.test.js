import test from "node:test";
import assert from "node:assert/strict";

import { crearAplicacion } from "../Servidor/api.js";

async function conServidor(comprobar) {
  const { servidor } = crearAplicacion();

  await new Promise((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(0, "127.0.0.1", resolve);
  });

  const puerto = servidor.address().port;
  const base = `http://127.0.0.1:${puerto}`;

  try {
    await comprobar(base);
  } finally {
    servidor.closeAllConnections();
    await new Promise(resolve => servidor.close(resolve));
  }
}

test("La API informa de que el servidor funciona", async () => {
  await conServidor(async base => {
    const respuesta = await fetch(`${base}/api/health`);

    assert.equal(respuesta.status, 200);
    assert.deepEqual(await respuesta.json(), {
      ok: true,
      aplicacion: "CineMatch"
    });
  });
});

test("El backend sirve la página inicial", async () => {
  await conServidor(async base => {
    const respuesta = await fetch(base);

    assert.equal(respuesta.status, 200);
    assert.match(await respuesta.text(), /<h1>CineMatch<\/h1>/);
  });
});

test("No permite descargar archivos del servidor", async () => {
  await conServidor(async base => {
    const respuesta = await fetch(`${base}/Servidor/datos.js`);

    assert.equal(respuesta.status, 404);
  });
});