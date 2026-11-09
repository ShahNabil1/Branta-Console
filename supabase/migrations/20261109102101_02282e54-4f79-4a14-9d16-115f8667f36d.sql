CREATE TABLE public.company_contract_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  template_body text NOT NULL DEFAULT '',
  ceo_name text, ceo_title text, ceo_signature_png text,
  expiry_days int NOT NULL DEFAULT 14 CHECK (expiry_days BETWEEN 1 AND 90),
  updated_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.company_contract_settings TO authenticated;
GRANT ALL ON public.company_contract_settings TO service_role;
ALTER TABLE public.company_contract_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees read contract settings" ON public.company_contract_settings FOR SELECT TO authenticated USING (public.is_active_employee(auth.uid()));

CREATE TABLE public.project_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.client_projects(id) ON DELETE RESTRICT,
  company_id uuid REFERENCES public.companies(id),
  title text NOT NULL,
  invoice_id uuid REFERENCES public.invoices(id),
  form jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','awaiting_signature','signed','expired')),
  current_version int NOT NULL DEFAULT 0,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.project_contracts(project_id);
GRANT SELECT, INSERT, UPDATE ON public.project_contracts TO authenticated;
GRANT ALL ON public.project_contracts TO service_role;
ALTER TABLE public.project_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "viewers read contracts" ON public.project_contracts FOR SELECT TO authenticated USING (public.can_view_project(project_id, auth.uid()));
CREATE POLICY "managers create drafts" ON public.project_contracts FOR INSERT TO authenticated WITH CHECK (status = 'draft' AND public.can_manage_project(project_id, auth.uid()));
CREATE POLICY "managers edit drafts" ON public.project_contracts FOR UPDATE TO authenticated USING (status IN ('draft','expired','awaiting_signature') AND public.can_manage_project(project_id, auth.uid())) WITH CHECK (status = 'draft' OR status = 'awaiting_signature' OR status = 'expired');

CREATE TABLE public.project_contract_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.project_contracts(id) ON DELETE RESTRICT,
  version int NOT NULL,
  snapshot jsonb NOT NULL,
  published_by uuid NOT NULL, published_at timestamptz NOT NULL DEFAULT now(),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  signer_email text NOT NULL,
  signer_name text, signer_title text, signed_at timestamptz, signer_ip text, signer_ua text,
  signature_png text, pdf_sha256 text,
  UNIQUE (contract_id, version)
);
GRANT SELECT ON public.project_contract_versions TO authenticated;
GRANT ALL ON public.project_contract_versions TO service_role;
ALTER TABLE public.project_contract_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "viewers read versions" ON public.project_contract_versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.project_contracts c WHERE c.id = contract_id AND public.can_view_project(c.project_id, auth.uid())));

CREATE OR REPLACE FUNCTION public.contract_version_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Contract versions cannot be deleted'; END IF;
  IF OLD.signed_at IS NOT NULL THEN RAISE EXCEPTION 'A signed contract version cannot be changed'; END IF;
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.version <> OLD.version OR NEW.contract_id <> OLD.contract_id
     OR NEW.published_by <> OLD.published_by OR NEW.published_at <> OLD.published_at THEN
    RAISE EXCEPTION 'Published contract content cannot be changed; create a new version';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contract_version_immutable BEFORE UPDATE OR DELETE ON public.project_contract_versions FOR EACH ROW EXECUTE FUNCTION public.contract_version_immutable();

CREATE TABLE public.contract_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.project_contract_versions(id) ON DELETE CASCADE,
  code_hash text NOT NULL, attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL, verified_at timestamptz, session_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.contract_otp_challenges(version_id, created_at);
GRANT ALL ON public.contract_otp_challenges TO service_role;
ALTER TABLE public.contract_otp_challenges ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.contracts_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER touch_project_contracts BEFORE UPDATE ON public.project_contracts FOR EACH ROW EXECUTE FUNCTION public.contracts_touch();
CREATE TRIGGER touch_contract_settings BEFORE UPDATE ON public.company_contract_settings FOR EACH ROW EXECUTE FUNCTION public.contracts_touch();

INSERT INTO public.company_contract_settings (company_id, enabled, template_body, ceo_title)
SELECT id, true,
'SERVICE AGREEMENT

This Agreement is made on {{date}} between {{company_name}} ("Service Provider") and {{client_name}}{{client_company_suffix}} ("Client"), contact: {{client_email}} {{client_phone}}.

1. PROJECT
Project: {{project_name}}
Service: {{service}}
Description: {{project_description}}

2. SCOPE OF WORK
{{scope}}

3. DELIVERABLES
Video length: {{video_length}}
Included revisions: {{revisions}}
Delivery date: {{delivery_date}}

4. FEES AND PAYMENT
The agreed fee is {{fee}}. Payment shall be made against invoice {{invoice_no}} using the payment details below.

5. SPECIAL TERMS
{{special_terms}}

6. ACCEPTANCE
By signing below, both parties agree to the terms of this Agreement.', 'Chief Executive Officer'
FROM public.companies WHERE slug = 'admakai'
ON CONFLICT (company_id) DO NOTHING;