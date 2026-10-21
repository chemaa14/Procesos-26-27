import test from "node:test";
import assert from "node:assert/strict";
import { OAuth2Client } from "google-auth-library";
import { crearGoogleOAuth } from "../Servidor/google-oauth.js";
import { crearRegistroActividad } from "../Servidor/actividad.js";

test("El diagnóstico distingue el error del proveedor sin propagar secretos", async t => {
  let codigo = "invalid_client";
  t.mock.method(OAuth2Client.prototype, "getToken", async () => {
    throw Object.assign(new Error("SECRETO"), { response: { data: { error: codigo, error_description: "SECRETO" } } });
  });
  const google = crearGoogleOAuth({
    GOOGLE_CLIENT_ID: "cliente", GOOGLE_CLIENT_SECRET: "secreto",
    GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback"
  });
  for (const [valor, esperado] of [
    ["invalid_client", "google_invalid_client"],
    ["invalid_grant", "google_invalid_grant"],
    ["redirect_uri_mismatch", "google_redirect_uri_mismatch"],
    ["SECRETO", "intercambio_codigo"]
  ]) {
    codigo = valor;
    await assert.rejects(google.verificar("codigo", { nonce: "nonce", verificador: "verificador" }), error => {
      assert.equal(error.codigo, "OAUTH_INVALIDO");
      assert.equal(error.diagnostico, esperado);
      assert.equal(JSON.stringify(error).includes("SECRETO"), false);
      return true;
    });
  }
});

test("El logger solo admite diagnósticos de la lista cerrada", () => {
  const lineas = [];
  const registrar = crearRegistroActividad({ escribir: linea => lineas.push(JSON.parse(linea)) });
  registrar("oauth_rechazado", { diagnostico: "cookie_ausente" });
  registrar("oauth_rechazado", { diagnostico: "SECRETO" });
  assert.equal(lineas[0].diagnostico, "cookie_ausente");
  assert.equal(Object.hasOwn(lineas[1], "diagnostico"), false);
});
