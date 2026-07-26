-- 1) Extend trigger enum
ALTER TYPE public.invoice_email_trigger ADD VALUE IF NOT EXISTS 'reminder';

-- 2) Reminder config on invoice_email_settings
ALTER TABLE public.invoice_email_settings
  ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_days_upcoming text NOT NULL DEFAULT '3,1',
  ADD COLUMN IF NOT EXISTS reminder_days_overdue  text NOT NULL DEFAULT '1,3,7,14',
  ADD COLUMN IF NOT EXISTS reminder_subject_template text NOT NULL DEFAULT
    'Reminder · Invoice {{invoice_slug}} — {{currency}} {{outstanding_amount}} due {{due_label}}',
  ADD COLUMN IF NOT EXISTS reminder_body_html text NOT NULL DEFAULT
    '<p style="margin:0 0 12px;font:400 14px/1.55 Inter,Arial,sans-serif;color:#111827">Hi {{recipient_name}},</p><p style="margin:0 0 12px;font:400 14px/1.55 Inter,Arial,sans-serif;color:#111827">This is a friendly reminder that installment <b>#{{installment_seq}}</b> of invoice <b>{{invoice_slug}}</b> ({{currency}} {{installment_amount}}) is {{due_label}}.</p><p style="margin:0;font:400 14px/1.55 Inter,Arial,sans-serif;color:#111827">Outstanding on this invoice: <b>{{currency}} {{outstanding_amount}}</b>.</p>';

-- 3) Dedupe log rows so daily cron cannot double-send
CREATE UNIQUE INDEX IF NOT EXISTS invoice_reminder_log_uniq
  ON public.invoice_reminder_log (installment_id, kind, day_bucket);