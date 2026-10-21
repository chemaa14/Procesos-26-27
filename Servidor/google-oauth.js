import { OAuth2Client } from "google-auth-library";
import { createHash, randomBytes } from "node:crypto";

export class ErrorOAuth extends Error {
  constructor(codigo) { super(codigo); this.codigo = codigo; }
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
      try {
        const { tokens } = await cliente.getToken({ code: codigo, codeVerifier: verificador });
        if (!tokens.id_token) throw new ErrorOAuth("OAUTH_INVALIDO");
        // La librería comprueba firma, emisor, audiencia y caducidad.
        const ticket = await cliente.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
        const perfil = ticket.getPayload();
        if (!perfil || perfil.nonce !== nonce || perfil.email_verified !== true ||
            typeof perfil.sub !== "string" || !perfil.sub || typeof perfil.email !== "string") {
          throw new ErrorOAuth("OAUTH_INVALIDO");
        }
        return { sub: perfil.sub, email: perfil.email, nombre: perfil.name || perfil.email, emailVerificado: true };
      } catch {
        // Nunca propagar errores del proveedor: pueden incluir tokens o el secreto.
        throw new ErrorOAuth("OAUTH_INVALIDO");
      }
    }
  };
}

export const crearValorOAuth = () => randomBytes(32).toString("hex");
