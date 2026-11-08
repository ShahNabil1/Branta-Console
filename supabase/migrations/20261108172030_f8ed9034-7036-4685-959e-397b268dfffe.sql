ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS service_catalog jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE public.companies SET service_catalog = jsonb_build_array(jsonb_build_object('category','Services','services',to_jsonb(services)))
 WHERE service_catalog = '[]'::jsonb AND coalesce(array_length(services,1),0) > 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS services text[] NOT NULL DEFAULT '{}';