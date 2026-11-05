ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS services text[] NOT NULL DEFAULT '{}';

CREATE TABLE public.customer_role_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customer_role_options_label_uq ON public.customer_role_options (lower(label));
GRANT SELECT, INSERT ON public.customer_role_options TO authenticated;
GRANT ALL ON public.customer_role_options TO service_role;
ALTER TABLE public.customer_role_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "employees read role options" ON public.customer_role_options FOR SELECT TO authenticated USING (public.is_active_employee(auth.uid()));
CREATE POLICY "employees add role options" ON public.customer_role_options FOR INSERT TO authenticated WITH CHECK (public.is_active_employee(auth.uid()) AND created_by = auth.uid());

INSERT INTO public.customer_role_options (label) VALUES
('Owner'),('Co-Owner'),('Founder'),('Co-Founder'),('Chairman'),('Managing Director'),('Director'),('Board Member'),('Partner'),
('CEO'),('COO'),('CTO'),('CFO'),('CMO'),('CIO'),('CISO'),('CHRO'),('CPO'),('CRO'),('CSO'),('CDO'),
('President'),('Vice President'),('General Manager'),('Country Manager'),('Head of Operations'),('Head of Sales'),('Head of Marketing'),('Head of Product'),('Head of Engineering'),('Head of Growth'),
('HR'),('HR & Admin'),('HR Manager'),('HR Executive'),('Admin Manager'),
('E-Commerce Manager'),('Business Development Executive'),('Business Development Manager'),('Creative Head'),('Creative Director'),('Art Director'),
('Marketing Manager'),('Digital Marketing Manager'),('Brand Manager'),('Social Media Manager'),('Content Manager'),('SEO Specialist'),
('Sales Manager'),('Sales Executive'),('Account Manager'),('Key Account Manager'),('Customer Success Manager'),
('Product Manager'),('Project Manager'),('Operations Manager'),('Procurement Manager'),('Supply Chain Manager'),
('Finance Manager'),('Accountant'),('IT Manager'),('Software Engineer'),('Consultant'),('Entrepreneur'),('Freelancer'),('Proprietor')
ON CONFLICT DO NOTHING;