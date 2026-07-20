
CREATE TABLE public.telegram_link_requests (
  token text PRIMARY KEY,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX telegram_link_requests_user_idx ON public.telegram_link_requests(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_link_requests TO service_role;
ALTER TABLE public.telegram_link_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_subscriptions (
  user_id uuid PRIMARY KEY,
  chat_id bigint NOT NULL UNIQUE,
  telegram_username text,
  telegram_first_name text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.telegram_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_subscriptions TO service_role;
ALTER TABLE public.telegram_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_own_telegram_subscription"
  ON public.telegram_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_telegram_subscriptions_updated_at
  BEFORE UPDATE ON public.telegram_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
