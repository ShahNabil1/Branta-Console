
-- ============================================================
-- Notification infrastructure (Phase 1)
-- ============================================================

-- Preferences: per-user Telegram notification settings.
CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY,
  group_leads boolean NOT NULL DEFAULT true,
  group_meetings boolean NOT NULL DEFAULT true,
  group_inbox boolean NOT NULL DEFAULT true,
  group_finance boolean NOT NULL DEFAULT true,
  group_security boolean NOT NULL DEFAULT true,
  group_system boolean NOT NULL DEFAULT true,
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start time NOT NULL DEFAULT '22:00',
  quiet_hours_end   time NOT NULL DEFAULT '07:00',
  timezone text NOT NULL DEFAULT 'Asia/Dhaka',
  digest_mode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "np_owner_select" ON public.notification_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "np_owner_upsert" ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "np_owner_update" ON public.notification_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER np_touch_updated
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Rules: admin-controlled matrix (event × role) + threshold config.
CREATE TABLE public.notification_rules (
  event_key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  role_super_admin boolean NOT NULL DEFAULT true,
  role_admin boolean NOT NULL DEFAULT true,
  role_finance boolean NOT NULL DEFAULT true,
  role_employee boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notification_rules TO authenticated;
GRANT ALL ON public.notification_rules TO service_role;
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nr_authenticated_read" ON public.notification_rules
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER nr_touch_updated
  BEFORE UPDATE ON public.notification_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Audit log of every dispatch attempt (for observability + idempotency).
CREATE TABLE public.notification_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_key text NOT NULL,
  recipient_user_id uuid NOT NULL,
  dedupe_key text,
  status text NOT NULL DEFAULT 'queued',  -- queued | sent | skipped | failed
  reason text,                             -- why skipped/failed
  message text,                            -- rendered body
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  tg_message_id bigint,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE UNIQUE INDEX notification_events_dedupe_uniq
  ON public.notification_events (recipient_user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX notification_events_recipient_idx
  ON public.notification_events (recipient_user_id, created_at DESC);
CREATE INDEX notification_events_event_idx
  ON public.notification_events (event_key, created_at DESC);

GRANT SELECT ON public.notification_events TO authenticated;
GRANT ALL ON public.notification_events TO service_role;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ne_owner_read" ON public.notification_events
  FOR SELECT TO authenticated USING (recipient_user_id = auth.uid());

-- Seed the rule matrix with the default event catalog.
-- Columns: role_super_admin, role_admin, role_finance, role_employee.
INSERT INTO public.notification_rules (event_key, enabled, role_super_admin, role_admin, role_finance, role_employee, config) VALUES
  -- Leads
  ('lead.created',                 true,  true,  true,  false, true,  '{}'::jsonb),
  ('lead.assigned',                true,  true,  true,  false, true,  '{}'::jsonb),
  ('lead.transfer.requested',      true,  true,  true,  false, true,  '{}'::jsonb),
  ('lead.transfer.decided',        true,  true,  true,  false, true,  '{}'::jsonb),
  ('lead.status_changed',          true,  true,  true,  false, true,  '{}'::jsonb),
  ('lead.sheet_sync.failed',       true,  true,  true,  false, false, '{}'::jsonb),
  -- Meetings
  ('meeting.scheduled',            true,  true,  true,  false, true,  '{}'::jsonb),
  ('meeting.reminder',             true,  true,  true,  false, true,  '{"minutesBefore":30}'::jsonb),
  -- Inbox / email
  ('inbox.new_reply',              true,  true,  true,  false, true,  '{}'::jsonb),
  ('email.bounced',                true,  true,  true,  false, true,  '{}'::jsonb),
  ('email.complained',             true,  true,  true,  false, true,  '{}'::jsonb),
  ('email.delivery_failed',        true,  true,  true,  false, true,  '{}'::jsonb),
  -- Finance
  ('invoice.created',              true,  true,  false, true,  true,  '{}'::jsonb),
  ('invoice.sent',                 true,  true,  false, true,  false, '{}'::jsonb),
  ('invoice.viewed',               true,  true,  false, true,  true,  '{}'::jsonb),
  ('invoice.installment.paid',     true,  true,  false, true,  true,  '{}'::jsonb),
  ('invoice.overdue',              true,  true,  false, true,  true,  '{}'::jsonb),
  ('invoice.reminder_sent',        true,  true,  false, true,  false, '{}'::jsonb),
  ('payout.available',             true,  false, false, false, true,  '{}'::jsonb),
  ('payout.requested',             true,  true,  false, true,  false, '{}'::jsonb),
  ('payout.paid',                  true,  true,  false, true,  true,  '{}'::jsonb),
  ('payout.revoked',               true,  true,  false, true,  true,  '{}'::jsonb),
  ('expense.added',                true,  true,  false, true,  false, '{"minAmountBDT":0}'::jsonb),
  ('wallet.company.low_balance',   true,  true,  false, true,  false, '{"thresholdBDT":20000}'::jsonb),
  -- Security (critical events are always-on regardless of preference)
  ('auth.new_device_login',        true,  true,  true,  true,  true,  '{"alwaysOn":true}'::jsonb),
  ('auth.password_changed',        true,  true,  true,  true,  true,  '{"alwaysOn":true}'::jsonb),
  ('auth.mfa_changed',             true,  true,  true,  true,  true,  '{}'::jsonb),
  ('passkey.added',                true,  true,  true,  true,  true,  '{}'::jsonb),
  ('passkey.removed',              true,  true,  true,  true,  true,  '{}'::jsonb),
  ('auth.session.revoked_by_admin',true,  true,  true,  true,  true,  '{"alwaysOn":true}'::jsonb),
  ('auth.impersonation.started',   true,  true,  true,  true,  true,  '{"alwaysOn":true}'::jsonb),
  ('auth.impersonation.stopped',   true,  true,  true,  true,  true,  '{}'::jsonb),
  ('auth.suspicious',              true,  true,  true,  true,  true,  '{"alwaysOn":true}'::jsonb),
  -- System / admin
  ('employee.onboarded',           true,  true,  true,  false, false, '{}'::jsonb),
  ('employee.role_changed',        true,  true,  false, false, true,  '{}'::jsonb),
  ('permission.changed',           true,  true,  false, false, true,  '{}'::jsonb),
  ('integration.disconnected',     true,  true,  false, false, false, '{}'::jsonb),
  ('cron.failed',                  true,  true,  false, false, false, '{}'::jsonb)
ON CONFLICT (event_key) DO NOTHING;
