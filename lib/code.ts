// Generate a candidate-friendly code: 8 chars from an unambiguous alphabet.
import { randomInt } from "crypto";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export function genCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    if (i === 4) out += "-";
    out += ALPHA[randomInt(ALPHA.length)];
  }
  return out;
}
