
CREATE OR REPLACE FUNCTION public.ltr_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.lead_transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL,
  from_user_id UUID,
  to_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  note TEXT,
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ltr_lead_idx ON public.lead_transfer_requests(lead_id);
CREATE INDEX ltr_requester_idx ON public.lead_transfer_requests(requester_id);
CREATE INDEX ltr_status_idx ON public.lead_transfer_requests(status);

GRANT SELECT, INSERT, UPDATE ON public.lead_transfer_requests TO authenticated;
GRANT ALL ON public.lead_transfer_requests TO service_role;

ALTER TABLE public.lead_transfer_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ltr_select" ON public.lead_transfer_requests
FOR SELECT TO authenticated
USING (
  requester_id = auth.uid()
  OR to_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "ltr_insert" ON public.lead_transfer_requests
FOR INSERT TO authenticated
WITH CHECK (
  requester_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id AND l.owner_id = auth.uid()
    )
  )
);

CREATE POLICY "ltr_update_super" ON public.lead_transfer_requests
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER lead_transfer_requests_touch
BEFORE UPDATE ON public.lead_transfer_requests
FOR EACH ROW EXECUTE FUNCTION public.ltr_touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_transfer_requests;
ALTER TABLE public.lead_transfer_requests REPLICA IDENTITY FULL;
