ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS logout_reason text;
UPDATE public.user_sessions SET revoked_at = last_seen_at, logout_reason = 'idle_timeout'
  WHERE revoked_at IS NULL AND last_seen_at < now() - interval '35 minutes';
UPDATE public.user_sessions SET logout_reason = 'revoked' WHERE revoked_at IS NOT NULL AND logout_reason IS NULL;