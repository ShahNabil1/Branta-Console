UPDATE public.companies SET logo_url = '/__l5e/assets-v1/3541e672-3705-4d69-a31e-50c3255ed7dd/brand-logo.png',
 brand_kit = coalesce(brand_kit,'{}'::jsonb) || jsonb_build_object(
  'logo_primary','/__l5e/assets-v1/3541e672-3705-4d69-a31e-50c3255ed7dd/brand-logo.png',
  'logo_inverse','/__l5e/assets-v1/3541e672-3705-4d69-a31e-50c3255ed7dd/brand-logo.png',
  'mark','/__l5e/assets-v1/8d592fcc-f38e-4752-8446-997db6198135/branta-icon.png')
WHERE slug = 'branta-tech';