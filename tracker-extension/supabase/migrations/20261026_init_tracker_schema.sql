-- Employee tracker schema. Apply as a Supabase database administrator.
BEGIN;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  console_user_id uuid UNIQUE NOT NULL,
  email text NOT NULL,
  name text,
  employee_code text,
  job_role text,
  avatar_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.employee_tracker_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shift_start_time time DEFAULT '10:00:00',
  shift_end_time time DEFAULT '19:00:00',
  grace_period_minutes int DEFAULT 15,
  required_daily_hours numeric DEFAULT 8.0,
  break_limit_minutes int DEFAULT 60,
  hourly_rate_bdt numeric DEFAULT 0,
  overtime_rate_bdt numeric DEFAULT 0,
  idle_threshold_seconds int DEFAULT 300,
  screenshots_per_hour int DEFAULT 3,
  is_screenshot_blur_enabled boolean DEFAULT false,
  allowed_ip text,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  date date DEFAULT CURRENT_DATE,
  check_in_at timestamptz DEFAULT now(),
  check_out_at timestamptz,
  total_worked_seconds int DEFAULT 0,
  total_idle_seconds int DEFAULT 0,
  total_break_seconds int DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'auto_closed')),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (id, employee_id)
);

CREATE TABLE public.shift_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  duration_seconds int DEFAULT 0,
  break_type text DEFAULT 'lunch' CHECK (break_type IN ('lunch', 'tea', 'prayer', 'other')),
  FOREIGN KEY (shift_id, employee_id) REFERENCES public.shifts(id, employee_id) ON DELETE CASCADE
);

CREATE TABLE public.screenshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  storage_path text NOT NULL,
  file_size_kb int NOT NULL,
  captured_at timestamptz DEFAULT now(),
  activity_percentage int DEFAULT 0,
  FOREIGN KEY (shift_id, employee_id) REFERENCES public.shifts(id, employee_id) ON DELETE CASCADE
);
COMMENT ON COLUMN public.screenshots.storage_path IS
  'Cloudflare R2 object key: tracking/{employee_code}/{YYYY-MM-DD}/{filename}.webp';

CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  interval_start timestamptz NOT NULL,
  interval_end timestamptz NOT NULL,
  mouse_clicks int DEFAULT 0,
  keystrokes_count int DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active', 'idle'))
);
COMMENT ON COLUMN public.activity_logs.keystrokes_count IS
  'Aggregated count only. Never store keystroke text or sensitive key data.';

CREATE INDEX shifts_employee_id_idx ON public.shifts(employee_id);
CREATE INDEX shifts_date_idx ON public.shifts(date);
CREATE INDEX shift_breaks_employee_id_idx ON public.shift_breaks(employee_id);
CREATE INDEX shift_breaks_shift_id_idx ON public.shift_breaks(shift_id);
CREATE INDEX screenshots_employee_id_idx ON public.screenshots(employee_id);
CREATE INDEX screenshots_shift_id_idx ON public.screenshots(shift_id);
CREATE INDEX activity_logs_shift_id_idx ON public.activity_logs(shift_id);
-- employee_tracker_settings.employee_id already has a UNIQUE index.

CREATE FUNCTION public.tracker_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tracker_set_updated_at();
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = id);
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);

ALTER TABLE public.employee_tracker_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.employee_tracker_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.employee_tracker_settings TO authenticated;
CREATE TRIGGER employee_tracker_settings_updated_at BEFORE UPDATE ON public.employee_tracker_settings
  FOR EACH ROW EXECUTE FUNCTION public.tracker_set_updated_at();
CREATE POLICY employee_tracker_settings_select_own ON public.employee_tracker_settings
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = employee_id);
CREATE POLICY employee_tracker_settings_insert_own ON public.employee_tracker_settings
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = employee_id);
CREATE POLICY employee_tracker_settings_update_own ON public.employee_tracker_settings
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = employee_id) WITH CHECK ((SELECT auth.uid()) = employee_id);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shifts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.shifts TO authenticated;
CREATE TRIGGER shifts_updated_at BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.tracker_set_updated_at();
CREATE POLICY shifts_select_own ON public.shifts
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = employee_id);
CREATE POLICY shifts_insert_own ON public.shifts
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = employee_id);
CREATE POLICY shifts_update_own ON public.shifts
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = employee_id) WITH CHECK ((SELECT auth.uid()) = employee_id);

ALTER TABLE public.shift_breaks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shift_breaks FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.shift_breaks TO authenticated;
CREATE POLICY shift_breaks_select_own ON public.shift_breaks
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = employee_id);
CREATE POLICY shift_breaks_insert_own ON public.shift_breaks
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = employee_id);
CREATE POLICY shift_breaks_update_own ON public.shift_breaks
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = employee_id) WITH CHECK ((SELECT auth.uid()) = employee_id);

ALTER TABLE public.screenshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.screenshots FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.screenshots TO authenticated;
CREATE POLICY screenshots_select_own ON public.screenshots
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = employee_id);
CREATE POLICY screenshots_insert_own ON public.screenshots
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = employee_id);
CREATE POLICY screenshots_update_own ON public.screenshots
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = employee_id) WITH CHECK ((SELECT auth.uid()) = employee_id);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.activity_logs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.activity_logs TO authenticated;
CREATE POLICY activity_logs_select_own ON public.activity_logs
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.shifts AS s WHERE s.id = activity_logs.shift_id AND s.employee_id = (SELECT auth.uid())));
CREATE POLICY activity_logs_insert_own ON public.activity_logs
  FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.shifts AS s WHERE s.id = activity_logs.shift_id AND s.employee_id = (SELECT auth.uid())));
CREATE POLICY activity_logs_update_own ON public.activity_logs
  FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.shifts AS s WHERE s.id = activity_logs.shift_id AND s.employee_id = (SELECT auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.shifts AS s WHERE s.id = activity_logs.shift_id AND s.employee_id = (SELECT auth.uid())));

COMMIT;
