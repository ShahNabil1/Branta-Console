
-- 1. Role enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'manager', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Security definer helpers (avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

-- 4. RLS policies on user_roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins manage all roles" ON public.user_roles;
CREATE POLICY "Super admins manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 5. Assign super_admin to hello@brantatech.com
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role
FROM auth.users
WHERE lower(email) = 'hello@brantatech.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- 6. God-mode helper: apply super_admin bypass to every existing public table
-- and provide a trigger to auto-apply to future tables.
CREATE OR REPLACE FUNCTION public.apply_super_admin_bypass(_schema text, _table text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  policy_name text := '_super_admin_god_mode';
  qualified text := format('%I.%I', _schema, _table);
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', qualified);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %s', policy_name, qualified);
  EXECUTE format(
    'CREATE POLICY %I ON %s AS PERMISSIVE FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()))',
    policy_name, qualified
  );
END;
$$;

-- Apply to all existing tables in public (skip user_roles - already has its own)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    PERFORM public.apply_super_admin_bypass(r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 7. Event trigger to auto-apply god-mode policy to any future public table
CREATE OR REPLACE FUNCTION public.auto_apply_super_admin_bypass()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag = 'CREATE TABLE' AND schema_name = 'public'
  LOOP
    PERFORM public.apply_super_admin_bypass(r.schema_name, split_part(r.object_identity, '.', 2));
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  -- don't block DDL if policy already exists or table type unsupported
  NULL;
END;
$$;

DROP EVENT TRIGGER IF EXISTS trg_auto_super_admin_bypass;
CREATE EVENT TRIGGER trg_auto_super_admin_bypass
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE')
  EXECUTE FUNCTION public.auto_apply_super_admin_bypass();

-- 8. Auto-grant super_admin on future re-creations of hello@brantatech.com
CREATE OR REPLACE FUNCTION public.grant_super_admin_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) = 'hello@brantatech.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_super_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_super_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_super_admin_on_signup();
