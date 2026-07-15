CREATE OR REPLACE FUNCTION public.insert_brevo_email_events(_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF jsonb_typeof(_rows) <> 'array' THEN
    RAISE EXCEPTION 'Expected an array of email event rows';
  END IF;

  INSERT INTO public.email_events (
    event,
    email,
    message_id,
    subject,
    reason,
    tag,
    link,
    list_id,
    occurred_at,
    raw
  )
  SELECT
    nullif(trim(item->>'event'), '')::text,
    lower(nullif(trim(item->>'email'), ''))::text,
    nullif(item->>'message_id', '')::text,
    nullif(item->>'subject', '')::text,
    nullif(item->>'reason', '')::text,
    nullif(item->>'tag', '')::text,
    nullif(item->>'link', '')::text,
    CASE
      WHEN item ? 'list_id' AND jsonb_typeof(item->'list_id') = 'number'
      THEN (item->>'list_id')::integer
      ELSE NULL
    END,
    COALESCE(nullif(item->>'occurred_at', '')::timestamptz, now()),
    COALESCE(item->'raw', item)
  FROM jsonb_array_elements(_rows) AS item
  WHERE nullif(trim(item->>'event'), '') IS NOT NULL
    AND nullif(trim(item->>'email'), '') IS NOT NULL;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_brevo_email_events(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_brevo_email_events(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.insert_brevo_email_events(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_brevo_email_events(jsonb) TO service_role;