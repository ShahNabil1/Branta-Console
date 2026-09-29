REVOKE ALL ON public.v_wallet_balances FROM anon, PUBLIC;
GRANT SELECT ON public.v_wallet_balances TO authenticated, service_role;