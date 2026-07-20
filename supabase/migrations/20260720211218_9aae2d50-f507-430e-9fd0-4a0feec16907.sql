
CREATE TABLE public.user_passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  transports text[],
  device_type text,
  backed_up boolean NOT NULL DEFAULT false,
  friendly_name text,
  aaguid text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_passkeys TO authenticated;
GRANT ALL ON public.user_passkeys TO service_role;
ALTER TABLE public.user_passkeys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own passkeys" ON public.user_passkeys
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_user_passkeys_user ON public.user_passkeys(user_id);

-- Passkey challenges (short-lived, keyed by branta local part for pre-auth flow)
CREATE TABLE public.passkey_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge text NOT NULL UNIQUE,
  purpose text NOT NULL,
  branta_local text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);
GRANT SELECT, INSERT, DELETE ON public.passkey_challenges TO authenticated;
GRANT ALL ON public.passkey_challenges TO service_role;
-- Anon needs to insert/read authentication challenges before signing in.
GRANT SELECT, INSERT, DELETE ON public.passkey_challenges TO anon;
ALTER TABLE public.passkey_challenges ENABLE ROW LEVEL SECURITY;
-- No user-scoped policies — this table is only ever accessed via service role
-- from server functions (they validate/consume challenges). Deny-all by default.
