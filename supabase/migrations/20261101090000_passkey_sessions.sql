-- Server-side proof that a Supabase auth session was opened by a verified passkey.
CREATE TABLE IF NOT EXISTS public.passkey_login_grants (
  grant_hash text PRIMARY KEY,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.passkey_sessions (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.passkey_login_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkey_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.passkey_login_grants FROM anon, authenticated;
REVOKE ALL ON public.passkey_sessions FROM anon, authenticated;
GRANT ALL ON public.passkey_login_grants TO service_role;
GRANT ALL ON public.passkey_sessions TO service_role;
CREATE INDEX IF NOT EXISTS idx_passkey_sessions_user ON public.passkey_sessions(user_id);
