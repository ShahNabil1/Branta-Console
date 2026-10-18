// Client-safe event catalog. Shared between UI (labels/groups) and server
// dispatcher (defaults, always-on flags, default templates).

export const EVENT_GROUPS = [
  "leads",
  "meetings",
  "inbox",
  "finance",
  "security",
  "system",
] as const;
export type EventGroup = (typeof EVENT_GROUPS)[number];

export const EVENT_GROUP_LABEL: Record<EventGroup, string> = {
  leads: "Leads",
  meetings: "Meetings",
  inbox: "Inbox & Email",
  finance: "Finance",
  security: "Security",
  system: "System & Admin",
};

export const NOTIFICATION_ROLES = [
  "super_admin",
  "admin",
  "finance",
  "employee",
] as const;
export type NotificationRole = (typeof NOTIFICATION_ROLES)[number];

export const NOTIFICATION_ROLE_LABEL: Record<NotificationRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  finance: "Finance",
  employee: "Employee",
};

export interface EventDef {
  key: string;
  group: EventGroup;
  label: string;
  description: string;
  alwaysOn?: boolean; // preferences cannot mute
  /** Default HTML template with {var} placeholders. */
  template: string;
}

export const EVENT_CATALOG: readonly EventDef[] = [
  // Leads
  { key: "lead.created", group: "leads", label: "New lead created",
    description: "A new lead is added manually or pulled from Google Sheets.",
    template: "🆕 <b>New lead</b>: {name} ({slug})\nSource: {source}" },
  { key: "lead.assigned", group: "leads", label: "Lead assigned to you",
    description: "A lead was assigned to you as the owner.",
    template: "👤 <b>Lead assigned</b>: {name} ({slug})" },
  { key: "lead.transfer.requested", group: "leads", label: "Lead transfer requested",
    description: "Someone requested one of your leads.",
    template: "🔁 <b>Transfer request</b>: {requester} wants {slug}" },
  { key: "lead.transfer.decided", group: "leads", label: "Lead transfer decision",
    description: "A transfer request you submitted was approved or rejected.",
    template: "🔁 <b>Transfer {decision}</b>: {slug}" },
  { key: "lead.status_changed", group: "leads", label: "Lead status changed",
    description: "A lead you own changed status (Won / Lost / etc).",
    template: "📊 <b>Status → {status}</b>: {slug} — {name}" },
  { key: "lead.follow_up_due", group: "leads", label: "Lead follow-up due",
    description: "Reminder when a follow-up you set on your lead is due.",
    template: "⏰ <b>Follow-up due</b>: {name} ({slug}) at {time}" },
  { key: "task.assigned", group: "leads", label: "Client task assigned",
    description: "You were assigned to a client task / work order.",
    template: "🧩 <b>New task</b>: {title} — {client}\nYour part: {responsibility} ({qty})" },
  { key: "task.status_changed", group: "leads", label: "Client task status changed",
    description: "Tracking status changed on a task you are assigned to.",
    template: "📦 <b>{title}</b> ({client}) → {status}" },
  // Projects (delivery workflow)
  { key: "project.role_assigned", group: "leads", label: "Project role assigned",
    description: "You were added to a project team or your project roles changed.",
    template: "🧭 <b>Project team</b>: {project}\nYour roles: {roles}" },
  { key: "project.submission.qc", group: "leads", label: "Work submitted for QC",
    description: "A team member submitted work on a project where you are QC / Team Lead / Project Head.",
    template: "🔍 <b>QC needed</b>: {task} — {project}\nSubmitted by {who}" },
  { key: "project.qc.changes", group: "leads", label: "QC changes requested",
    description: "Your submitted work needs changes.",
    template: "🛠 <b>Changes requested</b>: {task} — {project}\n{feedback}\nDeadline: {deadline}" },
  { key: "project.qc.approved", group: "leads", label: "QC approved",
    description: "Submitted work passed internal QC.",
    template: "✅ <b>QC approved</b>: {task} — {project}" },
  { key: "project.client.revision", group: "leads", label: "Client revision requested",
    description: "The client asked for revisions on a project you work on.",
    template: "🔁 <b>Client revision #{round}</b>: {task} — {project}\n{feedback}\nDeadline: {deadline}" },
  { key: "project.client.approved", group: "leads", label: "Client approved / handover",
    description: "The client approved the delivery.",
    template: "🎉 <b>Client approved</b>: {project}" },
  { key: "project.handover", group: "leads", label: "Project handed over",
    description: "A project you worked on was delivered and handed over to the client.",
    template: "🏁 <b>Project delivered</b>: {project}\nGreat work, team!" },
  { key: "lead.sheet_sync.failed", group: "system", label: "Google Sheet sync failed",
    description: "Automatic push to the Leads sheet failed.",
    template: "⚠️ <b>Sheet sync failed</b>: {slug} — {error}" },
  // Meetings
  { key: "meeting.scheduled", group: "meetings", label: "Meeting scheduled",
    description: "A new meeting was scheduled on your lead.",
    template: "📅 <b>Meeting</b>: {title}\n{when}\n{link}" },
  { key: "meeting.reminder", group: "meetings", label: "Meeting reminder",
    description: "Reminder before a meeting starts (default: 30 min).",
    template: "⏰ <b>Starting soon</b>: {title}\n{when}\n{link}" },
  // Inbox
  { key: "inbox.new_reply", group: "inbox", label: "New inbox reply",
    description: "A lead or customer replied to your email.",
    template: "✉️ <b>New reply</b> from {from}\n<i>{subject}</i>" },
  { key: "email.bounced", group: "inbox", label: "Email bounced",
    description: "An outbound email hard-bounced.",
    template: "❌ <b>Bounce</b>: {to} — {reason}" },
  { key: "email.complained", group: "inbox", label: "Spam complaint",
    description: "A recipient marked your email as spam.",
    template: "🚫 <b>Spam complaint</b>: {to}" },
  { key: "email.delivery_failed", group: "inbox", label: "Delivery failed",
    description: "Outbound email failed to deliver.",
    template: "⚠️ <b>Delivery failed</b>: {to} — {reason}" },
  // Finance
  { key: "invoice.created", group: "finance", label: "Invoice created",
    description: "A new invoice was created.",
    template: "🧾 <b>Invoice {slug}</b> created — {amount}" },
  { key: "invoice.sent", group: "finance", label: "Invoice sent",
    description: "Invoice was emailed to the customer.",
    template: "📤 <b>Invoice {slug}</b> sent to {to}" },
  { key: "invoice.viewed", group: "finance", label: "Invoice viewed",
    description: "Customer opened the invoice PDF.",
    template: "👁 <b>Invoice {slug}</b> viewed by customer" },
  { key: "invoice.installment.paid", group: "finance", label: "Installment paid",
    description: "An invoice installment was marked paid.",
    template: "💰 <b>Payment</b> {amount} on {slug} ({label})" },
  { key: "invoice.overdue", group: "finance", label: "Invoice overdue",
    description: "An invoice or installment became overdue.",
    template: "🔴 <b>Overdue</b>: {slug} — {amount} due {due}" },
  { key: "invoice.reminder_sent", group: "finance", label: "Payment reminder sent",
    description: "Automated payment reminder went out to the customer.",
    template: "🔔 Reminder sent for {slug} — {kind}" },
  { key: "payout.available", group: "finance", label: "Payout available",
    description: "A payout on your wallet became available to withdraw.",
    template: "🎉 <b>Payout available</b>: {amount} — {slug}" },
  { key: "payout.requested", group: "finance", label: "Withdrawal requested",
    description: "An employee submitted a withdrawal request.",
    template: "🏦 <b>Withdrawal request</b>: {user} — {amount}" },
  { key: "payout.paid", group: "finance", label: "Withdrawal paid",
    description: "A withdrawal was paid out.",
    template: "✅ <b>Withdrawal paid</b>: {amount} — ref {ref}" },
  { key: "payout.revoked", group: "finance", label: "Payout revoked",
    description: "A payout was clawed back.",
    template: "↩️ <b>Payout revoked</b>: {amount} — {slug}" },
  { key: "salary.slip.issued", group: "finance", label: "Salary slip issued",
    description: "A salary slip was issued for an employee.",
    template: "💵 <b>Salary slip issued</b>: {slip} — {user} ({month})\nNet: {amount}\nVoucher: {voucher}" },
  { key: "salary.slip.signed", group: "finance", label: "Signed salary slip uploaded",
    description: "A printed, signed & sealed salary slip was uploaded back.",
    template: "🖊️ <b>Signed salary slip uploaded</b>: {slip} — {user} ({month})" },
  { key: "income.voucher.created", group: "finance", label: "Money receipt created",
    description: "A printable money receipt was generated for a received payment.",
    template: "🧾 <b>Money receipt</b>: {voucher} — {amount}\nFrom: {party} ({date})" },
  { key: "income.voucher.signed", group: "finance", label: "Signed money receipt uploaded",
    description: "A printed, signed & sealed money receipt was uploaded back.",
    template: "🖊️ <b>Signed money receipt</b>: {voucher} — {amount}\nFrom: {party} ({date})" },

  { key: "expense.added", group: "finance", label: "Expense added",

    description: "A new company expense was recorded.",
    template: "🧾 <b>Expense</b>: {category} — {amount}" },
  { key: "wallet.company.low_balance", group: "finance", label: "Company wallet low",
    description: "Company real balance dropped below the threshold.",
    template: "⚠️ <b>Company wallet low</b>: {balance} (< {threshold})" },
  // Security (always-on defaults)
  { key: "auth.new_device_login", group: "security", label: "New device sign-in",
    description: "Sign-in from an unrecognized device or IP.", alwaysOn: true,
    template: "🔐 <b>New device sign-in</b>\n{device} — {ip}\n{when}" },
  { key: "auth.password_changed", group: "security", label: "Password changed",
    description: "Your account password was changed.", alwaysOn: true,
    template: "🔑 Your Branta password was changed at {when}" },
  { key: "auth.mfa_changed", group: "security", label: "2FA changed",
    description: "Your two-factor authenticator was updated.",
    template: "🛡 Two-factor authenticator updated at {when}" },
  { key: "passkey.added", group: "security", label: "Passkey added",
    description: "A new passkey was registered on your account.",
    template: "🔑 New passkey <b>{name}</b> added" },
  { key: "passkey.removed", group: "security", label: "Passkey removed",
    description: "A passkey was removed from your account.",
    template: "🗑 Passkey <b>{name}</b> removed" },
  { key: "auth.session.revoked_by_admin", group: "security", label: "Session revoked by admin",
    description: "An admin revoked one of your sessions.", alwaysOn: true,
    template: "🚪 An admin signed you out of {device}." },
  { key: "auth.impersonation.started", group: "security", label: "Impersonation started",
    description: "An admin started impersonating your account.", alwaysOn: true,
    template: "👤 Admin <b>{admin}</b> is impersonating your account." },
  { key: "auth.impersonation.stopped", group: "security", label: "Impersonation stopped",
    description: "Impersonation session on your account ended.",
    template: "👤 Impersonation of your account ended." },
  { key: "auth.suspicious", group: "security", label: "Suspicious activity",
    description: "Multiple failed sign-ins or geo mismatch.", alwaysOn: true,
    template: "🚨 <b>Suspicious activity</b>: {details}" },
  // System
  { key: "employee.onboarded", group: "system", label: "Employee onboarded",
    description: "A new employee finished onboarding.",
    template: "🎊 <b>{name}</b> completed onboarding." },
  { key: "employee.role_changed", group: "system", label: "Role changed",
    description: "Your role was changed by an admin.",
    template: "🛠 Your role is now <b>{roles}</b>." },
  { key: "permission.changed", group: "system", label: "Permission changed",
    description: "One of your permissions was toggled.",
    template: "🛠 Permission <b>{permission}</b> is now {value}." },
  { key: "integration.disconnected", group: "system", label: "Integration disconnected",
    description: "A connector (Brevo, Resend, Sheets, Telegram, R2) failed.",
    template: "🔌 <b>{integration}</b> disconnected — {reason}" },
  { key: "cron.failed", group: "system", label: "Scheduled job failed",
    description: "A cron job (reminders / sync) failed.",
    template: "⏱ Cron <b>{job}</b> failed — {error}" },
] as const;

export const EVENT_KEYS = EVENT_CATALOG.map((e) => e.key);

export function findEvent(key: string): EventDef | undefined {
  return EVENT_CATALOG.find((e) => e.key === key);
}

export function renderTemplate(
  tpl: string,
  vars: Record<string, unknown>,
): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}
