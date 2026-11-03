CREATE TABLE public.company_invoice_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 revision integer NOT NULL CHECK (revision > 0),
 settings jsonb NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id, revision)
);
GRANT ALL ON public.company_invoice_templates TO service_role;
ALTER TABLE public.company_invoice_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoices ADD COLUMN pdf_template_snapshot jsonb;

CREATE OR REPLACE FUNCTION public.save_company_invoice_template(_company uuid, _settings jsonb, _actor uuid, _expected_revision integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_revision integer;
BEGIN
 IF NOT (public.has_role(_actor, 'super_admin') OR public.has_role(_actor, 'admin')) OR NOT public.is_finance_admin(_actor) THEN RAISE EXCEPTION 'Finance and Group admin access required'; END IF;
 PERFORM 1 FROM public.companies WHERE id = _company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_company::text || ':invoice-template', 0));
 SELECT coalesce(max(revision),0) INTO v_revision FROM public.company_invoice_templates WHERE company_id = _company;
 IF v_revision <> _expected_revision THEN RAISE EXCEPTION 'Template changed by another editor. Reload before saving.'; END IF;
 INSERT INTO public.company_invoice_templates(company_id,revision,settings,created_by) VALUES(_company,v_revision+1,_settings,_actor);
 RETURN v_revision+1;
END $$;
REVOKE ALL ON FUNCTION public.save_company_invoice_template(uuid,jsonb,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_company_invoice_template(uuid,jsonb,uuid,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.company_invoice_base_settings(_company uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.companies; base jsonb;
BEGIN
 SELECT * INTO c FROM public.companies WHERE id = _company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invoice company not found'; END IF;
 SELECT to_jsonb(s) - 'id' - 'updated_at' - 'updated_by' INTO base FROM public.invoice_pdf_settings s WHERE id = 'default';
 base := coalesce(base, '{}'::jsonb);
 IF c.is_holding THEN RETURN base || jsonb_build_object('use_branta_assets', true); END IF;
 RETURN (base - 'logo_url' - 'signature_name' - 'signature_title' - 'payment_info' - 'payment_note') || jsonb_build_object(
 'company_name', c.name, 'company_tagline', c.tagline, 'company_address', c.address,
 'company_email', c.email, 'company_phone', c.phone, 'company_website', c.website_url,
 'logo_url', c.brand_kit->>'logo_primary', 'logo_inverse_url', c.brand_kit->>'logo_inverse',
 'brand_color', coalesce(c.brand_kit->>'primary', base->>'brand_color', '#E56A17'),
 'text_color', coalesce(c.brand_kit->>'secondary', base->>'text_color', '#111827'),
 'header_text', 'INVOICE', 'footer_text', '', 'payment_info', '', 'payment_note', '',
 'payment_intro', '', 'signature_name', '', 'signature_title', '', 'use_branta_assets', false,
 'sections', jsonb_build_object('description',true,'installments',true,'notes',true,'terms',true,'footer',true,'payment_info',false)
 );
END $$;
REVOKE ALL ON FUNCTION public.company_invoice_base_settings(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_invoice_base_settings(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.capture_invoice_template()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE co uuid; template jsonb;
BEGIN
 IF TG_OP = 'UPDATE' THEN
  IF NEW.pdf_template_snapshot IS DISTINCT FROM OLD.pdf_template_snapshot THEN RAISE EXCEPTION 'Invoice template snapshots cannot be changed'; END IF;
  RETURN NEW;
 END IF;
 SELECT company_id INTO co FROM public.customers WHERE id = NEW.customer_id;
 IF co IS NULL THEN SELECT id INTO co FROM public.companies WHERE is_holding LIMIT 1; END IF;
 SELECT settings INTO template FROM public.company_invoice_templates WHERE company_id = co ORDER BY revision DESC LIMIT 1;
 NEW.pdf_template_snapshot := coalesce(template, public.company_invoice_base_settings(co));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_invoice_template() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER capture_invoice_template BEFORE INSERT OR UPDATE OF pdf_template_snapshot ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.capture_invoice_template();