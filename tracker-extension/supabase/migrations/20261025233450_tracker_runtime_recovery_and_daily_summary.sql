BEGIN;
ALTER TABLE public.shifts ADD COLUMN tracker_command_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
CREATE OR REPLACE FUNCTION public.tracker_transition(p_action text, p_request_id uuid, p_shift_id uuid DEFAULT NULL)
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
  IF EXISTS(SELECT 1 FROM public.shifts WHERE id=sid AND p_request_id = ANY(tracker_command_ids)) THEN RETURN sid; END IF;
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
  UPDATE public.shifts SET tracker_command_ids=tracker_command_ids || p_request_id WHERE id=sid;
  RETURN sid;
END; $$;

CREATE FUNCTION public.tracker_daily_summary(p_day date)
RETURNS TABLE(worked_seconds bigint,break_seconds bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
WITH bounds AS (
 SELECT p_day::timestamp AT TIME ZONE 'Asia/Dhaka' AS start_at,
        (p_day+1)::timestamp AT TIME ZONE 'Asia/Dhaka' AS end_at
)
SELECT
 coalesce((SELECT floor(sum(a.observed_work_ms)/1000)::bigint FROM public.activity_logs a
 JOIN public.shifts s ON s.id=a.shift_id CROSS JOIN bounds b
 WHERE s.employee_id=auth.uid() AND a.interval_start>=b.start_at AND a.interval_start<b.end_at),0),
 coalesce((SELECT floor(sum(greatest(0,extract(epoch FROM least(coalesce(x.ended_at,now()),b.end_at)-greatest(x.started_at,b.start_at)))) )::bigint
 FROM public.shift_breaks x CROSS JOIN bounds b
 WHERE x.employee_id=auth.uid() AND x.started_at<b.end_at AND coalesce(x.ended_at,now())>b.start_at),0);
$$;
REVOKE ALL ON FUNCTION public.tracker_daily_summary(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tracker_daily_summary(date) TO authenticated;
COMMIT;
