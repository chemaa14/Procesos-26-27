import test from 'node:test';
import assert from 'node:assert/strict';
import { DatosUsuarios } from '../Servidor/datos.js';
import { LogicaUsuarios } from '../Servidor/logica.js';

for (const administrador of [false, true]) {
  test(`nuevo registro tras baja ${administrador ? 'administrativa' : 'propia'} sin recuperar permisos`, async () => {
    const datos = new DatosUsuarios();
    const logica = new LogicaUsuarios(datos);
    const anterior = await logica.registrar({nombre:'Anterior',email:'prueba@example.com',password:'antigua8'});
    await datos.guardar({...anterior, confirmado:true, rol:'administrador'});
    const actor = administrador ? await logica.alta({nombre:'Admin',email:'admin@example.com'}) : anterior;
    if (administrador) await datos.guardar({...actor, confirmado:true, rol:'administrador'});
    await logica.eliminarConPermisos(anterior.id, actor.id);
    await assert.rejects(logica.autenticar({email:anterior.email,password:'antigua8'}), {codigo:'CREDENCIALES_INVALIDAS'});
    const nueva = await logica.registrar({nombre:'Nueva',email:anterior.email,password:'nueva888'});
    assert.notEqual(nueva.id, anterior.id);
    assert.equal(nueva.rol, 'usuario');
    assert.equal(nueva.confirmado, false);
    await assert.rejects(logica.autenticar({email:nueva.email,password:'nueva888'}), {codigo:'CREDENCIALES_INVALIDAS'});
    await logica.confirmar(nueva.id);
    assert.equal((await logica.autenticar({email:nueva.email,password:'nueva888'})).id,nueva.id);
    await assert.rejects(logica.autenticar({email:nueva.email,password:'antigua8'}), {codigo:'CREDENCIALES_INVALIDAS'});
    await assert.rejects(logica.alta({nombre:'Duplicada',email:nueva.email}), {codigo:'EMAIL_DUPLICADO'});
  });
}

test('Google puede crear cuenta tras una baja local, sin heredar el administrador', async () => {
  const datos = new DatosUsuarios(); const logica = new LogicaUsuarios(datos);
  const vieja = await logica.alta({nombre:'Vieja',email:'google@example.com'});
  await datos.guardar({...vieja, confirmado:true, rol:'administrador'});
  await logica.eliminarConPermisos(vieja.id, vieja.id);
  const nueva = await logica.autenticarGoogle({sub:'google-id',email:vieja.email,nombre:'Nueva',emailVerificado:true});
  assert.notEqual(nueva.id,vieja.id); assert.equal(nueva.rol,'usuario');
  await logica.eliminarConPermisos(nueva.id,nueva.id);
  const local = await logica.registrar({nombre:'Local',email:nueva.email,password:'12345678'});
  assert.equal(local.confirmado,false);
  await assert.rejects(logica.autenticarGoogle({sub:'google-id',email:vieja.email,emailVerificado:true}), {codigo:'OAUTH_CUENTA_EXISTENTE'});
});

test('el registro rechaza siete caracteres y acepta ocho', async () => {
  const logica = new LogicaUsuarios(new DatosUsuarios());
  await assert.rejects(logica.registrar({nombre:'Prueba',email:'p@example.com',password:'1234567'}), {codigo:'PASSWORD_INVALIDA'});
  assert.ok((await logica.registrar({nombre:'Prueba',email:'p@example.com',password:'12345678'})).id);
});

test('el enlace anterior no confirma la nueva cuenta con el mismo correo', async () => {
  const { ConfirmacionesMemoria } = await import('../Servidor/confirmaciones.js');
  const datos = new DatosUsuarios(); const logica = new LogicaUsuarios(datos);
  const repo = new ConfirmacionesMemoria(datos);
  const vieja = await logica.alta({nombre:'Vieja',email:'repite@example.com'});
  await repo.reservar(vieja.email,'hash-viejo');
  await logica.eliminar(vieja.id);
  const nueva = await logica.alta({nombre:'Nueva',email:vieja.email});
  assert.equal((await repo.reservar(nueva.email,'hash-nuevo')).id,nueva.id);
  assert.equal(await repo.consumir('hash-viejo'),false);
  assert.equal(await repo.consumir('hash-nuevo'),true);
  assert.equal((await logica.obtener(vieja.id)).eliminado,true);
});
