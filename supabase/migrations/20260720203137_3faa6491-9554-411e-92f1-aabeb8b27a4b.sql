
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill from legacy columns if present and list is empty
UPDATE public.profiles p
SET payment_methods = (
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', gen_random_uuid()::text,
      'kind', 'bank',
      'is_primary', true,
      'bank_name', p.bank_name,
      'account_holder', p.bank_account_name,
      'account_number', p.bank_account_number,
      'branch', p.bank_routing
    ) AS x
    WHERE COALESCE(p.bank_name, p.bank_account_number) IS NOT NULL
    UNION ALL
    SELECT jsonb_build_object(
      'id', gen_random_uuid()::text,
      'kind', 'mfs',
      'is_primary', COALESCE(p.bank_name, p.bank_account_number) IS NULL,
      'mfs_provider', p.mfs_provider,
      'account_holder', p.bank_account_name,
      'mfs_number', p.mfs_number
    )
    WHERE COALESCE(p.mfs_provider, p.mfs_number) IS NOT NULL
  ) sub
)
WHERE (p.payment_methods IS NULL OR p.payment_methods = '[]'::jsonb)
  AND (
    COALESCE(p.bank_name, p.bank_account_number, p.mfs_provider, p.mfs_number) IS NOT NULL
  );
