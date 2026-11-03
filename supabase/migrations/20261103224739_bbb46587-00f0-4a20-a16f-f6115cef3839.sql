CREATE POLICY ceo_manage_expense_attachments ON public.expense_attachments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.company_id IS NOT NULL AND public.can_manage_company(e.company_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.company_id IS NOT NULL AND public.can_manage_company(e.company_id, auth.uid())));

CREATE POLICY ceo_read_expense_logs ON public.expense_activity_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.company_id IS NOT NULL AND public.can_manage_company(e.company_id, auth.uid())));
CREATE POLICY ceo_write_expense_logs ON public.expense_activity_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.company_id IS NOT NULL AND public.can_manage_company(e.company_id, auth.uid())));

-- Receipts: a company CEO may upload, and read/replace only files attached to their own company's expenses.
CREATE POLICY "CEO can upload expense receipts" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts' AND public.is_any_company_manager(auth.uid()));
CREATE POLICY "CEO can read own company expense receipts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts' AND (
    owner = auth.uid() OR EXISTS (
      SELECT 1 FROM public.expenses e LEFT JOIN public.expense_attachments a ON a.expense_id = e.id
      WHERE (a.path = name OR e.receipt_url = name OR e.signed_voucher_url = name)
        AND e.company_id IS NOT NULL AND public.can_manage_company(e.company_id, auth.uid()))));
CREATE POLICY "CEO can update own expense receipts" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'expense-receipts' AND owner = auth.uid() AND public.is_any_company_manager(auth.uid()))
  WITH CHECK (bucket_id = 'expense-receipts' AND public.is_any_company_manager(auth.uid()));