CREATE TABLE public.company_deduction_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  version integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, version)
);
CREATE UNIQUE INDEX company_deduction_configs_one_active ON public.company_deduction_configs(company_id) WHERE is_active;
GRANT SELECT ON public.company_deduction_configs TO authenticated;
GRANT ALL ON public.company_deduction_configs TO service_role;
ALTER TABLE public.company_deduction_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view company deduction configs" ON public.company_deduction_configs FOR SELECT TO authenticated
USING (public.can_view_company_finance(company_id, auth.uid()));

CREATE TABLE public.company_deduction_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.company_deduction_configs(id),
  label text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('percent','fixed')),
  value numeric(14,3) NOT NULL CHECK (value >= 0),
  sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.company_deduction_rules TO authenticated;
GRANT ALL ON public.company_deduction_rules TO service_role;
ALTER TABLE public.company_deduction_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view company deduction rules" ON public.company_deduction_rules FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.company_deduction_configs c WHERE c.id = config_id
  AND public.can_view_company_finance(c.company_id, auth.uid())));

CREATE OR REPLACE FUNCTION public.save_company_deduction_config(_company uuid, _rules jsonb, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _v int; _r jsonb; _i int := 0; _pct numeric;
BEGIN
  IF NOT (public.is_finance_admin(auth.uid()) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Only finance or group admins can change deduction rules'; END IF;
  IF EXISTS (SELECT 1 FROM companies WHERE id=_company AND is_holding) THEN
    RAISE EXCEPTION 'Branta Tech uses the group deduction rules'; END IF;
  IF jsonb_typeof(_rules) <> 'array' THEN RAISE EXCEPTION 'Rules must be a list'; END IF;
  SELECT COALESCE(SUM((r->>'value')::numeric),0) INTO _pct FROM jsonb_array_elements(_rules) r WHERE r->>'mode'='percent';
  IF _pct > 100 THEN RAISE EXCEPTION 'Percentage deductions cannot exceed 100%%'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cdc:'||_company));
  SELECT COALESCE(MAX(version),0)+1 INTO _v FROM company_deduction_configs WHERE company_id=_company;
  UPDATE company_deduction_configs SET is_active=false WHERE company_id=_company AND is_active;
  INSERT INTO company_deduction_configs(company_id, version, note, created_by)
    VALUES (_company, _v, _note, auth.uid()) RETURNING id INTO _id;
  FOR _r IN SELECT * FROM jsonb_array_elements(_rules) LOOP
    INSERT INTO company_deduction_rules(config_id, label, mode, value, sort)
    VALUES (_id, _r->>'label', _r->>'mode', (_r->>'value')::numeric, _i);
    _i := _i + 1;
  END LOOP;
  RETURN _id;
END $$;
REVOKE EXECUTE ON FUNCTION public.save_company_deduction_config(uuid,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_company_deduction_config(uuid,jsonb,text) TO authenticated, service_role;