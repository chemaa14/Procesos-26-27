import test from "node:test";
import assert from "node:assert/strict";
import { DatosUsuarios } from "../Servidor/datos.js";
import { LogicaUsuarios } from "../Servidor/logica.js";

const perfil = { sub: "google-carrera", email: "carrera@example.invalid", nombre: "Prueba", emailVerificado: true };

for (const caso of [
  { nombre: "misma identidad", sub: perfil.sub, confirmado: true, aceptado: true },
  { nombre: "otra identidad", sub: "otro-sub", confirmado: true, codigo: "OAUTH_CUENTA_EXISTENTE" },
  { nombre: "cuenta local", sub: null, confirmado: true, codigo: "OAUTH_CUENTA_EXISTENTE" },
  { nombre: "identidad sin confirmar", sub: perfil.sub, confirmado: false, codigo: "OAUTH_INVALIDO" }
]) {
  test(`Google: cuenta insertada entre lectura de identidad y correo, ${caso.nombre}`, async () => {
    class DatosConCarrera extends DatosUsuarios {
      async buscarPorEmail(email) {
        // Otra petición completa el alta después del primer buscarPorGoogleSub.
        if (!this.insertado) {
          this.insertado = true;
          const usuario = { id: "usuario-concurrente", nombre: "Prueba", email,
            confirmado: caso.confirmado, eliminado: false, rol: "usuario" };
          if (caso.sub) await this.crearConGoogle(usuario, caso.sub);
          else await this.guardar(usuario);
        }
        return super.buscarPorEmail(email);
      }
    }
    const datos = new DatosConCarrera();
    const logica = new LogicaUsuarios(datos);
    if (caso.aceptado) {
      const usuario = await logica.autenticarGoogle(perfil);
      assert.equal(usuario.id, "usuario-concurrente");
      assert.equal(usuario.rol, "usuario");
      assert.equal((await datos.listar()).length, 1);
    } else {
      await assert.rejects(logica.autenticarGoogle(perfil), { codigo: caso.codigo });
    }
  });
}