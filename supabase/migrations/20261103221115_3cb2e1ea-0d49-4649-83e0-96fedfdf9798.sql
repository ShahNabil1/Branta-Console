CREATE OR REPLACE FUNCTION public.is_any_company_manager(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members m JOIN public.profiles p ON p.id = m.user_id
    WHERE m.is_active AND m.role = 'super_admin' AND (p.user_id = _user OR p.id = _user)
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_any_company_manager(uuid) TO authenticated;

CREATE POLICY ceo_manage_customers ON public.customers FOR ALL TO authenticated
  USING (company_id IS NOT NULL AND public.can_manage_company(company_id, auth.uid()))
  WITH CHECK (company_id IS NOT NULL AND public.can_manage_company(company_id, auth.uid()));
CREATE POLICY ceo_manage_invoices ON public.invoices FOR ALL TO authenticated
  USING (company_id IS NOT NULL AND public.can_manage_company(company_id, auth.uid()))
  WITH CHECK (company_id IS NOT NULL AND public.can_manage_company(company_id, auth.uid()));
CREATE POLICY ceo_manage_expenses ON public.expenses FOR ALL TO authenticated
  USING (company_id IS NOT NULL AND public.can_manage_company(company_id, auth.uid()))
  WITH CHECK (company_id IS NOT NULL AND public.can_manage_company(company_id, auth.uid()));
CREATE POLICY ceo_manage_invoice_items ON public.invoice_line_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND public.can_manage_company(i.company_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND public.can_manage_company(i.company_id, auth.uid())));
CREATE POLICY ceo_manage_installments ON public.invoice_installments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND public.can_manage_company(i.company_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND public.can_manage_company(i.company_id, auth.uid())));
CREATE POLICY ceo_manage_expense_items ON public.expense_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.can_manage_company(e.company_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND public.can_manage_company(e.company_id, auth.uid())));