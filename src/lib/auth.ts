/**
 * Local auth stub — mirrors the Supabase Auth surface we need.
 * Swap this module out for `@/integrations/supabase/client` once the
 * user connects their existing Supabase project. Component code imports
 * `auth` from here; the API shape matches supabase.auth.* one-to-one.
 */

type User = {
  id: string;
  email: string;
  created_at: string;
};

type Factor = { id: string; type: "totp"; status: "verified" | "unverified" };

type Session = {
  user: User;
  access_token: string;
  factors: Factor[];
  aal: "aal1" | "aal2"; // aal2 = 2FA satisfied
  last_active: number;
};

type AuthEvent = "SIGNED_IN" | "SIGNED_OUT" | "USER_UPDATED" | "MFA_VERIFIED";

const STORAGE_KEY = "branta.auth.session.v1";
const DOMAIN = "@brantatech.com";

const listeners = new Set<(event: AuthEvent, session: Session | null) => void>();

function isBrowser() {
  return typeof window !== "undefined";
}

function loadSession(): Session | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null) {
  if (!isBrowser()) return;
  if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else localStorage.removeItem(STORAGE_KEY);
}

function emit(event: AuthEvent, session: Session | null) {
  listeners.forEach((cb) => cb(event, session));
}

function delay(ms = 400) {
  return new Promise((r) => setTimeout(r, ms));
}

export const auth = {
  async getSession() {
    return { data: { session: loadSession() }, error: null };
  },

  async getUser() {
    const s = loadSession();
    return { data: { user: s?.user ?? null }, error: null };
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    await delay();
    if (!email.toLowerCase().endsWith(DOMAIN)) {
      return {
        data: { session: null, user: null },
        error: { message: `Only ${DOMAIN} addresses are permitted.` },
      };
    }
    if (password.length < 6) {
      return {
        data: { session: null, user: null },
        error: { message: "Incorrect email or password." },
      };
    }
    const user: User = {
      id: crypto.randomUUID(),
      email,
      created_at: new Date().toISOString(),
    };
    const session: Session = {
      user,
      access_token: crypto.randomUUID(),
      factors: [],
      aal: "aal1",
      last_active: Date.now(),
    };
    saveSession(session);
    emit("SIGNED_IN", session);
    return { data: { session, user }, error: null };
  },

  async signOut() {
    saveSession(null);
    emit("SIGNED_OUT", null);
    return { error: null };
  },

  onAuthStateChange(cb: (event: AuthEvent, session: Session | null) => void) {
    listeners.add(cb);
    return {
      data: {
        subscription: {
          unsubscribe: () => listeners.delete(cb),
        },
      },
    };
  },

  touchActivity() {
    const s = loadSession();
    if (!s) return;
    s.last_active = Date.now();
    saveSession(s);
  },

  mfa: {
    async listFactors() {
      const s = loadSession();
      const totp = (s?.factors ?? []).filter((f) => f.type === "totp");
      return { data: { totp, all: s?.factors ?? [] }, error: null };
    },

    async enroll() {
      await delay(300);
      // Static demo TOTP secret — swap for real Supabase enroll response.
      const secret = "JBSWY3DPEHPK3PXP";
      const factorId = crypto.randomUUID();
      const uri = `otpauth://totp/BrantaTech:operator?secret=${secret}&issuer=BrantaTech&algorithm=SHA1&digits=6&period=30`;
      return {
        data: { id: factorId, type: "totp" as const, totp: { secret, uri } },
        error: null,
      };
    },

    async verify({ factorId, code }: { factorId: string; code: string }) {
      await delay(300);
      if (!/^\d{6}$/.test(code)) {
        return { data: null, error: { message: "Enter the 6-digit code." } };
      }
      // Demo mode: accept any 6-digit code.
      const s = loadSession();
      if (!s) return { data: null, error: { message: "No active session." } };
      s.factors = [
        ...s.factors.filter((f) => f.id !== factorId),
        { id: factorId, type: "totp", status: "verified" },
      ];
      s.aal = "aal2";
      saveSession(s);
      emit("MFA_VERIFIED", s);
      return { data: { access_token: s.access_token }, error: null };
    },
  },
};

export type { Session, User };
