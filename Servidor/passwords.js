//Usaremos scrypt, incluido en Node.js, con una sal aleatoria para que dos usuarios con la misma contraseña tengan hashes diferentes

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// Los parámetros quedan identificados en el formato almacenado.
const PREFIJO = "scrypt-v1";
const OPCIONES = {
  N: 131072,
  r: 8,
  p: 1,
  maxmem: 256 * 1024 * 1024
};

function esPasswordValida(password) {
  return (
    typeof password === "string" &&
    [...password].length >= 15 &&
    [...password].length <= 128
  );
}

export async function generarHash(password) {
  if (!esPasswordValida(password)) {
    throw new Error("La contraseña debe tener entre 15 y 128 caracteres.");
  }

  const sal = randomBytes(16);
  const hash = await scryptAsync(password, sal, 64, OPCIONES);

  return `${PREFIJO}$${sal.toString("hex")}$${hash.toString("hex")}`;
}

export async function verificarPassword(password, hashGuardado) {
  if (!esPasswordValida(password) || typeof hashGuardado !== "string") {
    return false;
  }

  const partes = hashGuardado.split("$");

  if (partes.length !== 3) {
    return false;
  }

  const [version, salHex, hashHex] = partes;

  if (
    version !== PREFIJO ||
    !/^[a-f0-9]{32}$/.test(salHex) ||
    !/^[a-f0-9]{128}$/.test(hashHex)
  ) {
    return false;
  }

  const hashCalculado = await scryptAsync(
    password,
    Buffer.from(salHex, "hex"),
    64,
    OPCIONES
  );

  return timingSafeEqual(
    hashCalculado,
    Buffer.from(hashHex, "hex")
  );
}