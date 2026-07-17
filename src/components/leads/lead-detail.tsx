// Full-page Lead detail with Overview / Emails / Meetings / Docs tabs.
// Extracted from the former drawer so it can be mounted at /app/leads/$slug.
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  listLeadEmails,
  pullGmailForLead,
  renderVariables,
  sendLeadEmail,
  type LeadEmailRow,
} from "@/lib/lead-email.functions";
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
              <Field label="Value (USD)">
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
            <div className="border-b border-border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Activity
            </div>
            <div className="grid gap-2 p-3">
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
            <ul className="divide-y divide-border border-t border-border">
              {activities.isLoading && (
                <li className="p-3 text-[12px] text-muted-foreground">
                  Loading activity…
                </li>
              )}
              {activities.data?.length === 0 && !activities.isLoading && (
                <li className="p-3 text-[12px] text-muted-foreground">
                  No activity yet.
                </li>
              )}
              {activities.data?.map((a) => (
                <li key={a.id} className="grid gap-1 p-3">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">
                      {a.kind}
                    </span>
                    <span>{a.actor_name ?? "System"}</span>
                    <span>·</span>
                    <span className="font-mono">{relTime(a.created_at)}</span>
                  </div>
                  {a.body && (
                    <div className="whitespace-pre-wrap text-[12.5px] text-foreground">
                      {a.body}
                    </div>
                  )}
                </li>
              ))}
            </ul>
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

// ---------- Emails tab ----------
function EmailsTab({ lead }: { lead: LeadRow }) {
  const listFn = useServerFn(listLeadEmails);
  const sendFn = useServerFn(sendLeadEmail);
  const pullFn = useServerFn(pullGmailForLead);
  const qc = useQueryClient();
  const emails = useQuery({
    queryKey: ["lead-emails", lead.id],
    queryFn: () => listFn({ data: { leadId: lead.id } }),
    staleTime: 10_000,
  });
  const [provider, setProvider] = useState<"gmail" | "resend">("gmail");
  const [to, setTo] = useState(lead.email ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  useEffect(() => {
    setTo(lead.email ?? "");
  }, [lead.id, lead.email]);

  const sendM = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          leadId: lead.id,
          provider,
          to: to.trim(),
          cc: [],
          subject: subject.trim(),
          body: body.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Email sent");
      setSubject("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["lead-emails", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads", "activities", lead.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Send failed"),
  });
  const pullM = useMutation({
    mutationFn: () => pullFn({ data: { leadId: lead.id, email: to.trim() } }),
    onSuccess: (r) => {
      toast.success(`Pulled ${r.pulled} messages`);
      qc.invalidateQueries({ queryKey: ["lead-emails", lead.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Pull failed"),
  });

  return (
    <div className="grid gap-4">
      <section className="rounded-sm border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Compose
          </span>
          <Select
            value={provider}
            onValueChange={(v) => setProvider(v as "gmail" | "resend")}
          >
            <SelectTrigger className="h-7 w-32 rounded-sm text-[11.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gmail">Gmail (thread)</SelectItem>
              <SelectItem value="resend">Resend (branded)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 p-3">
          <Input
            placeholder="Recipient email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-sm text-[12.5px]"
          />
          <Input
            placeholder="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-9 rounded-sm text-[12.5px]"
          />
          <Textarea
            placeholder="Write your message… (HTML supported)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[140px] rounded-sm text-[12.5px]"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-sm text-[12px]"
              disabled={!to.trim() || pullM.isPending}
              onClick={() => pullM.mutate()}
            >
              {pullM.isPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 size-3.5" />
              )}
              Sync Gmail
            </Button>
            <Button
              size="sm"
              className="h-8 rounded-sm bg-primary text-[12px] text-primary-foreground hover:bg-brand-700"
              disabled={
                sendM.isPending || !to.trim() || !subject.trim() || !body.trim()
              }
              onClick={() => sendM.mutate()}
            >
              {sendM.isPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 size-3.5" />
              )}
              Send
            </Button>
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
            <li className="p-3 text-[12px] text-muted-foreground">
              No emails yet.
            </li>
          )}
          {emails.data?.map((e: LeadEmailRow) => (
            <li key={e.id} className="grid gap-1 p-3">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span
                  className={cn(
                    "rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                    e.direction === "inbound"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-muted",
                  )}
                >
                  {e.direction}
                </span>
                <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">
                  {e.provider}
                </span>
                {e.status === "failed" && (
                  <span className="rounded-sm bg-red-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-red-700">
                    failed
                  </span>
                )}
                <span>·</span>
                <span className="font-mono">
                  {relTime(e.sent_at ?? e.created_at)}
                </span>
              </div>
              <div className="text-[12.5px] font-medium">
                {e.subject || "(no subject)"}
              </div>
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
            </li>
          ))}
        </ul>
      </section>
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
