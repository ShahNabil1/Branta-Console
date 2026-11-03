CREATE OR REPLACE FUNCTION public.set_company_default_email_provider(_company uuid, _provider text, _actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 PERFORM 1 FROM public.companies WHERE id=_company FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.company_email_providers WHERE company_id=_company AND provider=_provider AND is_active AND domain_verified_at IS NOT NULL) THEN RAISE EXCEPTION 'Provider not verified'; END IF;
 UPDATE public.company_email_providers SET is_default=(provider=_provider AND is_active),updated_by=_actor,updated_at=now() WHERE company_id=_company;
END $$;
REVOKE ALL ON FUNCTION public.set_company_default_email_provider(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_company_default_email_provider(uuid,text,uuid) TO service_role;