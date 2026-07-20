
-- Sessions tracking (real device / IP / location per login)
CREATE TABLE public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_key text NOT NULL,
  device text,
  browser text,
  os text,
  ip text,
  country text,
  city text,
  region text,
  user_agent text,
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT user_sessions_user_key_unique UNIQUE (user_id, session_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sessions TO authenticated;
GRANT ALL ON public.user_sessions TO service_role;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own sessions" ON public.user_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_user_sessions_user_active ON public.user_sessions(user_id, revoked_at);
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sessions;

-- Password history (prevent reusing current or last password)
CREATE TABLE public.password_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.password_history TO authenticated;
GRANT ALL ON public.password_history TO service_role;
ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own password history" ON public.password_history
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
