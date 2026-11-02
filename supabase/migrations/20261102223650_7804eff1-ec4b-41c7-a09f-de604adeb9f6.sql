ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS extra_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS extra_phones jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS offices jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS address_label text;
UPDATE public.companies SET website_url = regexp_replace(website_url, '^https?://', '', 'i') WHERE website_url ~* '^https?://';