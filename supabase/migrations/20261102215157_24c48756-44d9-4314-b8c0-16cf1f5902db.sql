CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  email text NOT NULL,
  phone text,
  address text,
  website_url text,
  ceo_user_id uuid REFERENCES public.profiles(id),
  coo_user_id uuid REFERENCES public.profiles(id),
  is_holding boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  role text NOT NULL DEFAULT 'member',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
GRANT SELECT ON public.company_members TO authenticated;
GRANT ALL ON public.company_members TO service_role;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_company_member(_company uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id=_company AND m.user_id=_user AND m.is_active)
$$;

CREATE POLICY "view companies" ON public.companies FOR SELECT TO authenticated
USING (public.is_active_employee(auth.uid()) AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin') OR public.is_company_member(id, auth.uid())));
CREATE POLICY "view company members" ON public.company_members FOR SELECT TO authenticated
USING (public.is_active_employee(auth.uid()) AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin') OR user_id = auth.uid() OR public.is_company_member(company_id, auth.uid())));

-- Leadership automatically becomes company super_admin
CREATE OR REPLACE FUNCTION public.sync_company_leadership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    UPDATE public.company_members SET role='member', updated_at=now()
     WHERE company_id=NEW.id AND role='super_admin'
       AND user_id IN (OLD.ceo_user_id, OLD.coo_user_id)
       AND user_id IS DISTINCT FROM NEW.ceo_user_id AND user_id IS DISTINCT FROM NEW.coo_user_id;
  END IF;
  IF NEW.ceo_user_id IS NOT NULL THEN
    INSERT INTO public.company_members(company_id,user_id,role) VALUES (NEW.id,NEW.ceo_user_id,'super_admin')
    ON CONFLICT (company_id,user_id) DO UPDATE SET role='super_admin', is_active=true, updated_at=now();
  END IF;
  IF NEW.coo_user_id IS NOT NULL THEN
    INSERT INTO public.company_members(company_id,user_id,role) VALUES (NEW.id,NEW.coo_user_id,'super_admin')
    ON CONFLICT (company_id,user_id) DO UPDATE SET role='super_admin', is_active=true, updated_at=now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER companies_leadership AFTER INSERT OR UPDATE OF ceo_user_id, coo_user_id ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.sync_company_leadership();

CREATE OR REPLACE FUNCTION public.companies_touch() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER companies_touch BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.companies_touch();

INSERT INTO public.companies (name, slug, email, website_url, is_holding)
VALUES ('Branta Tech', 'branta-tech', 'info@brantatech.com', 'https://brantatech.com', true)
ON CONFLICT (slug) DO NOTHING;