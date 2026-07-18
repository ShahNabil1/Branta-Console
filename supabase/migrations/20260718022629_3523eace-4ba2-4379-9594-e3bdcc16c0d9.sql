-- Renumber customer codes as BTC-001, BTC-002, ...
ALTER TABLE public.customers ALTER COLUMN customer_code DROP DEFAULT;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.customers
)
UPDATE public.customers c
SET customer_code = 'BTC-' || lpad(r.rn::text, 3, '0')
FROM ranked r
WHERE c.id = r.id;

-- Reset sequence to continue after the highest current row.
SELECT setval(
  'public.customer_code_seq',
  GREATEST((SELECT count(*) FROM public.customers), 1),
  true
);

ALTER TABLE public.customers
  ALTER COLUMN customer_code
  SET DEFAULT ('BTC-' || lpad(nextval('public.customer_code_seq')::text, 3, '0'));