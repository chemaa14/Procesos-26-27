import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { normalizarEmail } from '../Servidor/logica.js';
import { crearAplicacion } from '../Servidor/api.js';

test('variante2: normaliza espacios exteriores y mayúsculas', () => {
  assert.equal(normalizarEmail(' Ana@X.com '), 'ana@x.com');
  assert.equal(normalizarEmail('A+B@Sub.X.COM'), 'a+b@sub.x.com');
});

test('variante2: rechaza formatos inválidos y tipos incorrectos', () => {
  for (const email of [undefined, null, 4, true, {}, [], '', '  ', '@x.com',
    'ana@@x.com', 'ana.x.com', 'ana@x', 'ana@.x.com', 'ana@x.com.',
    'a na@x.com', 'ana@x .com', 'ana@x\t.com']) {
    assert.throws(() => normalizarEmail(email), { codigo: 'EMAIL_INVALIDO' });
  }
});

test('variante2: aplica exactamente las reglas del dominio sin restricciones adicionales', () => {
  assert.equal(normalizarEmail('a@b..c'), 'a@b..c');
  assert.equal(normalizarEmail('a@b.c'), 'a@b.c');
});

test('variante2: endpoint público devuelve el contrato JSON sin acceder a datos', async () => {
  const datos = new Proxy({}, { get() { throw new Error('No debe consultar datos'); } });
  const { servidor } = crearAplicacion({ datos, registrarActividad: () => {} });
  servidor.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const url = `http://127.0.0.1:${servidor.address().port}/api/prueba/email`;
  try {
    for (const [cuerpo, estado, esperado] of [
      [{ email: ' Ana@X.com ' }, 200, { email: 'ana@x.com' }],
      [{ email: 'a@.x.com' }, 400, { error: 'EMAIL_INVALIDO' }],
      [{ email: 7 }, 400, { error: 'EMAIL_INVALIDO' }],
      [{}, 400, { error: 'EMAIL_INVALIDO' }],
      [null, 400, { error: 'EMAIL_INVALIDO' }],
      [[], 400, { error: 'EMAIL_INVALIDO' }]
    ]) {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      assert.equal(r.status, estado);
      assert.match(r.headers.get('content-type'), /application\/json/);
      assert.deepEqual(await r.json(), esperado);
    }
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: 'EMAIL_INVALIDO' });
  } finally {
    servidor.closeAllConnections();
    await new Promise(resolve => servidor.close(resolve));
  }
});
