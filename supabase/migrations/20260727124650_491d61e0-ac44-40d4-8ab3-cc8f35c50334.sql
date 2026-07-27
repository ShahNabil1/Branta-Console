
CREATE POLICY "Finance can read expense receipts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'expense-receipts' AND public.is_finance_admin(auth.uid()));

CREATE POLICY "Finance can upload expense receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'expense-receipts' AND public.is_finance_admin(auth.uid()));

CREATE POLICY "Finance can update expense receipts"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'expense-receipts' AND public.is_finance_admin(auth.uid()))
WITH CHECK (bucket_id = 'expense-receipts' AND public.is_finance_admin(auth.uid()));

CREATE POLICY "Finance can delete expense receipts"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'expense-receipts' AND public.is_finance_admin(auth.uid()));
