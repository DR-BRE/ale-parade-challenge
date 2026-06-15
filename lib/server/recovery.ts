import { randomInt } from "node:crypto";

// No 0/O/1/I/L — unambiguous when read off a screen or written down.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRecoveryCode(): string {
  let code = "";
  for (let i = 0; i < 5; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `PINT-${code}`;
}
