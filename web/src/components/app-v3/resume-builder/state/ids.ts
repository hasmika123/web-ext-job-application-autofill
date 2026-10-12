/**
 * Client-generated ids for new items/bullets: `<letter>_<8 alphanumerics>`, which satisfies the
 * server validator's `[a-z]_[A-Za-z0-9]{6,12}` and is what AI proposals and undo reference later.
 */
const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export type IdPrefix = "i" | "b" | "s";

export function newId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = `${prefix}_`;
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
