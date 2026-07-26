import { createFileRoute } from "@tanstack/react-router";

/**
 * Daily cron endpoint. Scans open invoice installments and sends
 * "upcoming due" and "overdue" reminders using invoice_email_settings.
 *
 * Idempotent per (installment_id, kind, day_bucket) via unique index on
 * invoice_reminder_log. Safe to invoke multiple times per day.
 *
 * Trigger via pg_cron with an apikey header (Supabase anon publishable key).
 */
export const Route = createFileRoute("/api/public/hooks/invoice-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request): Promise<Response> {
  const providedKey =
    request.headers.get("apikey") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!expected || providedKey !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { internalSendInvoiceEmail } = await import("@/lib/invoice-email.functions");

  const { data: settingsRow } = await supabaseAdmin
    .from("invoice_email_settings")
    .select(
      "reminders_enabled, reminder_days_upcoming, reminder_days_overdue, reminder_subject_template, reminder_body_html",
    )
    .eq("id", "default")
    .maybeSingle();

  const s = (settingsRow ?? {
    reminders_enabled: true,
    reminder_days_upcoming: "3,1",
    reminder_days_overdue: "1,3,7,14",
    reminder_subject_template:
      "Reminder · Invoice {{invoice_slug}} — {{currency}} {{outstanding_amount}} due {{due_label}}",
    reminder_body_html:
      "<p>Hi {{recipient_name}}, installment #{{installment_seq}} of {{invoice_slug}} ({{currency}} {{installment_amount}}) is {{due_label}}.</p>",
  }) as {
    reminders_enabled: boolean;
    reminder_days_upcoming: string;
    reminder_days_overdue: string;
    reminder_subject_template: string;
    reminder_body_html: string;
  };

  if (!s.reminders_enabled) {
    return json({ ok: true, skipped: "disabled" });
  }

  const upcoming = parseDays(s.reminder_days_upcoming); // e.g. [3,1] → due in N days
  const overdue = parseDays(s.reminder_days_overdue); // e.g. [1,3,7,14] → due N days ago
  const today = new Date();
  const dayBucket = isoDate(today);

  const targets: Array<{ kind: "upcoming" | "overdue"; days: number; date: string }> = [];
  for (const d of upcoming) targets.push({ kind: "upcoming", days: d, date: isoDate(addDays(today, d)) });
  for (const d of overdue) targets.push({ kind: "overdue", days: d, date: isoDate(addDays(today, -d)) });

  if (targets.length === 0) return json({ ok: true, sent: 0, skipped: "no windows" });

  // Fetch candidate installments in one query.
  const dates = Array.from(new Set(targets.map((t) => t.date)));
  const { data: installments, error } = await supabaseAdmin
    .from("invoice_installments")
    .select("id, invoice_id, sequence, amount, due_date, status")
    .in("due_date", dates)
    .in("status", ["pending", "invoiced", "overdue"]);
  if (error) return json({ ok: false, error: error.message }, 500);

  let sent = 0;
  let skipped = 0;
  const errors: Array<{ installment_id: string; message: string }> = [];

  for (const inst of installments ?? []) {
    const t = targets.find((x) => x.date === inst.due_date);
    if (!t) continue;

    // Idempotency: skip if already logged for this bucket + kind.
    const { data: existing } = await supabaseAdmin
      .from("invoice_reminder_log")
      .select("id")
      .eq("installment_id", inst.id)
      .eq("kind", t.kind === "upcoming" ? `upcoming_${t.days}d` : `overdue_${t.days}d`)
      .eq("day_bucket", dayBucket)
      .maybeSingle();
    if (existing) {
      skipped++;
      continue;
    }

    // Resolve recipients from invoice → customer contacts.
    const { data: inv } = await supabaseAdmin
      .from("invoices")
      .select("id, slug, customer_id")
      .eq("id", inst.invoice_id)
      .maybeSingle();
    if (!inv) continue;

    const { data: cust } = await supabaseAdmin
      .from("customers")
      .select("email, name")
      .eq("id", inv.customer_id)
      .maybeSingle();
    if (!cust?.email) {
      skipped++;
      continue;
    }

    const dueLabel =
      t.kind === "upcoming"
        ? t.days === 0
          ? "due today"
          : t.days === 1
            ? "due tomorrow"
            : `due in ${t.days} days`
        : t.days === 1
          ? "1 day overdue"
          : `${t.days} days overdue`;

    try {
      const result = await internalSendInvoiceEmail({
        slug: inv.slug,
        recipients: [{ email: cust.email, name: cust.name ?? null }],
        trigger: "reminder",
        installment_id: inst.id,
        subjectOverride: s.reminder_subject_template,
        bodyOverride: s.reminder_body_html,
        extraVars: {
          due_label: dueLabel,
          installment_seq: String(inst.sequence),
          installment_amount: formatAmount(inst.amount),
          days: String(t.days),
        },
      });

      const providerRef =
        result.results.find((r) => r.ok)?.eventId ?? undefined;

      await supabaseAdmin.from("invoice_reminder_log").insert({
        installment_id: inst.id,
        kind: t.kind === "upcoming" ? `upcoming_${t.days}d` : `overdue_${t.days}d`,
        day_bucket: dayBucket,
        recipients: [cust.email],
        provider_ref: providerRef,
      });

      sent += result.sent;
    } catch (e) {
      errors.push({
        installment_id: inst.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return json({ ok: true, sent, skipped, errors, day_bucket: dayBucket });
}

function parseDays(s: string): number[] {
  return Array.from(
    new Set(
      s
        .split(",")
        .map((x) => parseInt(x.trim(), 10))
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 90),
    ),
  );
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function formatAmount(n: number | string): string {
  const v = typeof n === "number" ? n : Number(n);
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
