// Shared strict validation for Branta ID / Password + a secure password generator.
// Mirrors the login page rules; ALSO enforced by Supabase (handle_new_user_profile
// trigger validates the email local-part) for defense in depth.
import { z } from "zod";

export const DOMAIN = "@brantatech.com";

export const LOCAL_MIN = 3;
export const LOCAL_MAX = 10;
export const PASSWORD_LEN = 8;

export const LOCAL_ALLOWED = /^[a-z]+$/;
export const PASSWORD_ALLOWED = /^[\x20-\x7E]+$/;

export const stripToLocal = (v: string) =>
  v.normalize("NFKC").toLowerCase().replace(/[^a-z]/g, "").slice(0, LOCAL_MAX);

export const stripToPassword = (v: string) =>
  v.normalize("NFKC").replace(/[^\x20-\x7E]/g, "").slice(0, PASSWORD_LEN);

export const localSchema = z
  .string()
  .trim()
  .min(LOCAL_MIN, `Branta ID must be at least ${LOCAL_MIN} letters.`)
  .max(LOCAL_MAX, `Branta ID can be at most ${LOCAL_MAX} letters.`)
  .regex(LOCAL_ALLOWED, "Only lowercase english letters (a–z). No numbers or symbols.");

export const passwordSchema = z
  .string()
  .length(PASSWORD_LEN, `Password must be exactly ${PASSWORD_LEN} characters.`)
  .regex(PASSWORD_ALLOWED, "Password must use english letters, numbers, or symbols only.");

// Complexity check used by admin-side employee creation: must contain lower,
// upper, digit and symbol so temporary passwords issued to new employees are
// strong even at 8 chars.
const HAS_LOWER = /[a-z]/;
const HAS_UPPER = /[A-Z]/;
const HAS_DIGIT = /[0-9]/;
const HAS_SYMBOL = /[!@#$%^&*\-_=+?]/;

export const strongPasswordSchema = passwordSchema.refine(
  (v) =>
    HAS_LOWER.test(v) &&
    HAS_UPPER.test(v) &&
    HAS_DIGIT.test(v) &&
    HAS_SYMBOL.test(v),
  {
    message:
      "Password must include lowercase, uppercase, a digit and a symbol.",
  },
);

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
// Kept small on purpose so operators do not have to escape chars when typing.
const SYMBOLS = "!@#$%^&*-_=+?";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

// Crypto-random index in [0, n) — unbiased.
const randIndex = (n: number): number => {
  const buf = new Uint32Array(1);
  const bound = Math.floor(0xffffffff / n) * n;
  // Reject-sample until we land inside [0, bound) so we get uniform mod n.
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0]! < bound) return buf[0]! % n;
  }
};

const pick = (alphabet: string) => alphabet[randIndex(alphabet.length)]!;

// Fisher–Yates shuffle using crypto randomness.
const shuffle = <T>(arr: T[]): T[] => {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randIndex(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

// Generates an 8-char temporary password guaranteed to include at least one
// lowercase, uppercase, digit and symbol.
export const generateTempPassword = (): string => {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < PASSWORD_LEN) chars.push(pick(ALL));
  return shuffle(chars).join("");
};
