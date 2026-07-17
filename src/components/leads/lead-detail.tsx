// Full-page Lead detail with Overview / Emails / Meetings / Docs tabs.
// Extracted from the former drawer so it can be mounted at /app/leads/$slug.
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Trash2,
  Save,
  MessageSquarePlus,
  RefreshCw,
  Send,
  Mail,
  CalendarPlus,
  FileText,
  Video,
  ExternalLink,
  Copy,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  addLeadActivity,
  deleteLead,
  listLeadActivities,
  listLeadContacts,
  updateLead,
  type LeadContactRow,
  type LeadRow,
  type LeadStatusDB,
} from "@/lib/leads.functions";
import {
  drainEmailQueue,
  getEmailUsageToday,
  listLeadEmails,
  renderVariables,
  retryFailedEmail,
  sendLeadEmail,
  type EmailUsageToday,
  type LeadEmailRow,
} from "@/lib/lead-email.functions";
import { listResendEventsForLead } from "@/lib/resend-events.functions";
import { listBrevoEventsForLead } from "@/lib/brevo-events.functions";
import {
  cancelLeadMeeting,
  listLeadMeetings,
  scheduleLeadMeeting,
  type LeadMeetingRow,
} from "@/lib/lead-meetings.functions";
import {
  deleteLeadDoc,
  generateLeadDoc,
  listLeadDocs,
  type LeadDocumentRow,
} from "@/lib/lead-docs.functions";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye } from "lucide-react";

// Same status metadata as the list page.
const STATUSES: { value: LeadStatusDB; label: string; dotVar: string }[] = [
  { value: "new", label: "New", dotVar: "--color-status-new" },
  { value: "contacted", label: "Contacted", dotVar: "--color-status-contacted" },
  { value: "viewed", label: "Viewed", dotVar: "--color-status-viewed" },
  { value: "meeting", label: "Meeting Scheduled", dotVar: "--color-status-meeting" },
  { value: "converted", label: "Converted", dotVar: "--color-status-converted" },
  { value: "lost", label: "Lost", dotVar: "--color-status-contacted" },
];
const STATUS_META = new Map(STATUSES.map((s) => [s.value, s] as const));

function StatusBadge({ status }: { status: LeadStatusDB }) {
  const meta = STATUS_META.get(status);
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-foreground">
      <span
        className="size-1.5 rounded-full"
        style={{ background: `var(${meta?.dotVar})` }}
      />
      {meta?.label ?? status}
    </span>
  );
}

function relTime(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("space-y-1", className)}>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      {children}
    </label>
  );
}

export function LeadDetail({
  lead,
  users,
  onDeleted,
}: {
  lead: LeadRow;
  users: { user_id: string; full_name: string | null }[];
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateLead);
  const del = useServerFn(deleteLead);
  const listAct = useServerFn(listLeadActivities);
  const addAct = useServerFn(addLeadActivity);

  const [form, setForm] = useState({
    name: lead.name,
    company: lead.company ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    status: lead.status,
    source: lead.source ?? "",
    owner_id: lead.owner_id ?? "",
    value_usd: lead.value_usd == null ? "" : String(lead.value_usd),
    currency: (lead.currency ?? "BDT") as "BDT" | "USD",
    next_action: lead.next_action ?? "",
    notes: lead.notes ?? "",
  });

  useEffect(() => {
    setForm({
      name: lead.name,
      company: lead.company ?? "",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      status: lead.status,
      source: lead.source ?? "",
      owner_id: lead.owner_id ?? "",
      value_usd: lead.value_usd == null ? "" : String(lead.value_usd),
      currency: (lead.currency ?? "BDT") as "BDT" | "USD",
      next_action: lead.next_action ?? "",
      notes: lead.notes ?? "",
    });
  }, [lead.id, lead.status, lead.owner_id, lead.updated_at]);

  const activities = useQuery({
    queryKey: ["leads", "activities", lead.id],
    queryFn: () => listAct({ data: { leadId: lead.id } }),
    staleTime: 10_000,
  });

  const saveM = useMutation({
    mutationFn: () =>
      update({
        data: {
          id: lead.id,
          patch: {
            name: form.name.trim(),
            company: form.company.trim() || null,
            email: form.email.trim() || null,
            phone: form.phone.trim() || null,
            status: form.status,
            source: form.source.trim() || null,
            owner_id: form.owner_id || null,
            value_usd: form.value_usd ? Number(form.value_usd) : null,
            currency: form.currency,
            next_action: form.next_action.trim() || null,
            notes: form.notes.trim() || null,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Lead updated");
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const delM = useMutation({
    mutationFn: () => del({ data: { id: lead.id } }),
    onSuccess: () => {
      toast.success("Lead deleted");
      qc.invalidateQueries({ queryKey: ["leads"] });
      onDeleted?.();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const [noteText, setNoteText] = useState("");
  const noteM = useMutation({
    mutationFn: () =>
      addAct({ data: { leadId: lead.id, kind: "note", body: noteText.trim() } }),
    onSuccess: () => {
      setNoteText("");
      toast.success("Note added");
      qc.invalidateQueries({ queryKey: ["leads", "activities", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads", "list"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to add note"),
  });

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/app/leads"
            className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" /> Back to leads
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <span className="rounded-sm bg-muted px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {lead.slug ?? lead.lead_code}
            </span>
            <StatusBadge status={lead.status} />
          </div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">
            {lead.name}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {lead.company ?? "No company"}
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="grid h-9 w-full max-w-md grid-cols-4 rounded-sm bg-muted p-0.5">
          <TabsTrigger value="overview" className="h-8 rounded-sm text-[12px]">
            Overview
          </TabsTrigger>
          <TabsTrigger value="emails" className="h-8 rounded-sm text-[12px]">
            <Mail className="mr-1 size-3.5" /> Emails
          </TabsTrigger>
          <TabsTrigger value="meetings" className="h-8 rounded-sm text-[12px]">
            <CalendarPlus className="mr-1 size-3.5" /> Meetings
          </TabsTrigger>
          <TabsTrigger value="docs" className="h-8 rounded-sm text-[12px]">
            <FileText className="mr-1 size-3.5" /> Docs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="m-0 mt-4 grid gap-4">
          <section className="rounded-sm border border-border bg-card">
            <div className="border-b border-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Details
            </div>
            <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-3">
              <Field label="Name" className="col-span-2 md:col-span-3">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-9 rounded-sm text-[12.5px]"
                />
              </Field>
              <Field label="Company">
                <Input
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  className="h-9 rounded-sm text-[12.5px]"
                />
              </Field>
              <Field label="Source">
                <Input
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="h-9 rounded-sm text-[12.5px]"
                />
              </Field>
              <Field label="Email">
                <Input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="h-9 rounded-sm text-[12.5px]"
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="h-9 rounded-sm text-[12.5px]"
                />
              </Field>
              <Field label="Status">
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    setForm({ ...form, status: v as LeadStatusDB })
                  }
                >
                  <SelectTrigger className="h-9 rounded-sm text-[12.5px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Owner">
                <Select
                  value={form.owner_id || "none"}
                  onValueChange={(v) =>
                    setForm({ ...form, owner_id: v === "none" ? "" : v })
                  }
                >
                  <SelectTrigger className="h-9 rounded-sm text-[12.5px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.full_name || u.user_id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Currency">
                <Select
                  value={form.currency}
                  onValueChange={(v) =>
                    setForm({ ...form, currency: v as "BDT" | "USD" })
                  }
                >
                  <SelectTrigger className="h-9 rounded-sm text-[12.5px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BDT">BDT — Bangladeshi Taka</SelectItem>
                    <SelectItem value="USD">USD — US Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={`Value (${form.currency})`}>
                <Input
                  inputMode="decimal"
                  value={form.value_usd}
                  onChange={(e) => setForm({ ...form, value_usd: e.target.value })}
                  className="h-9 rounded-sm font-mono text-[12.5px]"
                />
              </Field>
              <Field label="Next action" className="col-span-2 md:col-span-3">
                <Input
                  value={form.next_action}
                  onChange={(e) =>
                    setForm({ ...form, next_action: e.target.value })
                  }
                  className="h-9 rounded-sm text-[12.5px]"
                />
              </Field>
              <Field label="Notes" className="col-span-2 md:col-span-3">
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="min-h-[80px] rounded-sm text-[12.5px]"
                />
              </Field>
            </div>
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-sm text-[12px] text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => {
                  if (confirm(`Delete lead ${lead.slug ?? lead.lead_code}?`))
                    delM.mutate();
                }}
                disabled={delM.isPending}
              >
                {delM.isPending ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1.5 size-3.5" />
                )}
                Delete
              </Button>
              <Button
                size="sm"
                className="h-8 rounded-sm bg-primary text-[12px] text-primary-foreground hover:bg-brand-700"
                disabled={saveM.isPending || !form.name.trim()}
                onClick={() => saveM.mutate()}
              >
                {saveM.isPending ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 size-3.5" />
                )}
                Save changes
              </Button>
            </div>
          </section>

          <section className="rounded-sm border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">
                  Activity Logs
                </span>
                {activities.data && activities.data.length > 0 && (
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {activities.data.length}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">
                Newest first
              </span>
            </div>
            <div className="grid gap-2 border-b border-border p-3">
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note (call summary, next steps, blockers…)"
                className="min-h-[70px] rounded-sm text-[12.5px]"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="h-8 rounded-sm bg-primary text-[12px] text-primary-foreground hover:bg-brand-700"
                  disabled={noteM.isPending || !noteText.trim()}
                  onClick={() => noteM.mutate()}
                >
                  {noteM.isPending ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <MessageSquarePlus className="mr-1.5 size-3.5" />
                  )}
                  Add note
                </Button>
              </div>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {activities.isLoading && (
                <div className="p-4 text-[12px] text-muted-foreground">
                  Loading activity…
                </div>
              )}
              {activities.data?.length === 0 && !activities.isLoading && (
                <div className="flex flex-col items-center justify-center gap-1 px-4 py-10 text-center">
                  <div className="text-[12.5px] font-medium text-foreground">
                    No activity yet
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Notes, emails, meetings, and status changes will appear here.
                  </div>
                </div>
              )}
              {activities.data && activities.data.length > 0 && (
                <ol className="relative px-3 py-3">
                  <span
                    className="pointer-events-none absolute bottom-3 left-[19px] top-3 w-px bg-border"
                    aria-hidden
                  />
                  {activities.data.map((a) => {
                    const d = new Date(a.created_at);
                    const abs = d.toLocaleString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: true,
                    });
                    return (
                      <li key={a.id} className="relative pb-4 pl-8 last:pb-0">
                        <span
                          className="absolute left-[15px] top-1.5 grid size-2 place-items-center rounded-full bg-brand ring-4 ring-card"
                          aria-hidden
                        />
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            {a.kind}
                          </span>
                          <span className="text-[12px] font-medium text-foreground">
                            {a.actor_name ?? "System"}
                          </span>
                        </div>
                        {a.body && (
                          <div className="mt-1 whitespace-pre-wrap text-[12.5px] text-foreground">
                            {a.body}
                          </div>
                        )}
                        <div
                          className="mt-1 font-mono text-[10.5px] text-muted-foreground"
                          title={d.toISOString()}
                        >
                          {abs}
                          <span className="ml-1.5 text-[10px] text-muted-foreground/70">
                            · {relTime(a.created_at)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </section>

        </TabsContent>

        <TabsContent value="emails" className="m-0 mt-4">
          <EmailsTab lead={lead} />
        </TabsContent>
        <TabsContent value="meetings" className="m-0 mt-4">
          <MeetingsTab lead={lead} />
        </TabsContent>
        <TabsContent value="docs" className="m-0 mt-4">
          <DocumentsTab lead={lead} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Emails tab (Resend-only compose) ----------
const EMAIL_VARIABLES: { token: string; label: string }[] = [
  { token: "{{lead.first_name}}", label: "First name" },
  { token: "{{lead.name}}", label: "Full name" },
  { token: "{{lead.company}}", label: "Company" },
  { token: "{{lead.email}}", label: "Recipient email" },
  { token: "{{lead.status}}", label: "Status" },
  { token: "{{lead.slug}}", label: "Lead code" },
  { token: "{{owner.name}}", label: "Owner name" },
  { token: "{{today}}", label: "Today (YYYY-MM-DD)" },
];

const DEFAULT_HTML_BODY = `<p>Hi {{lead.first_name}},</p>
<p>Great connecting with you. I wanted to follow up on {{lead.company}} regarding our conversation.</p>
<p>Best,<br/>{{owner.name}}<br/>Branta Tech</p>`;

const DEFAULT_TEXT_BODY = `Hi {{lead.first_name}},

Great connecting with you. I wanted to follow up on {{lead.company}} regarding our conversation.

Best,
{{owner.name}}
Branta Tech`;

function ResendLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="6" fill="#000" />
      <path
        d="M10 22V10h6.4c2.6 0 4.4 1.5 4.4 3.9 0 1.7-.9 3-2.4 3.5L22 22h-3l-2.9-4.3H12.7V22H10zm2.7-6.5h3.4c1.2 0 2-.7 2-1.8s-.8-1.8-2-1.8h-3.4v3.6z"
        fill="#fff"
      />
    </svg>
  );
}

function BrevoLogo({ className }: { className?: string }) {
  // Brevo brand mark (formerly Sendinblue) — stylised "b" on the brand indigo.
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="6" fill="#0B996E" />
      <path
        d="M9 22V10h5.7c2.5 0 4.1 1.2 4.1 3 0 1.1-.7 2-1.8 2.4 1.6.3 2.6 1.4 2.6 2.9 0 2.2-1.8 3.7-4.5 3.7H9zm2.6-7.2h2.7c1.1 0 1.9-.6 1.9-1.5s-.8-1.4-1.9-1.4h-2.7v2.9zm0 5.1h3c1.3 0 2.1-.6 2.1-1.7s-.8-1.6-2.1-1.6h-3v3.3z"
        fill="#fff"
      />
    </svg>
  );
}

function ResendChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-white px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-foreground">
      <ResendLogo className="size-3" />
      resend
    </span>
  );
}

function BrevoChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-white px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-foreground">
      <BrevoLogo className="size-3" />
      brevo
    </span>
  );
}

// Priority for choosing which webhook event "wins" as the displayed status.
// Higher wins — bounce/complaint/failure trumps opened/clicked/delivered.
const EVENT_PRIORITY: Record<string, number> = {
  scheduled: 1,
  sent: 2,
  delivery_delayed: 3,
  delivered: 4,
  opened: 5,
  clicked: 6,
  received: 7,
  suppressed: 8,
  complained: 9,
  bounced: 10,
  failed: 11,
};
const EVENT_STYLE: Record<string, string> = {
  scheduled: "bg-slate-50 text-slate-700",
  sent: "bg-emerald-50 text-emerald-700",
  delivered: "bg-emerald-50 text-emerald-700",
  delivery_delayed: "bg-amber-50 text-amber-700",
  opened: "bg-sky-50 text-sky-700",
  clicked: "bg-indigo-50 text-indigo-700",
  received: "bg-sky-50 text-sky-700",
  suppressed: "bg-zinc-100 text-zinc-700",
  complained: "bg-red-50 text-red-700",
  bounced: "bg-red-50 text-red-700",
  failed: "bg-red-50 text-red-700",
};

function fmtWhen(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function ProviderStatusChip({
  provider,
  events,
}: {
  provider: "resend" | "brevo";
  events: { timestamp: string; event_type: string }[];
}) {
  const latest = events.length
    ? [...events].sort(
        (a, b) =>
          (EVENT_PRIORITY[b.event_type] ?? 0) -
          (EVENT_PRIORITY[a.event_type] ?? 0),
      )[0]
    : null;
  const label = latest?.event_type ?? "sent";
  const style = EVENT_STYLE[label] ?? "bg-emerald-50 text-emerald-700";
  const Logo = provider === "brevo" ? BrevoLogo : ResendLogo;
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex cursor-default items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
              style,
            )}
          >
            <Logo className="size-2.5" />
            {label.replace(/_/g, " ")}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs bg-foreground text-background">
          {events.length === 0 ? (
            <div className="text-[11px]">
              Sent via {provider} — awaiting webhook events.
            </div>
          ) : (
            <ul className="grid gap-0.5 text-[11px]">
              {[...events]
                .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
                .map((ev, i) => (
                  <li key={`${ev.timestamp}-${i}`} className="flex gap-2">
                    <span className="font-mono uppercase tracking-wider">
                      {ev.event_type.replace(/_/g, " ")}
                    </span>
                    <span className="font-mono opacity-80">
                      {fmtWhen(ev.timestamp)}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function EmailsTab({ lead }: { lead: LeadRow }) {
  const listFn = useServerFn(listLeadEmails);
  const sendFn = useServerFn(sendLeadEmail);
  const drainFn = useServerFn(drainEmailQueue);
  const retryFn = useServerFn(retryFailedEmail);
  const listContactsFn = useServerFn(listLeadContacts);
  const qc = useQueryClient();

  const retryM = useMutation({
    mutationFn: (v: { id: string; provider?: "resend" | "brevo" }) =>
      retryFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(
        v.provider ? `Requeued via ${v.provider}` : "Requeued",
      );
      qc.invalidateQueries({ queryKey: ["lead-emails", lead.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Retry failed"),
  });

  const emails = useQuery({
    queryKey: ["lead-emails", lead.id],
    queryFn: () => listFn({ data: { leadId: lead.id } }),
    staleTime: 10_000,
  });
  const contacts = useQuery({
    queryKey: ["lead-contacts", lead.id],
    queryFn: () => listContactsFn({ data: { leadId: lead.id } }),
    staleTime: 30_000,
  });

  const resendEventsFn = useServerFn(listResendEventsForLead);
  const events = useQuery({
    queryKey: ["lead-resend-events", lead.id],
    queryFn: () => resendEventsFn({ data: { leadId: lead.id } }),
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
  const brevoEventsFn = useServerFn(listBrevoEventsForLead);
  const brevoEvents = useQuery({
    queryKey: ["lead-brevo-events", lead.id],
    queryFn: () => brevoEventsFn({ data: { leadId: lead.id } }),
    refetchInterval: 5_000,
    staleTime: 3_000,
  });

  // Realtime: any change to this lead's emails invalidates the thread.
  useEffect(() => {
    const ch = supabase
      .channel(`lead-emails-${lead.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lead_emails", filter: `lead_id=eq.${lead.id}` },
        () => qc.invalidateQueries({ queryKey: ["lead-emails", lead.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [lead.id, qc]);

  // Drain pump: whenever we have queued rows visible, poll drain until empty.
  const hasQueue = (emails.data ?? []).some(
    (e) => e.status === "queued" || e.status === "sending",
  );
  useEffect(() => {
    if (!hasQueue) return;
    let cancelled = false;
    const tick = async () => {
      try {
        await drainFn();
      } catch {
        /* silent — realtime will retry on next status flip */
      }
      if (!cancelled) qc.invalidateQueries({ queryKey: ["lead-emails", lead.id] });
    };
    const iv = setInterval(tick, 3000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [hasQueue, drainFn, qc, lead.id]);


  const [contentType, setContentType] = useState<"html" | "text">("html");
  const [provider, setProvider] = useState<"resend" | "brevo">("resend");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(DEFAULT_HTML_BODY);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Focus tracking so variable chips insert into the last-focused field.
  const subjectRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  // When lead contacts load / change, preselect the primary one.
  useEffect(() => {
    if (!contacts.data) return;
    if (selectedIds.length > 0) return;
    const primary = contacts.data.find((c) => c.is_primary) ?? contacts.data[0];
    if (primary) setSelectedIds([primary.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts.data?.length]);

  useEffect(() => {
    setBody(contentType === "html" ? DEFAULT_HTML_BODY : DEFAULT_TEXT_BODY);
  }, [contentType]);

  const selectedEmails = (contacts.data ?? [])
    .filter((c) => selectedIds.includes(c.id))
    .map((c) => c.email);

  function insertToken(token: string) {
    if (activeField === "subject") {
      const el = subjectRef.current;
      if (!el) {
        setSubject((s) => s + token);
        return;
      }
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      const next = subject.slice(0, start) + token + subject.slice(end);
      setSubject(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
    } else {
      const el = bodyRef.current;
      if (!el) {
        setBody((b) => b + token);
        return;
      }
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? body.length;
      const next = body.slice(0, start) + token + body.slice(end);
      setBody(next);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
    }
  }

  // Client-side preview substitution (mirror of server-side renderVariables).
  const previewVars: Record<string, string | null> = {
    "lead.name": lead.name,
    "lead.first_name": (lead.name || "").split(/\s+/)[0] || null,
    "lead.company": lead.company,
    "lead.email": selectedEmails[0] ?? lead.email ?? "recipient@example.com",
    "lead.status": lead.status,
    "lead.slug": lead.slug ?? lead.lead_code,
    "owner.name": null,
    today: new Date().toISOString().slice(0, 10),
  };
  const previewSubject = renderVariables(subject || "(no subject)", previewVars);
  const previewBodyRendered = renderVariables(body, previewVars);

  const sendM = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          leadId: lead.id,
          to: selectedEmails,
          cc: [],
          subject: subject.trim(),
          body: body.trim(),
          contentType,
          provider,
        },
      }),
    onSuccess: (r) => {
      const queued = r.queued - r.processing;
      const parts: string[] = [];
      if (r.sent > 0) parts.push(`${r.sent} sent`);
      if (r.failed > 0) parts.push(`${r.failed} failed`);
      if (queued > 0) parts.push(`${queued} in queue`);
      const msg = parts.join(" · ") || `${r.queued} queued`;
      if (r.failed > 0) toast.warning(msg);
      else toast.success(msg);
      setSubject("");
      setBody(contentType === "html" ? DEFAULT_HTML_BODY : DEFAULT_TEXT_BODY);
      qc.invalidateQueries({ queryKey: ["lead-emails", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads", "activities", lead.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Send failed"),
  });

  


  const canSend =
    !sendM.isPending &&
    selectedEmails.length > 0 &&
    subject.trim().length > 0 &&
    body.trim().length > 0;

  return (
    <div className="grid gap-4">
      <section className="rounded-sm border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Compose via {provider === "resend" ? <ResendChip /> : <BrevoChip />}
          </span>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-sm border border-border bg-muted p-0.5">
              {(["resend", "brevo"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
                    provider === p
                      ? "bg-white text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p === "resend" ? (
                    <ResendLogo className="size-3" />
                  ) : (
                    <BrevoLogo className="size-3" />
                  )}
                  {p}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-sm border border-border bg-muted p-0.5">
              {(["html", "text"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setContentType(t)}
                  className={cn(
                    "rounded-sm px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
                    contentType === t
                      ? "bg-white text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t === "html" ? "HTML" : "Plain"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-3">
          {/* Recipients */}
          <div className="grid gap-1.5">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Recipients ({selectedEmails.length} selected)
            </div>
            {contacts.isLoading ? (
              <div className="text-[12px] text-muted-foreground">Loading contacts…</div>
            ) : (contacts.data ?? []).length === 0 ? (
              <div className="rounded-sm border border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground">
                No contacts on this lead. Add one in Overview → Email.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {(contacts.data ?? []).map((c: LeadContactRow) => {
                  const active = selectedIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-2 rounded-sm border px-2 py-1 text-[12px] transition-colors",
                        active
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border bg-white text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Checkbox
                        checked={active}
                        onCheckedChange={(v) => {
                          setSelectedIds((prev) =>
                            v
                              ? Array.from(new Set([...prev, c.id]))
                              : prev.filter((id) => id !== c.id),
                          );
                        }}
                        className="size-3.5"
                      />
                      <span className="font-mono text-[11.5px]">{c.email}</span>
                      {c.is_primary && (
                        <span className="rounded-sm bg-muted px-1 py-[1px] text-[9.5px] uppercase tracking-wider text-muted-foreground">
                          primary
                        </span>
                      )}
                      {c.label && (
                        <span className="text-[10.5px] text-muted-foreground">
                          · {c.label}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Variables */}
          <div className="grid gap-1.5">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Personalization — inserts into {activeField}
            </div>
            <div className="flex flex-wrap gap-1">
              {EMAIL_VARIABLES.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertToken(v.token)}
                  title={v.label}
                  className="rounded-sm border border-border bg-white px-1.5 py-0.5 font-mono text-[10.5px] text-foreground hover:border-primary hover:bg-primary/5"
                >
                  {v.token}
                </button>
              ))}
            </div>
          </div>

          <Input
            ref={subjectRef}
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onFocus={() => setActiveField("subject")}
            className="h-9 rounded-sm text-[12.5px]"
          />
          <Textarea
            ref={bodyRef}
            placeholder={contentType === "html" ? "<p>Hi {{lead.first_name}}…</p>" : "Write your message…"}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => setActiveField("body")}
            className={cn(
              "min-h-[200px] rounded-sm text-[12.5px]",
              contentType === "html" && "font-mono text-[12px]",
            )}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-muted-foreground">
              From <span className="font-mono">hello@brantatech.com</span>
              {selectedEmails.length > 0 && (
                <>
                  {" "}
                  → to{" "}
                  <span className="font-mono text-foreground">
                    {selectedEmails.join(", ")}
                  </span>
                </>
              )}
            </div>
            <div className="flex gap-2">
              {contentType === "html" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-sm text-[12px]"
                  disabled={!body.trim()}
                  onClick={() => setPreviewOpen(true)}
                >
                  <Eye className="mr-1.5 size-3.5" /> Preview
                </Button>
              )}
              <Button
                size="sm"
                className="h-8 rounded-sm bg-primary text-[12px] text-primary-foreground hover:bg-brand-700"
                disabled={!canSend}
                onClick={() => sendM.mutate()}
              >
                {sendM.isPending ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1.5 size-3.5" />
                )}
                Send {selectedEmails.length > 1 ? `(${selectedEmails.length})` : ""}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-sm border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Thread ({emails.data?.length ?? 0})
        </div>
        <ul className="divide-y divide-border">
          {emails.isLoading && (
            <li className="p-3 text-[12px] text-muted-foreground">Loading…</li>
          )}
          {emails.data?.length === 0 && !emails.isLoading && (
            <li className="p-3 text-[12px] text-muted-foreground">No emails yet.</li>
          )}
          {emails.data?.map((e: LeadEmailRow) => (
            <li key={e.id} className="grid gap-1 p-3">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span
                  className={cn(
                    "rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                    e.direction === "inbound" ? "bg-blue-50 text-blue-700" : "bg-muted",
                  )}
                >
                  {e.direction}
                </span>
                {e.provider === "resend" ? (
                  <ResendChip />
                ) : e.provider === "brevo" ? (
                  <BrevoChip />
                ) : (
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">
                    {e.provider}
                  </span>
                )}
                {e.status === "queued" && (
                  <span className="rounded-sm bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-700">
                    in queue
                  </span>
                )}
                {e.status === "sending" && (
                  <span className="rounded-sm bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-blue-700">
                    sending…
                  </span>
                )}
                {e.status === "failed" && (
                  <span className="rounded-sm bg-red-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-red-700">
                    failed
                  </span>
                )}
                {e.provider === "resend" && e.status === "sent" && (
                  <ProviderStatusChip
                    provider="resend"
                    events={events.data?.[e.id] ?? []}
                  />
                )}
                {e.provider === "brevo" && e.status === "sent" && (
                  <ProviderStatusChip
                    provider="brevo"
                    events={brevoEvents.data?.[e.id] ?? []}
                  />
                )}
                {e.provider !== "resend" && e.provider !== "brevo" && e.status === "sent" && (
                  <span className="rounded-sm bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-700">
                    sent
                  </span>
                )}
                <span>·</span>
                <span className="font-mono">{relTime(e.sent_at ?? e.created_at)}</span>
              </div>
              <div className="text-[12.5px] font-medium">{e.subject || "(no subject)"}</div>
              <div className="text-[11.5px] text-muted-foreground">
                {e.from_email} → {e.to_emails.join(", ")}
              </div>
              {e.body_text && (
                <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] text-foreground/80">
                  {e.body_text}
                </div>
              )}
              {e.error_message && (
                <div className="text-[11px] text-red-600">{e.error_message}</div>
              )}
              {e.status === "failed" && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-sm text-[11.5px]"
                    disabled={
                      retryM.isPending &&
                      retryM.variables?.id === e.id &&
                      !retryM.variables?.provider
                    }
                    onClick={() => retryM.mutate({ id: e.id })}
                  >
                    {retryM.isPending &&
                    retryM.variables?.id === e.id &&
                    !retryM.variables?.provider ? (
                      <Loader2 className="mr-1.5 size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1.5 size-3" />
                    )}
                    Retry send
                  </Button>
                  {e.provider === "resend" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-sm text-[11.5px]"
                      disabled={
                        retryM.isPending &&
                        retryM.variables?.id === e.id &&
                        retryM.variables?.provider === "brevo"
                      }
                      onClick={() =>
                        retryM.mutate({ id: e.id, provider: "brevo" })
                      }
                    >
                      {retryM.isPending &&
                      retryM.variables?.id === e.id &&
                      retryM.variables?.provider === "brevo" ? (
                        <Loader2 className="mr-1.5 size-3 animate-spin" />
                      ) : (
                        <BrevoLogo className="mr-1.5 size-3" />
                      )}
                      Retry via Brevo
                    </Button>
                  )}
                  {e.provider === "brevo" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-sm text-[11.5px]"
                      disabled={
                        retryM.isPending &&
                        retryM.variables?.id === e.id &&
                        retryM.variables?.provider === "resend"
                      }
                      onClick={() =>
                        retryM.mutate({ id: e.id, provider: "resend" })
                      }
                    >
                      {retryM.isPending &&
                      retryM.variables?.id === e.id &&
                      retryM.variables?.provider === "resend" ? (
                        <Loader2 className="mr-1.5 size-3 animate-spin" />
                      ) : (
                        <ResendLogo className="mr-1.5 size-3" />
                      )}
                      Retry via Resend
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-[14px]">Email preview</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <div className="rounded-sm border border-border bg-muted/50 px-3 py-2 text-[11.5px]">
              <div>
                <span className="text-muted-foreground">From</span>{" "}
                <span className="font-mono">Branta Tech &lt;hello@brantatech.com&gt;</span>
              </div>
              <div>
                <span className="text-muted-foreground">To</span>{" "}
                <span className="font-mono">
                  {selectedEmails.length > 0
                    ? selectedEmails.join(", ")
                    : "(no recipients selected)"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Subject</span>{" "}
                <span className="font-medium">{previewSubject}</span>
              </div>
            </div>
            <iframe
              title="email-preview"
              sandbox=""
              className="h-[60vh] w-full rounded-sm border border-border bg-white"
              srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;font:14px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111}</style></head><body>${previewBodyRendered}</body></html>`}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}



// ---------- Meetings tab ----------
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function MeetingsTab({ lead }: { lead: LeadRow }) {
  const listFn = useServerFn(listLeadMeetings);
  const schedFn = useServerFn(scheduleLeadMeeting);
  const cancelFn = useServerFn(cancelLeadMeeting);
  const qc = useQueryClient();
  const meetings = useQuery({
    queryKey: ["lead-meetings", lead.id],
    queryFn: () => listFn({ data: { leadId: lead.id } }),
    staleTime: 10_000,
  });

  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const in1h30 = new Date(now.getTime() + 90 * 60 * 1000);
  const [title, setTitle] = useState(`Intro call — ${lead.company || lead.name}`);
  const [startsAt, setStartsAt] = useState(toLocalInput(in1h));
  const [endsAt, setEndsAt] = useState(toLocalInput(in1h30));
  const [attendees, setAttendees] = useState(lead.email ?? "");
  const [description, setDescription] = useState("");

  useEffect(() => {
    setTitle(`Intro call — ${lead.company || lead.name}`);
    setAttendees(lead.email ?? "");
  }, [lead.id, lead.name, lead.company, lead.email]);

  const schedM = useMutation({
    mutationFn: () =>
      schedFn({
        data: {
          leadId: lead.id,
          title: title.trim(),
          description: description.trim() || null,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          attendees: attendees
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: () => {
      toast.success("Meeting scheduled with Meet link");
      qc.invalidateQueries({ queryKey: ["lead-meetings", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["leads", "activities", lead.id] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Schedule failed"),
  });
  const cancelM = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Meeting cancelled");
      qc.invalidateQueries({ queryKey: ["lead-meetings", lead.id] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Cancel failed"),
  });

  return (
    <div className="grid gap-4">
      <section className="rounded-sm border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Schedule meeting
        </div>
        <div className="grid grid-cols-2 gap-3 p-3">
          <Field label="Title" className="col-span-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9 rounded-sm text-[12.5px]"
            />
          </Field>
          <Field label="Starts">
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="h-9 rounded-sm font-mono text-[12.5px]"
            />
          </Field>
          <Field label="Ends">
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="h-9 rounded-sm font-mono text-[12.5px]"
            />
          </Field>
          <Field label="Attendees (comma-separated)" className="col-span-2">
            <Input
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              className="h-9 rounded-sm text-[12.5px]"
            />
          </Field>
          <Field label="Description" className="col-span-2">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[70px] rounded-sm text-[12.5px]"
            />
          </Field>
        </div>
        <div className="flex justify-end border-t border-border px-3 py-2">
          <Button
            size="sm"
            className="h-8 rounded-sm bg-primary text-[12px] text-primary-foreground hover:bg-brand-700"
            disabled={schedM.isPending || !title.trim()}
            onClick={() => schedM.mutate()}
          >
            {schedM.isPending ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <CalendarPlus className="mr-1.5 size-3.5" />
            )}
            Create with Google Meet
          </Button>
        </div>
      </section>

      <section className="rounded-sm border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Scheduled ({meetings.data?.length ?? 0})
        </div>
        <ul className="divide-y divide-border">
          {meetings.isLoading && (
            <li className="p-3 text-[12px] text-muted-foreground">Loading…</li>
          )}
          {meetings.data?.length === 0 && !meetings.isLoading && (
            <li className="p-3 text-[12px] text-muted-foreground">No meetings.</li>
          )}
          {meetings.data?.map((m: LeadMeetingRow) => (
            <li key={m.id} className="grid gap-1 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12.5px] font-medium">{m.title}</div>
                <span
                  className={cn(
                    "rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                    m.status === "scheduled"
                      ? "bg-brand-50 text-brand-700"
                      : m.status === "cancelled"
                        ? "bg-muted text-muted-foreground line-through"
                        : "bg-emerald-50 text-emerald-700",
                  )}
                >
                  {m.status}
                </span>
              </div>
              <div className="font-mono text-[11.5px] text-muted-foreground">
                {new Date(m.starts_at).toLocaleString()} →{" "}
                {new Date(m.ends_at).toLocaleTimeString()}
              </div>
              <div className="flex items-center gap-2">
                {m.meeting_link && (
                  <a
                    href={m.meeting_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
                  >
                    <Video className="size-3.5" /> Join Meet
                  </a>
                )}
                {m.status === "scheduled" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-sm text-[11.5px] text-red-600 hover:bg-red-50"
                    onClick={() => cancelM.mutate(m.id)}
                    disabled={cancelM.isPending}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ---------- Documents tab ----------
function DocumentsTab({ lead }: { lead: LeadRow }) {
  const listFn = useServerFn(listLeadDocs);
  const genFn = useServerFn(generateLeadDoc);
  const delFn = useServerFn(deleteLeadDoc);
  const qc = useQueryClient();
  const docs = useQuery({
    queryKey: ["lead-docs", lead.id],
    queryFn: () => listFn({ data: { leadId: lead.id } }),
    staleTime: 10_000,
  });
  const genM = useMutation({
    mutationFn: (kind: "proposal" | "contract" | "nda") =>
      genFn({ data: { leadId: lead.id, templateKind: kind } }),
    onSuccess: (row) => {
      toast.success(`Created ${row.template_kind}`);
      qc.invalidateQueries({ queryKey: ["lead-docs", lead.id] });
      window.open(row.doc_url, "_blank");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Generation failed"),
  });
  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Removed from list");
      qc.invalidateQueries({ queryKey: ["lead-docs", lead.id] });
    },
  });

  return (
    <div className="grid gap-4">
      <section className="rounded-sm border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Generate document
        </div>
        <div className="grid grid-cols-3 gap-2 p-3">
          {(["proposal", "contract", "nda"] as const).map((k) => (
            <Button
              key={k}
              variant="outline"
              size="sm"
              className="h-9 rounded-sm text-[12px] capitalize"
              disabled={genM.isPending}
              onClick={() => genM.mutate(k)}
            >
              {genM.isPending && genM.variables === k ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <FileText className="mr-1.5 size-3.5" />
              )}
              {k}
            </Button>
          ))}
        </div>
      </section>

      <section className="rounded-sm border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Documents ({docs.data?.length ?? 0})
        </div>
        <ul className="divide-y divide-border">
          {docs.isLoading && (
            <li className="p-3 text-[12px] text-muted-foreground">Loading…</li>
          )}
          {docs.data?.length === 0 && !docs.isLoading && (
            <li className="p-3 text-[12px] text-muted-foreground">
              No documents yet.
            </li>
          )}
          {docs.data?.map((d: LeadDocumentRow) => (
            <li key={d.id} className="grid gap-1 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-medium">
                    {d.title}
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    {d.template_kind} · {relTime(d.created_at)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={d.doc_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-7 items-center gap-1 rounded-sm border border-border px-2 text-[11.5px] hover:bg-muted"
                  >
                    <ExternalLink className="size-3.5" /> Open
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 rounded-sm p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      navigator.clipboard.writeText(d.doc_url);
                      toast.success("Link copied");
                    }}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 rounded-sm p-0 text-red-600 hover:bg-red-50"
                    onClick={() => delM.mutate(d.id)}
                    disabled={delM.isPending}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
