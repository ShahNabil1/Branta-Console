-- Additive Phase 4 support. Existing ownership grants and tables are preserved.
BEGIN;
ALTER TABLE public.screenshots ADD COLUMN is_blurred boolean NOT NULL DEFAULT false;
ALTER TABLE public.activity_logs
  ADD COLUMN observed_work_ms bigint NOT NULL DEFAULT 0 CHECK (observed_work_ms >= 0),
  ADD COLUMN observed_idle_ms bigint NOT NULL DEFAULT 0 CHECK (observed_idle_ms >= 0);
CREATE UNIQUE INDEX shifts_one_open_per_employee_idx ON public.shifts(employee_id)
  WHERE status = 'active' AND check_out_at IS NULL;
CREATE UNIQUE INDEX shift_breaks_one_open_per_shift_idx ON public.shift_breaks(shift_id)
  WHERE ended_at IS NULL;
CREATE VIEW public.shift_sessions WITH (security_invoker=true) AS SELECT * FROM public.shifts;
CREATE VIEW public.shift_screenshots WITH (security_invoker=true) AS
  SELECT id, shift_id AS shift_session_id, employee_id, storage_path, file_size_kb,
         captured_at, activity_percentage, is_blurred AS blur_status FROM public.screenshots;
GRANT SELECT, INSERT, UPDATE ON public.shift_sessions, public.shift_screenshots TO authenticated;
REVOKE ALL ON public.shift_sessions, public.shift_screenshots FROM anon;

CREATE FUNCTION public.tracker_transition(p_action text, p_request_id uuid, p_shift_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); sid uuid; ts timestamptz := now();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.profiles WHERE id=uid AND is_active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active tracker profile required' USING ERRCODE='42501'; END IF;
  IF p_action='CHECK_IN' THEN
    SELECT id INTO sid FROM public.shifts WHERE employee_id=uid AND status='active' AND check_out_at IS NULL FOR UPDATE;
    IF sid IS NOT NULL THEN RETURN sid; END IF;
    -- A timed-out CHECK_IN retried with its original UUID cannot create a new shift.
    SELECT id INTO sid FROM public.shifts WHERE id=p_request_id AND employee_id=uid;
    IF sid IS NOT NULL THEN RETURN sid; END IF;
    INSERT INTO public.shifts(id,employee_id,date,check_in_at) VALUES(p_request_id,uid,(ts AT TIME ZONE 'Asia/Dhaka')::date,ts);
    RETURN p_request_id;
  END IF;
  SELECT id INTO sid FROM public.shifts WHERE id=p_shift_id AND employee_id=uid FOR UPDATE;
  IF sid IS NULL THEN RAISE EXCEPTION 'Shift not owned' USING ERRCODE='42501'; END IF;
  IF p_action='CHECK_OUT' AND EXISTS(SELECT 1 FROM public.shifts WHERE id=sid AND check_out_at IS NOT NULL) THEN RETURN sid; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.shifts WHERE id=sid AND status='active' AND check_out_at IS NULL) THEN RAISE EXCEPTION 'Shift is closed'; END IF;
  IF p_action='TAKE_BREAK' THEN
    -- Preserve operation identity across retries, including a previously-ended break.
    IF EXISTS(SELECT 1 FROM public.shift_breaks WHERE id=p_request_id AND shift_id=sid) THEN RETURN sid; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.shift_breaks WHERE shift_id=sid AND ended_at IS NULL) THEN
      INSERT INTO public.shift_breaks(id,shift_id,employee_id,started_at,break_type) VALUES(p_request_id,sid,uid,ts,'other');
    END IF;
  ELSIF p_action IN ('RESUME','CHECK_OUT') THEN
    UPDATE public.shift_breaks SET ended_at=ts,duration_seconds=greatest(0,floor(extract(epoch FROM ts-started_at)))::int WHERE shift_id=sid AND employee_id=uid AND ended_at IS NULL;
    UPDATE public.shifts SET total_break_seconds=coalesce((SELECT sum(duration_seconds) FROM public.shift_breaks WHERE shift_id=sid),0) WHERE id=sid;
    IF p_action='CHECK_OUT' THEN UPDATE public.shifts SET check_out_at=ts,status='completed' WHERE id=sid; END IF;
  ELSE RAISE EXCEPTION 'Unsupported transition'; END IF;
  RETURN sid;
END; $$;

CREATE FUNCTION public.tracker_record_interval(p_id uuid,p_shift_id uuid,p_start timestamptz,p_end timestamptz,p_work_ms bigint,p_idle_ms bigint,p_clicks int,p_keys int)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE duration_ms numeric; sid uuid;
BEGIN
  SELECT id INTO sid FROM public.shifts WHERE id=p_shift_id AND employee_id=auth.uid() FOR UPDATE;
  IF sid IS NULL THEN RAISE EXCEPTION 'Shift not owned' USING ERRCODE='42501'; END IF;
  duration_ms := extract(epoch FROM p_end-p_start)*1000;
  IF p_work_ms IS NULL OR p_idle_ms IS NULL OR p_clicks IS NULL OR p_keys IS NULL OR duration_ms IS NULL
     OR duration_ms <= 0 OR duration_ms > 75000 OR p_work_ms<0 OR p_idle_ms<0 OR p_work_ms+p_idle_ms>duration_ms
     OR p_clicks<0 OR p_keys<0 OR p_clicks>10000 OR p_keys>10000 THEN RAISE EXCEPTION 'Invalid aggregate interval'; END IF;
  IF p_start < (SELECT check_in_at FROM public.shifts WHERE id=sid)-interval '5 minutes'
     OR p_end > now()+interval '5 minutes'
     OR p_end > coalesce((SELECT check_out_at FROM public.shifts WHERE id=sid),p_end)+interval '5 minutes' THEN RAISE EXCEPTION 'Invalid interval time'; END IF;
  IF EXISTS(SELECT 1 FROM public.activity_logs WHERE id=p_id AND shift_id=sid) THEN RETURN; END IF;
  -- No overlap even if another device races a heartbeat on this shift.
  IF EXISTS(SELECT 1 FROM public.activity_logs WHERE shift_id=sid AND interval_start<p_end AND interval_end>p_start) THEN RAISE EXCEPTION 'Overlapping interval'; END IF;
  INSERT INTO public.activity_logs(id,shift_id,interval_start,interval_end,mouse_clicks,keystrokes_count,status,observed_work_ms,observed_idle_ms)
  VALUES(p_id,sid,p_start,p_end,p_clicks,p_keys,CASE WHEN p_idle_ms>0 THEN 'idle' ELSE 'active' END,p_work_ms,p_idle_ms);
  -- Add exactly once; retain any pre-Phase-4 totals.
  UPDATE public.shifts SET
    total_worked_seconds=total_worked_seconds + floor((SELECT sum(observed_work_ms) FROM public.activity_logs WHERE shift_id=sid)/1000)::int - floor(((SELECT sum(observed_work_ms) FROM public.activity_logs WHERE shift_id=sid)-p_work_ms)/1000)::int,
    total_idle_seconds=total_idle_seconds + floor((SELECT sum(observed_idle_ms) FROM public.activity_logs WHERE shift_id=sid)/1000)::int - floor(((SELECT sum(observed_idle_ms) FROM public.activity_logs WHERE shift_id=sid)-p_idle_ms)/1000)::int
  WHERE id=sid;
END; $$;
REVOKE ALL ON FUNCTION public.tracker_transition(text,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.tracker_record_interval(uuid,uuid,timestamptz,timestamptz,bigint,bigint,int,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tracker_transition(text,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tracker_record_interval(uuid,uuid,timestamptz,timestamptz,bigint,bigint,int,int) TO authenticated;
COMMIT;
