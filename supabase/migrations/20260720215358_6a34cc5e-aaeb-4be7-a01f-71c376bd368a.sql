
-- Employee code (BTE-XXXXXX) + job role on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS job_role text;

-- Generator: BTE- + 6 upper alphanumerics, retries on collision
CREATE OR REPLACE FUNCTION public.generate_employee_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- avoid I,O,0,1
  code text;
  i int;
  attempts int := 0;
BEGIN
  LOOP
    code := 'BTE-';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE employee_code = code);
    attempts := attempts + 1;
    IF attempts > 20 THEN
      RAISE EXCEPTION 'Could not allocate a unique employee_code';
    END IF;
  END LOOP;
  RETURN code;
END;
$$;

-- Trigger to assign on insert if missing
CREATE OR REPLACE FUNCTION public.assign_employee_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_code IS NULL OR NEW.employee_code = '' THEN
    NEW.employee_code := public.generate_employee_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_assign_employee_code ON public.profiles;
CREATE TRIGGER trg_profiles_assign_employee_code
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.assign_employee_code();

-- Backfill existing rows
UPDATE public.profiles
   SET employee_code = public.generate_employee_code()
 WHERE employee_code IS NULL;
