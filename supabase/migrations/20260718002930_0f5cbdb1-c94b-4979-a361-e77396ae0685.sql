ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS personal_gmail text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_personal_gmail_gmail_only;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_personal_gmail_gmail_only
  CHECK (personal_gmail IS NULL OR personal_gmail ~* '^[a-z0-9._%+-]+@gmail\.com$');