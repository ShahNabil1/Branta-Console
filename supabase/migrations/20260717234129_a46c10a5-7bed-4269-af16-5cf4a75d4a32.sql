
CREATE TABLE public.lead_social_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  url TEXT NOT NULL,
  label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_social_links_lead_id ON public.lead_social_links(lead_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_social_links TO authenticated;
GRANT ALL ON public.lead_social_links TO service_role;

ALTER TABLE public.lead_social_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read lead social links"
  ON public.lead_social_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can insert lead social links"
  ON public.lead_social_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated can update lead social links"
  ON public.lead_social_links FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated can delete lead social links"
  ON public.lead_social_links FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_lead_social_links_updated_at
  BEFORE UPDATE ON public.lead_social_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
