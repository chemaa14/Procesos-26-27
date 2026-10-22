import nodemailer from "nodemailer";
export function crearCorreo(env = process.env, crearTransporte = nodemailer.createTransport) {
  const usuario = env.SMTP_USER?.trim();
  const password = env.SMTP_PASSWORD?.replace(/\s/g, "");
  let url;
  try { url = new URL(env.APP_URL); } catch { /* Validado debajo. */ }
  if (!usuario || !/^[^\s@<>]+@gmail\.com$/i.test(usuario) || !password || !url ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      !(url.protocol === "https:" ||
        (env.NODE_ENV !== "production" && url.origin === "http://localhost:3000"))) {
    const error = new Error("Revisa SMTP_USER, SMTP_PASSWORD y APP_URL.");
    error.code = "CONFIGURACION_CORREO_INVALIDA"; throw error;
  }
  const transporte = crearTransporte({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: usuario, pass: password },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true
  });
  return {
    urlPublica: url.origin,
    async enviar({ email, enlace }) {
      const resultado = await transporte.sendMail({
        from: { name: "CineMatch", address: usuario }, to: { address: email },
        subject: "Confirma tu cuenta de CineMatch",
        text: "Para confirmar tu cuenta de CineMatch, abre este enlace y pulsa Confirmar cuenta:\n\n" +
          enlace + "\n\nEl enlace caduca en 24 horas y solo puede utilizarse una vez. " +
          "Si no solicitaste esta cuenta, ignora este mensaje."
      });
      if (!resultado.accepted?.length) throw new Error("CORREO_NO_ENVIADO");
    }
  };
}
