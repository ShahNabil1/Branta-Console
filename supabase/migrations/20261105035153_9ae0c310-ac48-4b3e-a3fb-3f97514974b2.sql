CREATE OR REPLACE FUNCTION public.is_company_finance_member(_company uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _company IS NOT NULL AND NOT COALESCE((SELECT is_holding FROM public.companies WHERE id = _company), true)
    AND EXISTS (
      SELECT 1 FROM public.company_members m JOIN public.profiles p ON p.id = m.user_id
      WHERE m.company_id = _company AND m.is_active AND m.role = 'finance'
        AND (p.user_id = _user OR p.id = _user)
    )
$$;

CREATE POLICY company_finance_manage_expenses ON public.expenses FOR ALL TO authenticated
  USING (public.is_company_finance_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_finance_member(company_id, auth.uid()));
CREATE POLICY company_finance_manage_expense_items ON public.expense_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_items.expense_id AND public.is_company_finance_member(e.company_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_items.expense_id AND public.is_company_finance_member(e.company_id, auth.uid())));
CREATE POLICY company_finance_manage_expense_attachments ON public.expense_attachments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_attachments.expense_id AND public.is_company_finance_member(e.company_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_attachments.expense_id AND public.is_company_finance_member(e.company_id, auth.uid())));
CREATE POLICY company_finance_manage_invoices ON public.invoices FOR ALL TO authenticated
  USING (public.is_company_finance_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_finance_member(company_id, auth.uid()));
CREATE POLICY company_finance_manage_invoice_items ON public.invoice_line_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_line_items.invoice_id AND public.is_company_finance_member(i.company_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_line_items.invoice_id AND public.is_company_finance_member(i.company_id, auth.uid())));
CREATE POLICY company_finance_manage_installments ON public.invoice_installments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_installments.invoice_id AND public.is_company_finance_member(i.company_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_installments.invoice_id AND public.is_company_finance_member(i.company_id, auth.uid())));
CREATE POLICY company_finance_manage_customers ON public.customers FOR ALL TO authenticated
  USING (public.is_company_finance_member(company_id, auth.uid()))
  WITH CHECK (public.is_company_finance_member(company_id, auth.uid()));