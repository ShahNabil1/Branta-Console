ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS division TEXT,
  ADD COLUMN IF NOT EXISTS upazila TEXT,
  ADD COLUMN IF NOT EXISTS post_office TEXT;

-- Country defaults to Bangladesh going forward.
UPDATE public.profiles SET country = 'Bangladesh' WHERE country IS NULL OR country = '';
ALTER TABLE public.profiles ALTER COLUMN country SET DEFAULT 'Bangladesh';