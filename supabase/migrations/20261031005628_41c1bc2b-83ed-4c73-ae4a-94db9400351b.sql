ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_apps text[] NOT NULL DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION public.guard_profile_allowed_apps()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.allowed_apps IS DISTINCT FROM OLD.allowed_apps
     AND auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Only administrators can change app access';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_profile_allowed_apps ON public.profiles;
CREATE TRIGGER guard_profile_allowed_apps BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_allowed_apps();