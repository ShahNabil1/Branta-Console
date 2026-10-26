-- Supabase default grants also apply to new views: restrict explicitly.
BEGIN;
REVOKE ALL ON public.shift_sessions, public.shift_screenshots FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.shift_sessions, public.shift_screenshots TO authenticated;
COMMIT;
