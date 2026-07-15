-- Server-side enforcement of Branta ID format on user creation.
-- Runs inside handle_new_user_profile (SECURITY DEFINER) which fires on
-- auth.users insert. Rejects any user whose email doesn't match the strict
-- Branta ID rules: 3–10 lowercase english letters + @brantatech.com.

CREATE OR REPLACE FUNCTION public.validate_branta_email(_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _email ~ '^[a-z]{3,10}@brantatech\.com$'
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.validate_branta_email(lower(NEW.email)) THEN
    RAISE EXCEPTION
      'Invalid Branta ID: must be 3–10 lowercase english letters at @brantatech.com'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.profiles (user_id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
