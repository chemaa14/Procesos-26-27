import { OAuth2Client } from "google-auth-library";
import { createHash, randomBytes } from "node:crypto";

export class ErrorOAuth extends Error {
  constructor(codigo, diagnostico) { super(codigo); this.codigo = codigo; this.diagnostico = diagnostico; }
}

export function crearGoogleOAuth(env = process.env) {
  const claves = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"];
  if (claves.every(clave => !env[clave])) return null;
  let url;
  try { url = new URL(env.GOOGLE_REDIRECT_URI); } catch { /* Validado debajo. */ }
  if (claves.some(clave => !env[clave]?.trim()) || !url ||
      url.pathname !== "/api/auth/google/callback" || url.search || url.hash || url.username || url.password ||
      !(url.protocol === "https:" || (env.NODE_ENV !== "production" && url.origin === "http://localhost:3000"))) {
    const error = new Error("Configuración OAuth incompleta o inválida.");
    error.code = "CONFIGURACION_INVALIDA";
    throw error;
  }
  const cliente = new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI
  });
  cliente.transporter.defaults.timeout = 10000;
  return {
    origen: url.origin,
    generarURL({ estado, nonce, verificador }) {
      return cliente.generateAuthUrl({
        scope: ["openid", "email", "profile"],
        access_type: "online",
        prompt: "select_account",
        state: estado,
        nonce,
        code_challenge: createHash("sha256").update(verificador).digest("base64url"),
        code_challenge_method: "S256"
      });
    },
    async verificar(codigo, { nonce, verificador }) {
      let etapa = "intercambio_codigo";
      try {
        const { tokens } = await cliente.getToken({ code: codigo, codeVerifier: verificador });
        etapa = "token_ausente";
        if (!tokens.id_token) throw new ErrorOAuth("OAUTH_INVALIDO");
        // La librería comprueba firma, emisor, audiencia y caducidad.
        etapa = "validacion_token";
        const ticket = await cliente.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
        const perfil = ticket.getPayload();
        etapa = "validacion_perfil";
        if (!perfil || perfil.nonce !== nonce || perfil.email_verified !== true ||
            typeof perfil.sub !== "string" || !perfil.sub || typeof perfil.email !== "string") {
          throw new ErrorOAuth("OAUTH_INVALIDO");
        }
        return { sub: perfil.sub, email: perfil.email, nombre: perfil.name || perfil.email, emailVerificado: true };
      } catch (error) {
        const erroresProveedor = {
          invalid_client: "google_invalid_client",
          invalid_grant: "google_invalid_grant",
          redirect_uri_mismatch: "google_redirect_uri_mismatch",
          unauthorized_client: "google_unauthorized_client"
        };
        const codigoProveedor = error?.response?.data?.error;
        const diagnostico = etapa === "intercambio_codigo" &&
          typeof codigoProveedor === "string" && Object.hasOwn(erroresProveedor, codigoProveedor)
          ? erroresProveedor[codigoProveedor] : etapa;
        // Nunca propagar errores del proveedor: pueden incluir tokens o el secreto.
        throw new ErrorOAuth("OAUTH_INVALIDO", diagnostico);
      }
    }
  };
}

export const crearValorOAuth = () => randomBytes(32).toString("hex");
