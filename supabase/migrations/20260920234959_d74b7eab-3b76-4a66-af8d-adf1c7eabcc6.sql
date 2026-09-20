ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS delete_reason text,
  ADD COLUMN IF NOT EXISTS purge_after timestamptz,
  ADD COLUMN IF NOT EXISTS last_edit_reason text;

CREATE INDEX IF NOT EXISTS idx_expenses_deleted_at ON public.expenses (deleted_at);

CREATE TABLE IF NOT EXISTS public.expense_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  voucher_no text,
  actor_id uuid,
  action text NOT NULL,
  title text NOT NULL,
  reason text,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_logs_expense ON public.expense_activity_logs (expense_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_logs_voucher ON public.expense_activity_logs (voucher_no, created_at DESC);

GRANT SELECT, INSERT ON public.expense_activity_logs TO authenticated;
GRANT ALL ON public.expense_activity_logs TO service_role;

ALTER TABLE public.expense_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Finance can read expense logs" ON public.expense_activity_logs;
CREATE POLICY "Finance can read expense logs"
  ON public.expense_activity_logs FOR SELECT TO authenticated
  USING (public.is_finance_admin(auth.uid()));

DROP POLICY IF EXISTS "Finance can write expense logs" ON public.expense_activity_logs;
CREATE POLICY "Finance can write expense logs"
  ON public.expense_activity_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_finance_admin(auth.uid()) AND actor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.purge_expired_expenses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT id, voucher_no FROM public.expenses
    WHERE deleted_at IS NOT NULL AND purge_after IS NOT NULL AND purge_after <= now()
  LOOP
    INSERT INTO public.expense_activity_logs (expense_id, voucher_no, actor_id, action, title, metadata)
    VALUES (NULL, r.voucher_no, NULL, 'purged',
            'Permanently deleted automatically after 30 days in Recycle Bin',
            jsonb_build_object('expense_id', r.id));
    DELETE FROM public.expenses WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_expired_expenses() TO authenticated, service_role;