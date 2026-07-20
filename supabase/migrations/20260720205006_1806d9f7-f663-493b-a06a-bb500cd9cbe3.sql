-- Profile social links: employees add their own social profiles.
CREATE TABLE public.profile_social_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  url text NOT NULL,
  label text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profile_social_links_user_idx ON public.profile_social_links(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_social_links TO authenticated;
GRANT ALL ON public.profile_social_links TO service_role;

ALTER TABLE public.profile_social_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own social links"
  ON public.profile_social_links
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Super admins manage all profile social links"
  ON public.profile_social_links
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_profile_social_links_updated
  BEFORE UPDATE ON public.profile_social_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();