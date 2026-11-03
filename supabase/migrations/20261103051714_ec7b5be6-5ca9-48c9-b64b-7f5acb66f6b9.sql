UPDATE public.companies SET logo_url = '/__l5e/assets-v1/133a94a9-7a90-4923-bc61-91537dce1172/admakai-wordmark.png', brand_kit = coalesce(brand_kit, '{}'::jsonb) || jsonb_build_object('logo_primary', '/__l5e/assets-v1/133a94a9-7a90-4923-bc61-91537dce1172/admakai-wordmark.png', 'logo_inverse', '/__l5e/assets-v1/493d852c-58f8-4cbd-a8cc-d4f3ec133a4c/admakai-wordmark-inverse.png', 'mark', '/__l5e/assets-v1/15b04716-ebd6-41a8-8ed4-9e9d0e38f766/admakai-mark.png', 'primary', '#111111', 'secondary', '#111111', 'document_style', jsonb_build_object('header_bg_color','#FFFFFF','page_bg_color','#FFFFFF','panel_bg_color','#F6F6F6','muted_color','#777777','hairline_color','#DDDDDD','logo_height',34,'font_family','Helvetica','logo_align','left')) WHERE slug = 'admakai';
CREATE OR REPLACE FUNCTION public.company_invoice_base_settings(_company uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE c public.companies; base jsonb;
BEGIN
 SELECT * INTO c FROM public.companies WHERE id = _company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invoice company not found'; END IF;
 SELECT to_jsonb(s) - 'id' - 'updated_at' - 'updated_by' INTO base FROM public.invoice_pdf_settings s WHERE id = 'default';
 base := coalesce(base, '{}'::jsonb);
 IF c.is_holding THEN RETURN base || jsonb_build_object('use_branta_assets', true); END IF;
 RETURN (base - 'logo_url' - 'signature_name' - 'signature_title' - 'payment_info' - 'payment_note') || coalesce(c.brand_kit->'document_style', '{}'::jsonb) || jsonb_build_object(
 'company_name', c.name, 'company_tagline', c.tagline, 'company_address', c.address,
 'company_email', c.email, 'company_phone', c.phone, 'company_website', c.website_url,
 'logo_url', c.brand_kit->>'logo_primary', 'logo_inverse_url', c.brand_kit->>'logo_inverse',
 'brand_color', coalesce(c.brand_kit->>'primary', base->>'brand_color', '#E56A17'),
 'text_color', coalesce(c.brand_kit->>'secondary', base->>'text_color', '#111827'),
 'header_text', 'INVOICE', 'footer_text', '', 'payment_info', '', 'payment_note', '',
 'payment_intro', '', 'signature_name', '', 'signature_title', '', 'use_branta_assets', false,
 'sections', jsonb_build_object('description',true,'installments',true,'notes',true,'terms',true,'footer',true,'payment_info',true,'signature',true,'contacts',true)
 );
END $function$;