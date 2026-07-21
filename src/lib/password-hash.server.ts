// Shared PBKDF2 hasher for password_history entries. Server-only.
export const HISTORY_SALT = "branta-tech-pw-history-v1";

export async function hashPassword(pw: string, salt: string = HISTORY_SALT): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(pw),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
