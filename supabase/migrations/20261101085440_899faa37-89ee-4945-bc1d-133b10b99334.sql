CREATE TABLE IF NOT EXISTS public.passkey_login_grants (
  grant_hash text PRIMARY KEY,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.passkey_login_grants TO service_role;
ALTER TABLE public.passkey_login_grants ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.passkey_sessions (
  session_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.passkey_sessions TO service_role;
ALTER TABLE public.passkey_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_passkey_sessions_user ON public.passkey_sessions(user_id);