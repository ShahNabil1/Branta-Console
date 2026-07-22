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
  Phone as PhoneIcon,
  Info,
  Pencil,
  PenSquare,
  ChevronDown,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
  addLeadContact,
  checkLeadDuplicates,
  deleteLead,
  deleteLeadContact,
  listLeadActivities,
  listLeadContacts,
  setPrimaryLeadContact,
  updateLead,
  updateLeadContact,
  type DupConflict,
  type LeadContactRow,
  type LeadRow,
  type LeadStatusDB,
} from "@/lib/leads.functions";
import { getMyPermissions } from "@/lib/permissions.functions";

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
  checkMeetingConflicts,
  listLeadMeetings,
  rescheduleLeadMeeting,
  scheduleLeadMeeting,
  syncMeetingRsvp,
  type LeadMeetingRow,
  type RsvpStatus,
} from "@/lib/lead-meetings.functions";

import {
  deleteLeadDoc,
  generateLeadDoc,
  listLeadDocs,
  type LeadDocumentRow,
} from "@/lib/lead-docs.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { SocialLinksSection } from "@/components/leads/social-links-section";
import { ActivityLinkPreview } from "@/components/leads/activity-link-preview";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye } from "lucide-react";
import {
  listLeadServiceOptions,
  listLeadSourceOptions,
  listLeadStatusOptions,
  SERVICE_FALLBACK,
  SOURCE_FALLBACK,
  STATUS_FALLBACK,
  statusColorVar,
  statusLabel,
  type LeadServiceOption,
  type LeadSourceOption,
  type LeadStatusOption,
} from "@/lib/lead-options.functions";

function StatusBadge({
  status,
  options,
}: {
  status: LeadStatusDB;
  options: LeadStatusOption[];
}) {
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-foreground">
      <span
        className="size-1.5 rounded-full"
        style={{ background: `var(${statusColorVar(status, options)})` }}
      />
      {statusLabel(status, options)}
    </span>
  );
}

// Inline WhatsApp logo (green) for phone action button.
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path
        fill="#25D366"
        d="M16 3C8.82 3 3 8.82 3 16c0 2.29.6 4.52 1.74 6.49L3 29l6.7-1.72A12.94 12.94 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3zm7.5 18.36c-.32.9-1.85 1.72-2.58 1.83-.68.1-1.54.14-2.5-.16a12.85 12.85 0 0 1-2.28-.85c-4-1.74-6.6-5.77-6.8-6.04-.2-.27-1.62-2.15-1.62-4.1s1.02-2.9 1.38-3.3c.36-.4.78-.5 1.04-.5.26 0 .52 0 .74.01.24.01.56-.09.87.66.32.78 1.1 2.7 1.2 2.9.1.2.16.44.03.7-.13.27-.2.44-.4.68-.2.24-.42.53-.6.72-.2.2-.4.42-.17.82.23.4 1.02 1.68 2.2 2.72 1.51 1.33 2.78 1.75 3.18 1.95.4.2.63.17.86-.1.24-.27.99-1.15 1.25-1.55.26-.4.52-.33.87-.2.36.13 2.28 1.08 2.68 1.28.4.2.66.3.76.47.1.17.1 1-.22 1.9z"
      />
    </svg>
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
  hint,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: React.ReactNode;
}) {
  return (
    <label className={cn("space-y-1", className)}>
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        <span>{label}</span>
        {hint && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-3.5 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground focus:outline-none"
                  aria-label="What is this field?"
                  onClick={(e) => e.preventDefault()}
                >
                  <Info className="size-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[280px] text-[11.5px] leading-relaxed normal-case tracking-normal">
                {hint}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {children}
    </label>
  );
}

const CONTACT_LABEL_OPTIONS = [
  "work",
  "personal",
  "home",
  "mobile",
  "whatsapp",
  "other",
] as const;

function LabelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select
      value={value || "__none"}
      onValueChange={(v) => onChange(v === "__none" ? "" : v)}
    >
      <SelectTrigger className="h-9 w-[110px] shrink-0 rounded-sm text-[11.5px] capitalize">
        <SelectValue placeholder="Label" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none">— label —</SelectItem>
        {CONTACT_LABEL_OPTIONS.map((l) => (
          <SelectItem key={l} value={l} className="capitalize">
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EmailRow({
  label,
  value,
  onChange,
  tag,
  onTagChange,
  onCompose,
  className,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tag: string;
  onTagChange: (v: string) => void;
  onCompose: () => void;
  className?: string;
  error?: React.ReactNode;
}) {
  return (
    <Field label={label} className={className}>
      <div className="flex items-center gap-1.5">

        <Input
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-9 flex-1 rounded-sm text-[12.5px]",
            error && "border-red-500 focus-visible:ring-red-500",
          )}
          placeholder="name@company.com"
          aria-invalid={!!error}
        />
        <LabelSelect value={tag} onChange={onTagChange} />
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-sm"
                disabled={!value.trim()}
                onClick={onCompose}
                aria-label="Compose email"
              >
                <Mail className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Compose in Emails tab</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {error && (
        <p className="mt-1 text-[11.5px] font-medium text-red-600">{error}</p>
      )}
    </Field>
  );
}

function PhoneRow({
  label,
  value,
  onChange,
  tag,
  onTagChange,
  className,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tag: string;
  onTagChange: (v: string) => void;
  className?: string;
  error?: React.ReactNode;
}) {
  const digits = value.replace(/[^\d]/g, "");
  return (
    <Field label={label} className={className}>
      <div className="flex items-center gap-1.5">

        <Input
          type="tel"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-9 flex-1 rounded-sm text-[12.5px]",
            error && "border-red-500 focus-visible:ring-red-500",
          )}
          placeholder="+8801XXXXXXXXX"
          aria-invalid={!!error}
        />
        <LabelSelect value={tag} onChange={onTagChange} />
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={value ? `tel:${value.replace(/\s+/g, "")}` : undefined}
                aria-disabled={!value.trim()}
                className={cn(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-input bg-background text-foreground transition-colors hover:bg-muted",
                  !value.trim() && "pointer-events-none opacity-50",
                )}
                aria-label="Call this number"
              >
                <PhoneIcon className="size-3.5" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="top">Call</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={digits ? `https://wa.me/${digits}` : undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!digits}
                className={cn(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-input bg-background transition-colors hover:bg-muted",
                  !digits && "pointer-events-none opacity-50",
                )}
                aria-label="Open in WhatsApp"
              >
                <WhatsAppIcon className="size-4" />
              </a>
            </TooltipTrigger>
            <TooltipContent side="top">WhatsApp</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {error && (
        <p className="mt-1 text-[11.5px] font-medium text-red-600">{error}</p>
      )}
    </Field>
  );
}



/** Compact, bold read-only display for the Details grid when the section is locked. */
function CopyableText({
  value,
  className,
  title,
}: {
  value: string;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title ?? "Click to copy"}
      onClick={(e) => {
        e.preventDefault();
        void navigator.clipboard
          .writeText(value)
          .then(() => toast.success("Copied"))
          .catch(() => toast.error("Copy failed"));
      }}
      className={cn(
        "block max-w-full truncate text-left text-[13.5px] font-semibold text-foreground hover:text-primary",
        className,
      )}
    >
      {value}
    </button>
  );
}

function ReadField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className="min-h-[24px]">{children}</div>
    </div>
  );
}

function ReadOnlyDetails({
  form,
  sourceOptions,
  serviceOptions,
  leadId,
  onCompose,
}: {
  form: {
    name: string;
    role: string;
    company: string;
    email: string;
    email_label: string;
    alt_email: string;
    alt_email_label: string;
    phone: string;
    phone_label: string;
    alt_phone: string;
    alt_phone_label: string;
    source: string;
    source_other: string;
    service: string;
    service_other: string;
  };
  sourceOptions: LeadSourceOption[];
  serviceOptions: LeadServiceOption[];
  leadId: string;
  onCompose: () => void;
}) {
  const emptyDash = (
    <span className="text-[12.5px] text-muted-foreground/60">—</span>
  );
  const src = sourceOptions.find((s) => s.key === form.source);
  const svc = serviceOptions.find((s) => s.key === form.service);
  const sourceText = src
    ? src.requires_detail && form.source_other
      ? `${src.label} · ${form.source_other}`
      : src.label
    : "";
  const serviceText = svc
    ? svc.requires_detail && form.service_other
      ? `${svc.label} · ${form.service_other}`
      : svc.label
    : "";

  const emailBlock = (value: string, label: string) => {
    if (!value.trim()) return emptyDash;
    return (
      <div className="flex min-w-0 items-center gap-2">
        <a
          href={`mailto:${value}`}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm border border-border bg-background text-foreground hover:bg-muted"
          title="Send email"
          aria-label="Send email"
        >
          <Mail className="size-3" />
        </a>
        <div className="min-w-0 flex-1">
          <CopyableText value={value} />
          {label && (
            <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onCompose}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm border border-border bg-background text-foreground hover:bg-muted"
          title="Compose in Emails tab"
          aria-label="Compose email"
        >
          <PenSquare className="size-3" />
        </button>
      </div>
    );
  };

  const phoneBlock = (value: string, label: string) => {
    if (!value.trim()) return emptyDash;
    const digits = value.replace(/[^\d]/g, "");
    return (
      <div className="flex min-w-0 items-center gap-2">
        <a
          href={`tel:${value.replace(/\s+/g, "")}`}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm border border-border bg-background text-foreground hover:bg-muted"
          title="Call"
          aria-label="Call"
        >
          <PhoneIcon className="size-3" />
        </a>
        {digits && (
          <a
            href={`https://wa.me/${digits}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm border border-border bg-background hover:bg-muted"
            title="WhatsApp"
            aria-label="WhatsApp"
          >
            <WhatsAppIcon className="size-3.5" />
          </a>
        )}
        <div className="min-w-0 flex-1">
          <CopyableText value={value} />
          {label && (
            <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
          )}
        </div>
      </div>
    );
  };

  const hasAltEmail = !!form.alt_email.trim();
  const hasAltPhone = !!form.alt_phone.trim();

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
        <ReadField label="Name">
          {form.name.trim() ? (
            <CopyableText value={form.name} />
          ) : (
            emptyDash
          )}
        </ReadField>
        <ReadField label="Role">
          {form.role.trim() ? <CopyableText value={form.role} /> : emptyDash}
        </ReadField>
        <ReadField label="Company">
          {form.company.trim() ? (
            <CopyableText value={form.company} />
          ) : (
            emptyDash
          )}
        </ReadField>
        <ReadField label="Source">
          {sourceText ? (
            <span className="text-[13.5px] font-semibold text-foreground">
              {sourceText}
            </span>
          ) : (
            emptyDash
          )}
        </ReadField>
        <ReadField label="Service interest">
          {serviceText ? (
            <span className="text-[13.5px] font-semibold text-foreground">
              {serviceText}
            </span>
          ) : (
            emptyDash
          )}
        </ReadField>
        <div className="hidden md:block" />

        <ReadField label="Email">
          {emailBlock(form.email, form.email_label)}
        </ReadField>
        {hasAltEmail && (
          <ReadField label="Alternative email">
            {emailBlock(form.alt_email, form.alt_email_label)}
          </ReadField>
        )}
        <ReadField label="Phone">
          {phoneBlock(form.phone, form.phone_label)}
        </ReadField>
        {hasAltPhone && (
          <ReadField label="Alternative phone">
            {phoneBlock(form.alt_phone, form.alt_phone_label)}
          </ReadField>
        )}
      </div>

      <SocialLinksSection leadId={leadId} locked />
    </div>
  );
}


export function LeadDetail({
  lead,
  users,
  onDeleted,
  initialEdit = false,
}: {
  lead: LeadRow;
  users: { user_id: string; full_name: string | null; personal_gmail?: string | null }[];
  onDeleted?: () => void;
  initialEdit?: boolean;
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateLead);
  const del = useServerFn(deleteLead);
  const getMyPermsFn = useServerFn(getMyPermissions);
  const myPermsQ = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => getMyPermsFn(),
    staleTime: 60_000,
  });
  const canDeleteLead = !!myPermsQ.data?.lead_delete;
  const listAct = useServerFn(listLeadActivities);
  const addAct = useServerFn(addLeadActivity);

  const listStatusOpts = useServerFn(listLeadStatusOptions);
  const listSourceOpts = useServerFn(listLeadSourceOptions);
  const listServiceOpts = useServerFn(listLeadServiceOptions);
  const statusOptsQ = useQuery({
    queryKey: ["lead-status-options"],
    queryFn: () => listStatusOpts(),
    staleTime: 5 * 60_000,
    initialData: STATUS_FALLBACK,
  });
  const sourceOptsQ = useQuery({
    queryKey: ["lead-source-options"],
    queryFn: () => listSourceOpts(),
    staleTime: 5 * 60_000,
    initialData: SOURCE_FALLBACK,
  });
  const serviceOptsQ = useQuery({
    queryKey: ["lead-service-options"],
    queryFn: () => listServiceOpts(),
    staleTime: 5 * 60_000,
    initialData: SERVICE_FALLBACK,
  });
  const statusOptions: LeadStatusOption[] = statusOptsQ.data ?? STATUS_FALLBACK;
  const sourceOptions: LeadSourceOption[] = sourceOptsQ.data ?? SOURCE_FALLBACK;
  const serviceOptions: LeadServiceOption[] = serviceOptsQ.data ?? SERVICE_FALLBACK;


  const [tab, setTab] = useState<"overview" | "emails" | "meetings" | "docs">(
    "overview",
  );

  const [form, setForm] = useState({
    name: lead.name,
    role: lead.role ?? "",
    company: lead.company ?? "",
    email: lead.email ?? "",
    email_label: lead.email_label ?? "",
    alt_email: lead.alt_email ?? "",
    alt_email_label: lead.alt_email_label ?? "",
    phone: lead.phone ?? "",
    phone_label: lead.phone_label ?? "",
    alt_phone: lead.alt_phone ?? "",
    alt_phone_label: lead.alt_phone_label ?? "",
    contact_preference: lead.contact_preference ?? "",
    status: lead.status,
    source: lead.source ?? "",
    source_other: lead.source_other ?? "",
    service: lead.service ?? "",
    service_other: lead.service_other ?? "",
    owner_id: lead.owner_id ?? "",
    next_action: lead.next_action ?? "",
    notes: lead.notes ?? "",
  });
  // Optional note captured when status changes; cleared after save.
  const [statusChangeNote, setStatusChangeNote] = useState("");
  // Details section lock — read-only by default, unlocks on Edit click.
  const [editing, setEditing] = useState(initialEdit);
  const confirm = useConfirm();

  useEffect(() => {
    setForm({
      name: lead.name,
      role: lead.role ?? "",
      company: lead.company ?? "",
      email: lead.email ?? "",
      email_label: lead.email_label ?? "",
      alt_email: lead.alt_email ?? "",
      alt_email_label: lead.alt_email_label ?? "",
      phone: lead.phone ?? "",
      phone_label: lead.phone_label ?? "",
      alt_phone: lead.alt_phone ?? "",
      alt_phone_label: lead.alt_phone_label ?? "",
      contact_preference: lead.contact_preference ?? "",
      status: lead.status,
      source: lead.source ?? "",
      source_other: lead.source_other ?? "",
      service: lead.service ?? "",
      service_other: lead.service_other ?? "",
      owner_id: lead.owner_id ?? "",
      next_action: lead.next_action ?? "",
      notes: lead.notes ?? "",
    });
    setStatusChangeNote("");
  }, [lead.id, lead.status, lead.owner_id, lead.updated_at]);


  const activities = useQuery({
    queryKey: ["leads", "activities", lead.id],
    queryFn: () => listAct({ data: { leadId: lead.id } }),
    staleTime: 10_000,
  });

  const statusChanged = form.status !== lead.status;
  const activeSource = sourceOptions.find((s) => s.key === form.source);
  const sourceNeedsDetail = activeSource?.requires_detail ?? false;
  const activeService = serviceOptions.find((s) => s.key === form.service);
  const serviceNeedsDetail = activeService?.requires_detail ?? false;

  // ---- Inline duplicate check --------------------------------------------
  const checkDup = useServerFn(checkLeadDuplicates);
  const [dupConflicts, setDupConflicts] = useState<DupConflict[]>([]);
  useEffect(() => {
    if (!editing) {
      setDupConflicts([]);
      return;
    }
    const email = form.email.trim();
    const altEmail = form.alt_email.trim();
    const phone = form.phone.trim();
    const altPhone = form.alt_phone.trim();
    if (!email && !altEmail && !phone && !altPhone) {
      setDupConflicts([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await checkDup({
          data: {
            excludeLeadId: lead.id,
            email: email || null,
            alt_email: altEmail || null,
            phone: phone || null,
            alt_phone: altPhone || null,
          },
        });
        if (!cancelled) setDupConflicts(res);
      } catch {
        if (!cancelled) setDupConflicts([]);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    editing,
    lead.id,
    form.email,
    form.alt_email,
    form.phone,
    form.alt_phone,
    checkDup,
  ]);
  const dupByField = new Map(dupConflicts.map((c) => [c.field, c] as const));
  const hasDupBlocking = dupConflicts.length > 0;

  const renderDupMessage = (c: DupConflict | undefined): React.ReactNode => {
    if (!c) return null;
    const sourceLabel: Record<DupConflict["conflictSource"], string> = {
      "leads.email": "primary email",
      "leads.alt_email": "alternative email",
      "leads.phone": "primary phone",
      "leads.alt_phone": "alternative phone",
      "lead_contacts.email": "contact email",
      "lead_contacts.alt_email": "contact alt. email",
      "lead_contacts.phone": "contact phone",
      "lead_contacts.alt_phone": "contact alt. phone",
    };
    const fieldLabel =
      c.field === "email"
        ? "Email"
        : c.field === "alt_email"
        ? "Alternative email"
        : c.field === "phone"
        ? "Phone"
        : "Alternative phone";
    return (
      <>
        {fieldLabel} conflicts with lead{" "}
        <span className="font-semibold">{c.conflictSlug}</span> (
        {sourceLabel[c.conflictSource]}).
      </>
    );
  };



  const saveM = useMutation({
    mutationFn: () =>
      update({
        data: {
          id: lead.id,
          patch: {
            name: form.name.trim(),
            role: form.role.trim() || null,
            company: form.company.trim() || null,
            email: form.email.trim() || null,
            email_label: form.email_label.trim() || null,
            alt_email: form.alt_email.trim() || null,
            alt_email_label: form.alt_email_label.trim() || null,
            phone: form.phone.trim() || null,
            phone_label: form.phone_label.trim() || null,
            alt_phone: form.alt_phone.trim() || null,
            alt_phone_label: form.alt_phone_label.trim() || null,
            contact_preference: form.contact_preference.trim() || null,
            status: form.status,
            source: form.source.trim() || null,
            source_other: sourceNeedsDetail
              ? form.source_other.trim() || null
              : null,
            service: form.service.trim() || null,
            service_other: serviceNeedsDetail
              ? form.service_other.trim() || null
              : null,
            owner_id: form.owner_id || null,
            value_usd: null,
            currency: "BDT",
            next_action: form.next_action.trim() || null,
            notes: form.notes.trim() || null,
          },
          statusChangeNote:
            statusChanged && statusChangeNote.trim()
              ? statusChangeNote.trim()
              : undefined,
        },
      }),

    onSuccess: () => {
      toast.success("Lead updated");
      setStatusChangeNote("");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["leads", "activities", lead.id] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  // Dedicated quick-update for the header Status control.
  // Persists only status (+ optional note → Activity Logs), independent of form edits.
  const statusUpdateM = useMutation({
    mutationFn: () =>
      update({
        data: {
          id: lead.id,
          patch: { status: form.status },
          statusChangeNote: statusChangeNote.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Status updated");
      setStatusChangeNote("");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["leads", "activities", lead.id] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Status update failed"),
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
  const [visibleActivityCount, setVisibleActivityCount] = useState(5);
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
      <div className="flex flex-wrap items-start justify-between gap-4">
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
            <StatusBadge status={lead.status} options={statusOptions} />
          </div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">
            {lead.name}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {lead.company ?? "No company"}
          </p>
        </div>

        {/* Top-right: Status + Owner quick controls */}
        <div className="flex flex-col gap-2 sm:min-w-[360px]">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Status
              </div>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger className="h-9 rounded-sm text-[12.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-1.5 rounded-full"
                          style={{ background: `var(${s.color_var ?? "--color-status-contacted"})` }}
                        />
                        {s.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                ASSIGNED TO&nbsp;
              </div>
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
            </div>
          </div>
          {statusChanged && (
            <div className="space-y-2">
              <Textarea
                value={statusChangeNote}
                onChange={(e) => setStatusChangeNote(e.target.value)}
                placeholder={`Why moving to "${statusLabel(form.status, statusOptions)}"? (added to Activity Logs)`}
                className="min-h-[56px] rounded-sm text-[12px]"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={statusUpdateM.isPending}
                  onClick={() => statusUpdateM.mutate()}
                  className="h-8 rounded-sm bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {statusUpdateM.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      Updating…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-1.5 size-3.5" />
                      Update status
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        className="flex min-h-0 flex-1 flex-col"
      >
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
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Details
              </div>
              {!editing ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-sm text-[11.5px]"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="mr-1.5 size-3" />
                  Edit
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 rounded-sm text-[11.5px] text-muted-foreground"
                  onClick={() => {
                    // Reset form to lead's persisted values
                    setForm({
                      name: lead.name,
                      role: lead.role ?? "",
                      company: lead.company ?? "",
                      email: lead.email ?? "",
                      email_label: lead.email_label ?? "",
                      alt_email: lead.alt_email ?? "",
                      alt_email_label: lead.alt_email_label ?? "",
                      phone: lead.phone ?? "",
                      phone_label: lead.phone_label ?? "",
                      alt_phone: lead.alt_phone ?? "",
                      alt_phone_label: lead.alt_phone_label ?? "",
                      contact_preference: lead.contact_preference ?? "",
                      source: lead.source ?? "",
                      source_other: lead.source_other ?? "",
                      service: lead.service ?? "",
                      service_other: lead.service_other ?? "",
                      status: lead.status,
                      owner_id: lead.owner_id ?? "",
                      next_action: lead.next_action ?? "",
                      notes: lead.notes ?? "",
                    });
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
            {editing ? (
              <fieldset disabled={!editing} className="contents">
              <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-3">

                <Field label="Name">
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="h-9 rounded-sm text-[12.5px]"
                  />
                </Field>
                <Field label="Role">
                  <Input
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    placeholder="e.g. CTO, Marketing Manager"
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
                  <Select
                    value={form.source || "__unset"}
                    onValueChange={(v) => {
                      const next = v === "__unset" ? "" : v;
                      setForm((prev) => ({
                        ...prev,
                        source: next,
                        source_other:
                          next && sourceOptions.find((o) => o.key === next)?.requires_detail
                            ? prev.source_other
                            : "",
                      }));
                    }}
                  >
                    <SelectTrigger className="h-9 rounded-sm text-[12.5px]">
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset">— None —</SelectItem>
                      {sourceOptions.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {sourceNeedsDetail && (
                  <Field label={`${activeSource?.label ?? "Source"} details *`}>
                    <Input
                      value={form.source_other}
                      onChange={(e) =>
                        setForm({ ...form, source_other: e.target.value })
                      }
                      placeholder="Describe the source"
                      className="h-9 rounded-sm text-[12.5px]"
                    />
                  </Field>
                )}

                <Field
                  label="Service interest"
                  hint={
                    <>
                      <b>Which service is this lead considering?</b>
                      <br />
                      <span className="text-muted-foreground">
                        Pick the closest service; choose "Other" and describe it
                        when nothing fits. Super admin will manage this list.
                      </span>
                    </>
                  }
                >
                  <Select
                    value={form.service || "__unset"}
                    onValueChange={(v) => {
                      const next = v === "__unset" ? "" : v;
                      setForm((prev) => ({
                        ...prev,
                        service: next,
                        service_other:
                          next && serviceOptions.find((o) => o.key === next)?.requires_detail
                            ? prev.service_other
                            : "",
                      }));
                    }}
                  >
                    <SelectTrigger className="h-9 rounded-sm text-[12.5px]">
                      <SelectValue placeholder="Select service" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset">— None —</SelectItem>
                      {serviceOptions.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {serviceNeedsDetail && (
                  <Field
                    label={`${activeService?.label ?? "Service"} details *`}
                    className="col-span-2 md:col-span-2"
                  >
                    <Input
                      value={form.service_other}
                      onChange={(e) =>
                        setForm({ ...form, service_other: e.target.value })
                      }
                      placeholder="Which service does this lead want?"
                      className="h-9 rounded-sm text-[12.5px]"
                    />
                  </Field>
                )}

                <EmailRow
                  label="Email"
                  value={form.email}
                  onChange={(v) => setForm({ ...form, email: v })}
                  tag={form.email_label}
                  onTagChange={(v) => setForm({ ...form, email_label: v })}
                  onCompose={() => setTab("emails")}
                  error={renderDupMessage(dupByField.get("email"))}
                />
                <EmailRow
                  label="Alternative email"
                  value={form.alt_email}
                  onChange={(v) => setForm({ ...form, alt_email: v })}
                  tag={form.alt_email_label}
                  onTagChange={(v) => setForm({ ...form, alt_email_label: v })}
                  onCompose={() => setTab("emails")}
                  error={renderDupMessage(dupByField.get("alt_email"))}
                />
                <PhoneRow
                  label="Phone"
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                  tag={form.phone_label}
                  onTagChange={(v) => setForm({ ...form, phone_label: v })}
                  error={renderDupMessage(dupByField.get("phone"))}
                />
                <PhoneRow
                  label="Alternative phone"
                  value={form.alt_phone}
                  onChange={(v) => setForm({ ...form, alt_phone: v })}
                  tag={form.alt_phone_label}
                  onTagChange={(v) => setForm({ ...form, alt_phone_label: v })}
                  error={renderDupMessage(dupByField.get("alt_phone"))}
                />


                <div className="col-span-2 md:col-span-3">
                  <SocialLinksSection leadId={lead.id} locked={false} />
                </div>
              </div>
              </fieldset>
            ) : (
              <ReadOnlyDetails
                form={form}
                sourceOptions={sourceOptions}
                serviceOptions={serviceOptions}
                leadId={lead.id}
                onCompose={() => setTab("emails")}
              />
            )}

            {/* Next action + Notes — always editable, never locked */}
            <div className="grid grid-cols-1 gap-3 border-t border-border p-3">
              <Field
                label="Next action"
                hint={
                  <>
                    <b>একটি single reminder</b> — এই lead-এর জন্য পরের কাজ কী।
                    Leads list-এ visible থাকে, filter/sort করা যায়। কাজ শেষ হলে
                    overwrite করে নতুন action লিখো। History রাখে না।
                    <br />
                    <span className="text-muted-foreground">
                      Example: "Call Monday 3pm", "Send proposal", "Follow up
                      after demo"
                    </span>
                  </>
                }
              >
                <div className="relative">
                  <Input
                    value={form.next_action}
                    onChange={(e) =>
                      setForm({ ...form, next_action: e.target.value })
                    }
                    placeholder="What's the next step for this lead? (e.g. Call Monday 3pm, Send proposal)"
                    className="h-9 w-full rounded-sm pr-24 text-[12.5px]"
                  />
                  {(form.next_action ?? "") !== (lead.next_action ?? "") && (
                    <Button
                      size="sm"
                      className="absolute right-1 top-1/2 h-7 -translate-y-1/2 rounded-sm bg-primary px-2.5 text-[11.5px] font-semibold text-primary-foreground hover:bg-brand-700"
                      disabled={saveM.isPending}
                      onClick={() => saveM.mutate()}
                    >
                      {saveM.isPending ? (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      ) : (
                        <Save className="mr-1 size-3" />
                      )}
                      Update
                    </Button>
                  )}
                </div>
              </Field>
              <Field
                label="Notes (about this lead)"
                hint={
                  <>
                    <b>Permanent context</b> — এই lead সম্পর্কে সবসময় জানার
                    দরকার এমন তথ্য। একটাই field, overwrite হয়, history রাখে না।
                    Lead-এর "profile summary" হিসেবে ভাবো।
                    <br />
                    <span className="text-muted-foreground">
                      Example: "Prefers WhatsApp over email", "Budget ~50k BDT",
                      "Decision maker: CTO Rahim", "Referred by Karim"
                    </span>
                  </>
                }
              >
                <div className="relative">
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Permanent context about this lead — preferences, budget, decision-makers, background. Always visible at the top."
                    className="min-h-[80px] rounded-sm pb-10 text-[12.5px]"
                  />
                  {(form.notes ?? "") !== (lead.notes ?? "") && (
                    <Button
                      size="sm"
                      className="absolute bottom-2 right-2 h-7 rounded-sm bg-primary px-2.5 text-[11.5px] font-semibold text-primary-foreground hover:bg-brand-700"
                      disabled={saveM.isPending}
                      onClick={() => saveM.mutate()}
                    >
                      {saveM.isPending ? (
                        <Loader2 className="mr-1 size-3 animate-spin" />
                      ) : (
                        <Save className="mr-1 size-3" />
                      )}
                      Update
                    </Button>
                  )}
                </div>
              </Field>

            </div>
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              {canDeleteLead ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-sm text-[12px] text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={async () => {
                    const label = lead.slug ?? lead.lead_code ?? "this lead";
                    const ok = await confirm({
                      tone: "danger",
                      title: `Delete lead ${label}?`,
                      description:
                        "This permanently removes the lead and all its contacts, emails, meetings, notes, social links, and activity history. This action cannot be undone.",
                      confirmLabel: "Delete lead",
                      requireTypedText: label,
                    });
                    if (ok) delM.mutate();
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
              ) : (
                <span />
              )}
              {editing && (
                <Button
                  size="sm"
                  className="h-8 rounded-sm bg-primary text-[12px] text-primary-foreground hover:bg-brand-700"
                  disabled={
                    saveM.isPending ||
                    !form.name.trim() ||
                    (sourceNeedsDetail && !form.source_other.trim()) ||
                    (serviceNeedsDetail && !form.service_other.trim()) ||
                    hasDupBlocking
                  }
                  onClick={() => saveM.mutate()}
                >
                  {saveM.isPending ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 size-3.5" />
                  )}
                  Save changes
                </Button>
              )}
            </div>
          </section>

          <TeammatesSection lead={lead} />





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
              <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                <span>Add timeline entry</span>
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex size-3.5 items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground focus:outline-none"
                        aria-label="What is this field?"
                      >
                        <Info className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[280px] text-[11.5px] leading-relaxed normal-case tracking-normal">
                      <b>Time-stamped journal entry</b> — কী ঘটেছে সেটার log।
                      Append-only, প্রতিটা note আলাদা row হিসেবে save হয় সাথে
                      timestamp আর কে লিখেছে। Overwrite হয় না — audit trail।
                      <br />
                      <span className="text-muted-foreground">
                        Example: "Called at 3:24pm, no answer", "Sent revised
                        quote", "Client confirmed budget"
                      </span>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Log what just happened — call summary, meeting outcome, blocker, decision. Adds a new time-stamped entry below."
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
                <>
                  <ol className="relative px-3 py-3">
                    <span
                      className="pointer-events-none absolute bottom-3 left-[19px] top-3 w-px bg-border"
                      aria-hidden
                    />
                    {activities.data.slice(0, visibleActivityCount).map((a) => {
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
                          {(() => {
                            const m = a.meta as Record<string, unknown> | null | undefined;
                            const ev = m?.event as string | undefined;
                            const invSlug = m?.invoice_slug as string | undefined;
                            const custCode = m?.customer_code as string | undefined;
                            if (invSlug) {
                              return <ActivityLinkPreview kind="invoice" slug={invSlug} />;
                            }
                            if (ev === "customer_created" && custCode) {
                              return <ActivityLinkPreview kind="customer" code={custCode} />;
                            }
                            return null;
                          })()}
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
                  {activities.data.length > visibleActivityCount && (
                    <div className="flex items-center justify-center gap-2 border-t border-border px-3 py-2.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-sm text-[11.5px]"
                        onClick={() =>
                          setVisibleActivityCount((c) => c + 5)
                        }
                      >
                        See more
                        <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                          {Math.min(5, activities.data.length - visibleActivityCount)} of {activities.data.length - visibleActivityCount} left
                        </span>
                      </Button>
                      {visibleActivityCount > 5 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-sm text-[11.5px] text-muted-foreground"
                          onClick={() => setVisibleActivityCount(5)}
                        >
                          Collapse
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

        </TabsContent>

        <TabsContent value="emails" className="m-0 mt-4">
          <EmailsTab lead={lead} />
        </TabsContent>
        <TabsContent value="meetings" className="m-0 mt-4">
          <MeetingsTab lead={lead} users={users} />
        </TabsContent>
        <TabsContent value="docs" className="m-0 mt-4">
          <DocumentsTab lead={lead} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Team members / additional contacts ----------
const MAX_TEAMMATES = 10;
const EMPTY_CONTACT_DRAFT = {
  name: "",
  role: "",
  email: "",
  email_label: "",
  alt_email: "",
  alt_email_label: "",
  phone: "",
  phone_label: "",
  alt_phone: "",
  alt_phone_label: "",
  contact_preference: "",
};

function TeammatesSection({ lead }: { lead: LeadRow }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listLeadContacts);
  const addFn = useServerFn(addLeadContact);
  const delFn = useServerFn(deleteLeadContact);
  const primaryFn = useServerFn(setPrimaryLeadContact);
  const contacts = useQuery({
    queryKey: ["lead-contacts", lead.id],
    queryFn: () => listFn({ data: { leadId: lead.id } }),
    staleTime: 15_000,
  });
  // Teammates = every stored contact except the auto-created "primary" that
  // just mirrors the lead's own email (label "Primary", no name/role).
  const teammates = (contacts.data ?? []).filter(
    (c) =>
      !(
        c.is_primary &&
        !c.name &&
        !c.role &&
        (c.label === "Primary" || c.label === null)
      ),
  );

  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY_CONTACT_DRAFT });

  const addM = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          leadId: lead.id,
          name: draft.name.trim() || null,
          role: draft.role.trim() || null,
          email: draft.email.trim(),
          label: draft.name.trim() || "Teammate",
          email_label: draft.email_label || null,
          alt_email: draft.alt_email.trim() || null,
          alt_email_label: draft.alt_email_label || null,
          phone: draft.phone.trim() || null,
          phone_label: draft.phone_label || null,
          alt_phone: draft.alt_phone.trim() || null,
          alt_phone_label: draft.alt_phone_label || null,
          contact_preference: draft.contact_preference.trim() || null,
          isPrimary: false,
        },
      }),
    onSuccess: () => {
      toast.success("Contact added");
      setDraft({ ...EMPTY_CONTACT_DRAFT });
      setDrafting(false);
      qc.invalidateQueries({ queryKey: ["lead-contacts", lead.id] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not add contact"),
  });

  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Contact removed");
      qc.invalidateQueries({ queryKey: ["lead-contacts", lead.id] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const primaryM = useMutation({
    mutationFn: (id: string) => primaryFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Primary contact updated");
      qc.invalidateQueries({ queryKey: ["lead-contacts", lead.id] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const total = teammates.length;
  const canAddMore = total < MAX_TEAMMATES;

  return (
    <section className="rounded-sm border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-foreground">
            Team members / additional contacts
          </span>
          <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {total} / {MAX_TEAMMATES}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-sm text-[12px]"
          disabled={!canAddMore || drafting}
          onClick={() => setDrafting(true)}
        >
          + Add contact
        </Button>
      </div>

      <div className="grid gap-3 p-3">
        {teammates.length === 0 && !drafting && (
          <div className="rounded-sm border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">
            No additional contacts. Add teammates from the same company here —
            all their emails appear in the compose recipient list.
          </div>
        )}

        {teammates.map((c) => (
          <TeammateCard
            key={c.id}
            contact={c}
            onDelete={() => {
              if (confirm(`Remove ${c.name || c.email} from this lead?`))
                delM.mutate(c.id);
            }}
            onMakePrimary={() => primaryM.mutate(c.id)}
          />
        ))}

        {drafting && (
          <div className="grid gap-2 rounded-sm border border-primary/40 bg-primary/5 p-3">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              New contact
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="h-9 rounded-sm text-[12.5px]"
              />
              <Input
                placeholder="Role (e.g. Marketing Manager)"
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                className="h-9 rounded-sm text-[12.5px]"
              />
            </div>
            <EmailRow
              label="Email"
              value={draft.email}
              onChange={(v) => setDraft({ ...draft, email: v })}
              tag={draft.email_label}
              onTagChange={(v) => setDraft({ ...draft, email_label: v })}
              onCompose={() => toast.info("Save the contact first, then compose.")}
            />
            <EmailRow
              label="Alternative email"
              value={draft.alt_email}
              onChange={(v) => setDraft({ ...draft, alt_email: v })}
              tag={draft.alt_email_label}
              onTagChange={(v) => setDraft({ ...draft, alt_email_label: v })}
              onCompose={() => toast.info("Save the contact first, then compose.")}
            />
            <PhoneRow
              label="Phone"
              value={draft.phone}
              onChange={(v) => setDraft({ ...draft, phone: v })}
              tag={draft.phone_label}
              onTagChange={(v) => setDraft({ ...draft, phone_label: v })}
            />
            <PhoneRow
              label="Alternative phone"
              value={draft.alt_phone}
              onChange={(v) => setDraft({ ...draft, alt_phone: v })}
              tag={draft.alt_phone_label}
              onTagChange={(v) => setDraft({ ...draft, alt_phone_label: v })}
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-sm text-[12px]"
                onClick={() => {
                  setDrafting(false);
                  setDraft({ ...EMPTY_CONTACT_DRAFT });
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 rounded-sm bg-primary text-[12px] text-primary-foreground hover:bg-brand-700"
                disabled={addM.isPending || !draft.email.trim()}
                onClick={() => addM.mutate()}
              >
                {addM.isPending ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : null}
                Save contact
              </Button>
            </div>
          </div>
        )}

        {!canAddMore && (
          <div className="text-[11px] text-muted-foreground">
            Maximum {MAX_TEAMMATES} additional contacts per lead. Remove one to
            add another.
          </div>
        )}
      </div>
    </section>
  );
}

function TeammateCard({
  contact,
  onDelete,
  onMakePrimary,
}: {
  contact: LeadContactRow;
  onDelete: () => void;
  onMakePrimary: () => void;
}) {
  const updateFn = useServerFn(updateLeadContact);
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: contact.name ?? "",
    role: contact.role ?? "",
    email: contact.email,
    email_label: contact.email_label ?? "",
    alt_email: contact.alt_email ?? "",
    alt_email_label: contact.alt_email_label ?? "",
    phone: contact.phone ?? "",
    phone_label: contact.phone_label ?? "",
    alt_phone: contact.alt_phone ?? "",
    alt_phone_label: contact.alt_phone_label ?? "",
    contact_preference: contact.contact_preference ?? "",
  });
  const [open, setOpen] = useState(false);

  const saveM = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id: contact.id,
          name: form.name.trim() || null,
          role: form.role.trim() || null,
          email: form.email.trim(),
          email_label: form.email_label || null,
          alt_email: form.alt_email.trim() || null,
          alt_email_label: form.alt_email_label || null,
          phone: form.phone.trim() || null,
          phone_label: form.phone_label || null,
          alt_phone: form.alt_phone.trim() || null,
          alt_phone_label: form.alt_phone_label || null,
          contact_preference: form.contact_preference.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Contact updated");
      qc.invalidateQueries({ queryKey: ["lead-contacts", contact.lead_id] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  return (
    <div className="rounded-sm border border-border bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-foreground">
            {form.name || "(no name)"}
            {contact.is_primary && (
              <span className="rounded-sm bg-primary/10 px-1.5 py-[1px] text-[9.5px] uppercase tracking-wider text-primary">
                primary
              </span>
            )}
          </div>
          <div className="truncate text-[11.5px] text-muted-foreground">
            {form.role ? `${form.role} · ` : ""}
            {form.email}
          </div>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">
          {open ? "− collapse" : "+ edit"}
        </span>
      </button>
      {open && (
        <div className="grid gap-2 border-t border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="h-9 rounded-sm text-[12.5px]"
            />
            <Input
              placeholder="Role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="h-9 rounded-sm text-[12.5px]"
            />
          </div>
          <EmailRow
            label="Email"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
            tag={form.email_label}
            onTagChange={(v) => setForm({ ...form, email_label: v })}
            onCompose={() => toast.info("Select this contact in the Emails tab.")}
          />
          <EmailRow
            label="Alternative email"
            value={form.alt_email}
            onChange={(v) => setForm({ ...form, alt_email: v })}
            tag={form.alt_email_label}
            onTagChange={(v) => setForm({ ...form, alt_email_label: v })}
            onCompose={() => toast.info("Select this contact in the Emails tab.")}
          />
          <PhoneRow
            label="Phone"
            value={form.phone}
            onChange={(v) => setForm({ ...form, phone: v })}
            tag={form.phone_label}
            onTagChange={(v) => setForm({ ...form, phone_label: v })}
          />
          <PhoneRow
            label="Alternative phone"
            value={form.alt_phone}
            onChange={(v) => setForm({ ...form, alt_phone: v })}
            tag={form.alt_phone_label}
            onTagChange={(v) => setForm({ ...form, alt_phone_label: v })}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {!contact.is_primary && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-sm text-[12px]"
                  onClick={onMakePrimary}
                >
                  Make primary
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-8 rounded-sm text-[12px] text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={onDelete}
              >
                <Trash2 className="mr-1.5 size-3.5" />
                Remove
              </Button>
            </div>
            <Button
              size="sm"
              className="h-8 rounded-sm bg-primary text-[12px] text-primary-foreground hover:bg-brand-700"
              disabled={saveM.isPending || !form.email.trim()}
              onClick={() => saveM.mutate()}
            >
              {saveM.isPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 size-3.5" />
              )}
              Save
            </Button>
          </div>
        </div>
      )}
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

function QuotaChip({
  provider,
  usage,
}: {
  provider: "resend" | "brevo";
  usage: EmailUsageToday | undefined;
}) {
  const p = usage?.[provider];
  const used = p?.used ?? 0;
  const limit = p?.limit ?? (provider === "resend" ? 100 : 300);
  const reserved = p?.reserved ?? 0;
  const sent = p?.sent ?? 0;
  const remaining = Math.max(0, limit - used);
  const pct = Math.min(100, (used / limit) * 100);
  const isNear = pct >= 80;
  const isFull = used >= limit;
  const tone = isFull
    ? "border-rose-200 bg-rose-50 text-rose-700"
    : isNear
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-border bg-white text-foreground";
  const barTone = isFull
    ? "bg-rose-500"
    : isNear
      ? "bg-amber-500"
      : provider === "resend"
        ? "bg-black"
        : "bg-emerald-600";
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-sm border px-2 py-1 font-mono text-[10.5px]",
              tone,
            )}
          >
            {provider === "resend" ? (
              <ResendLogo className="size-3" />
            ) : (
              <BrevoLogo className="size-3" />
            )}
            <span className="tabular-nums">
              {String(used).padStart(2, "0")} / {limit}
            </span>
            <span className="h-1 w-14 overflow-hidden rounded-full bg-muted">
              <span
                className={cn("block h-full transition-all", barTone)}
                style={{ width: `${pct}%` }}
              />
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[11px]">
          <div className="font-medium capitalize">{provider} · daily free plan</div>
          <div className="mt-1 grid gap-0.5 font-mono text-[10.5px] text-muted-foreground">
            <div>Sent today: {sent}</div>
            <div>In queue / sending: {reserved}</div>
            <div>Remaining: {remaining}</div>
            <div>Resets at UTC midnight</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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

  // Real-time provider quota (Resend/Brevo daily usage across ALL leads).
  const usageFn = useServerFn(getEmailUsageToday);
  const usage = useQuery({
    queryKey: ["email-usage-today"],
    queryFn: () => usageFn(),
    refetchInterval: 5_000,
    staleTime: 2_000,
  });
  useEffect(() => {
    // Any lead_emails INSERT/UPDATE anywhere in the org changes the counter.
    const ch = supabase
      .channel("email-usage-today")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lead_emails" },
        () => qc.invalidateQueries({ queryKey: ["email-usage-today"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

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
  const [viewMail, setViewMail] = useState<LeadEmailRow | null>(null);

  // Focus tracking so variable chips insert into the last-focused field.
  const subjectRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  // Build a unified recipient list from:
  //   1) the lead itself (primary email + alt email)
  //   2) each additional contact (their primary email + alt email)
  // Each option has a stable id so preselection and toggle stay consistent.
  type RecipientOption = {
    id: string;
    email: string;
    name: string | null;
    role: string | null;
    labelBadge: string | null;
    isLeadPrimary: boolean;
    isAlt: boolean;
  };
  const recipientOptions: RecipientOption[] = [];
  if (lead.email) {
    recipientOptions.push({
      id: "lead:primary",
      email: lead.email,
      name: lead.name,
      role: lead.role,
      labelBadge: lead.email_label || "primary",
      isLeadPrimary: true,
      isAlt: false,
    });
  }
  if (lead.alt_email) {
    recipientOptions.push({
      id: "lead:alt",
      email: lead.alt_email,
      name: lead.name,
      role: lead.role,
      labelBadge: lead.alt_email_label || "alt",
      isLeadPrimary: false,
      isAlt: true,
    });
  }
  for (const c of contacts.data ?? []) {
    // Skip the auto-primary shadow row (mirrors lead's own email).
    if (
      c.is_primary &&
      !c.name &&
      !c.role &&
      (c.label === "Primary" || c.label === null) &&
      c.email === lead.email
    ) {
      continue;
    }
    recipientOptions.push({
      id: `c:${c.id}:primary`,
      email: c.email,
      name: c.name,
      role: c.role,
      labelBadge: c.email_label || c.label || "teammate",
      isLeadPrimary: false,
      isAlt: false,
    });
    if (c.alt_email) {
      recipientOptions.push({
        id: `c:${c.id}:alt`,
        email: c.alt_email,
        name: c.name,
        role: c.role,
        labelBadge: c.alt_email_label || "alt",
        isLeadPrimary: false,
        isAlt: true,
      });
    }
  }

  // Preselect the lead's primary email (or the first available) once options
  // are known.
  useEffect(() => {
    if (selectedIds.length > 0) return;
    if (recipientOptions.length === 0) return;
    const first = recipientOptions[0].id;
    setSelectedIds([first]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientOptions.length]);

  const selectedRecipients = recipientOptions.filter((r) =>
    selectedIds.includes(r.id),
  );
  const selectedEmails = selectedRecipients.map((r) => r.email);


  useEffect(() => {
    setBody(contentType === "html" ? DEFAULT_HTML_BODY : DEFAULT_TEXT_BODY);
  }, [contentType]);




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
          to: selectedRecipients.map((r) => ({ email: r.email, name: r.name })),
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
            <QuotaChip provider={provider} usage={usage.data} />

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
            ) : recipientOptions.length === 0 ? (
              <div className="rounded-sm border border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground">
                No emails on this lead yet. Add an email in Overview.
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {recipientOptions.map((r) => {
                  const active = selectedIds.includes(r.id);
                  return (
                    <label
                      key={r.id}
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
                              ? Array.from(new Set([...prev, r.id]))
                              : prev.filter((id) => id !== r.id),
                          );
                        }}
                        className="size-3.5"
                      />
                      {r.name && (
                        <span className="text-[11.5px] font-medium text-foreground">
                          {r.name}
                        </span>
                      )}
                      <span className="font-mono text-[11.5px]">{r.email}</span>
                      {r.labelBadge && (
                        <span className="rounded-sm bg-muted px-1 py-[1px] text-[9.5px] uppercase tracking-wider text-muted-foreground">
                          {r.labelBadge}
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
          {emails.data?.map((e: LeadEmailRow) => {
            const ts = e.sent_at ?? e.created_at;
            const dt = new Date(ts);
            const dateStr = dt.toLocaleString(undefined, {
              year: "numeric",
              month: "short",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <li
                key={e.id}
                className="grid gap-1.5 p-3 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-mono text-foreground">{dateStr}</span>
                    <span>·</span>
                    <span>
                      by{" "}
                      <span className="font-medium text-foreground">
                        {e.direction === "inbound"
                          ? (e.from_email ?? "inbound")
                          : (e.sent_by_name ?? "—")}
                      </span>
                    </span>
                    <span>·</span>
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
                    {e.provider !== "resend" &&
                      e.provider !== "brevo" &&
                      e.status === "sent" && (
                        <span className="rounded-sm bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-700">
                          sent
                        </span>
                      )}
                  </div>
                  <div className="truncate text-[12.5px] font-medium">
                    {e.subject || "(no subject)"}
                  </div>
                  {e.error_message && (
                    <div className="text-[11px] text-red-600">
                      {e.error_message}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-sm text-[11.5px]"
                    onClick={() => setViewMail(e)}
                  >
                    <Eye className="mr-1.5 size-3" />
                    View mail
                  </Button>
                  {e.status === "failed" && (
                    <>
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
                        Retry
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
                    </>
                  )}
                </div>
              </li>
            );
          })}
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

      <Dialog open={!!viewMail} onOpenChange={(o) => !o && setViewMail(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-[14px]">
              {viewMail?.subject || "(no subject)"}
            </DialogTitle>
          </DialogHeader>
          {viewMail && (
            <div className="grid gap-2">
              <div className="grid gap-1 rounded-sm border border-border bg-muted/50 px-3 py-2 text-[11.5px]">
                <div>
                  <span className="text-muted-foreground">From</span>{" "}
                  <span className="font-mono">
                    Branta Tech &lt;{viewMail.from_email || "hello@brantatech.com"}&gt;
                  </span>
                  {viewMail.sent_by_name && (
                    <span className="ml-2 text-muted-foreground">
                      · sent by {viewMail.sent_by_name}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">To</span>{" "}
                  <span className="font-mono">
                    {viewMail.to_emails.join(", ") || "—"}
                  </span>
                </div>
                {viewMail.cc_emails.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Cc</span>{" "}
                    <span className="font-mono">
                      {viewMail.cc_emails.join(", ")}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Sent</span>{" "}
                  <span className="font-mono">
                    {new Date(
                      viewMail.sent_at ?? viewMail.created_at,
                    ).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Provider</span>{" "}
                  <span className="font-mono uppercase">
                    {viewMail.provider}
                  </span>
                </div>
              </div>
              {viewMail.body_html ? (
                <iframe
                  title="mail-view"
                  sandbox=""
                  className="h-[60vh] w-full rounded-sm border border-border bg-white"
                  srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;font:14px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111}</style></head><body>${viewMail.body_html}</body></html>`}
                />
              ) : (
                <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-sm border border-border bg-white p-3 text-[12.5px]">
                  {viewMail.body_text ?? "(empty)"}
                </pre>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}



// ---------- Meetings tab ----------
const BD_TZ = "Asia/Dhaka";

// Get YYYY-MM-DDTHH:mm as viewed in Asia/Dhaka regardless of the browser's TZ.
function toBDInput(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BD_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

// Interpret a naive "YYYY-MM-DDTHH:mm" as BDT local time → full ISO with +06:00.
function bdInputToISO(local: string) {
  if (!local) return "";
  return `${local}:00+06:00`;
}

// Always display in Bangladesh time, 12-hour format.
function formatBDDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: BD_TZ,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
function formatBDTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: BD_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const REMINDER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "At time of event" },
  { value: 5, label: "5 minutes before" },
  { value: 10, label: "10 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
  { value: 1440, label: "1 day before" },
];

const RSVP_META: Record<
  RsvpStatus,
  { label: string; className: string }
> = {
  accepted: {
    label: "Accepted",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  declined: {
    label: "Declined",
    className: "bg-red-50 text-red-700 border-red-200",
  },
  tentative: {
    label: "Maybe",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  needsAction: {
    label: "No reply",
    className: "bg-muted text-muted-foreground border-border",
  },
};

function MeetingsTab({
  lead,
  users,
}: {
  lead: LeadRow;
  users: { user_id: string; full_name: string | null; personal_gmail?: string | null }[];
}) {
  const listFn = useServerFn(listLeadMeetings);
  const schedFn = useServerFn(scheduleLeadMeeting);
  const conflictsFn = useServerFn(checkMeetingConflicts);
  const syncFn = useServerFn(syncMeetingRsvp);
  const [checkingConflicts, setCheckingConflicts] = React.useState(false);

  const cancelFn = useServerFn(cancelLeadMeeting);
  const rescheduleFn = useServerFn(rescheduleLeadMeeting);
  const [rescheduleTarget, setRescheduleTarget] =
    React.useState<LeadMeetingRow | null>(null);
  const [reStart, setReStart] = React.useState("");
  const [reEnd, setReEnd] = React.useState("");
  const [reReminder, setReReminder] = React.useState<number>(30);
  const [reChecking, setReChecking] = React.useState(false);
  const listContactsFn = useServerFn(listLeadContacts);
  const qc = useQueryClient();
  const confirm = useConfirm();

  const meetings = useQuery({
    queryKey: ["lead-meetings", lead.id],
    queryFn: () => listFn({ data: { leadId: lead.id } }),
    staleTime: 10_000,
  });
  const contactsQ = useQuery({
    queryKey: ["lead-contacts", lead.id],
    queryFn: () => listContactsFn({ data: { leadId: lead.id } }),
    staleTime: 30_000,
  });

  const rsvpSyncM = useMutation({
    mutationFn: () => syncFn({ data: { leadId: lead.id } }),
    onSuccess: (r) => {
      if (r.updated > 0)
        toast.success(`Updated RSVPs on ${r.updated} meeting${r.updated > 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["lead-meetings", lead.id] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "RSVP sync failed"),
  });

  // Live RSVP sync — on mount, on visibility change, and every 60s.
  React.useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled || document.hidden) return;
      rsvpSyncM.mutate();
    };
    tick();
    const iv = window.setInterval(tick, 60_000);
    const onVis = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  const isGmail = (v?: string | null) =>
    !!v && /^[^\s@]+@gmail\.com$/i.test(v.trim());

  const leadEmailOptions = React.useMemo(() => {
    const list: { email: string; label: string }[] = [];
    const seen = new Set<string>();
    const push = (email: string | null | undefined, label: string) => {
      if (!isGmail(email)) return;
      const e = email!.trim().toLowerCase();
      if (seen.has(e)) return;
      seen.add(e);
      list.push({ email: e, label });
    };
    const leadWho = lead.name || "Lead";
    push(lead.email, `${leadWho} · ${lead.email}`);
    push((lead as any).alt_email, `${leadWho} (alt) · ${(lead as any).alt_email}`);
    for (const c of contactsQ.data ?? []) {
      const who = c.name || c.role || "Contact";
      push(c.email, `${who} · ${c.email}`);
      push(c.alt_email, `${who} (alt) · ${c.alt_email}`);
    }
    return list;
  }, [contactsQ.data, lead.email, lead.name, (lead as any).alt_email]);

  const employeeEmailOptions = React.useMemo(() => {
    const list: { email: string; label: string }[] = [];
    const seen = new Set<string>();
    for (const u of users) {
      if (!isGmail(u.personal_gmail)) continue;
      const e = u.personal_gmail!.trim().toLowerCase();
      if (seen.has(e)) continue;
      seen.add(e);
      list.push({ email: e, label: u.full_name || e });
    }
    return list.sort((a, b) => a.label.localeCompare(b.label));
  }, [users]);

  const now = new Date();
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const in1h30 = new Date(now.getTime() + 90 * 60 * 1000);
  const [title, setTitle] = useState(`Intro call — ${lead.company || lead.name}`);
  const [startsAt, setStartsAt] = useState(toBDInput(in1h));
  const [endsAt, setEndsAt] = useState(toBDInput(in1h30));
  const [reminderMinutes, setReminderMinutes] = useState<number>(30);
  const [selectedLeadEmails, setSelectedLeadEmails] = useState<string[]>([]);
  const [selectedEmpEmails, setSelectedEmpEmails] = useState<string[]>([]);
  const [description, setDescription] = useState("");

  useEffect(() => {
    setTitle(`Intro call — ${lead.company || lead.name}`);
  }, [lead.id, lead.name, lead.company]);

  useEffect(() => {
    if (leadEmailOptions.length > 0 && selectedLeadEmails.length === 0) {
      setSelectedLeadEmails([leadEmailOptions[0].email]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadEmailOptions.length]);

  const attendees = React.useMemo(
    () =>
      Array.from(
        new Set([...selectedLeadEmails, ...selectedEmpEmails].map((e) => e.toLowerCase())),
      ),
    [selectedLeadEmails, selectedEmpEmails],
  );

  const schedM = useMutation({
    mutationFn: () =>
      schedFn({
        data: {
          leadId: lead.id,
          title: title.trim(),
          description: description.trim() || null,
          startsAt: bdInputToISO(startsAt),
          endsAt: bdInputToISO(endsAt),
          attendees,
          reminderMinutes,
        },
      }),
    onSuccess: () => {
      toast.success("Meeting scheduled with Meet link");
      qc.invalidateQueries({ queryKey: ["lead-meetings", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["leads", "activities", lead.id] });
      setSelectedEmpEmails([]);
      setDescription("");
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
  const rescheduleM = useMutation({
    mutationFn: (input: {
      id: string;
      startsAt: string;
      endsAt: string;
      reminderMinutes: number;
    }) => rescheduleFn({ data: input }),
    onSuccess: () => {
      toast.success("Meeting rescheduled — attendees notified");
      qc.invalidateQueries({ queryKey: ["lead-meetings", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads", "activities", lead.id] });
      setRescheduleTarget(null);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Reschedule failed"),
  });

  const canSchedule =
    !!title.trim() && attendees.length > 0 && !schedM.isPending;

  return (
    <div className="grid gap-4">
      <section className="rounded-sm border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Schedule meeting
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Timezone · Asia/Dhaka (BDT) · 12-hour
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 p-3">
          <Field label="Title" className="col-span-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9 rounded-sm text-[12.5px]"
            />
          </Field>
          <Field label="Starts (BDT)">
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="h-9 rounded-sm font-mono text-[12.5px]"
            />
          </Field>
          <Field label="Ends (BDT)">
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="h-9 rounded-sm font-mono text-[12.5px]"
            />
          </Field>

          <Field label="Reminder" className="col-span-2">
            <select
              value={reminderMinutes}
              onChange={(e) => setReminderMinutes(Number(e.target.value))}
              className="h-9 w-full rounded-sm border border-input bg-background px-2 text-[12.5px]"
            >
              {REMINDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Lead attendees (Gmail only)">
            <EmailMultiSelect
              options={leadEmailOptions}
              value={selectedLeadEmails}
              onChange={setSelectedLeadEmails}
              placeholder={
                leadEmailOptions.length === 0
                  ? "No Gmail addresses on this lead"
                  : "Select lead / contact Gmail…"
              }
              emptyText="No Gmail contacts. Add one under Contacts."
            />
          </Field>
          <Field label="Employee attendees (Gmail only)">
            <EmailMultiSelect
              options={employeeEmailOptions}
              value={selectedEmpEmails}
              onChange={setSelectedEmpEmails}
              placeholder={
                employeeEmailOptions.length === 0
                  ? "No employees have added a personal Gmail"
                  : "Select employees…"
              }
              emptyText="Employees can add their Gmail under Profile → Identity."
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
        <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
          <div className="text-[11.5px] text-muted-foreground">
            {attendees.length === 0
              ? "Select at least one @gmail.com attendee."
              : `${attendees.length} attendee${attendees.length > 1 ? "s" : ""} will receive a Google invite.`}
          </div>
          <Button
            size="sm"
            className="h-8 rounded-sm bg-primary text-[12px] text-primary-foreground hover:bg-brand-700"
            disabled={!canSchedule || checkingConflicts}
            onClick={async () => {
              const startISO = bdInputToISO(startsAt);
              const endISO = bdInputToISO(endsAt);
              if (new Date(endISO) <= new Date(startISO)) {
                toast.error("End time must be after start time.");
                return;
              }
              setCheckingConflicts(true);
              let conflicts: Awaited<ReturnType<typeof conflictsFn>> = [];
              try {
                conflicts = await conflictsFn({
                  data: { startsAt: startISO, endsAt: endISO },
                });
              } finally {
                setCheckingConflicts(false);
              }
              const conflictBlock =
                conflicts.length > 0
                  ? `\n\n⚠ Conflicts on your calendar (${conflicts.length}):\n${conflicts
                      .slice(0, 5)
                      .map(
                        (c) =>
                          `• ${c.summary} — ${formatBDDateTime(c.startsAt)} → ${formatBDTime(c.endsAt)}`,
                      )
                      .join("\n")}${conflicts.length > 5 ? `\n• +${conflicts.length - 5} more…` : ""}`
                  : "";
              const reminderLabel =
                REMINDER_OPTIONS.find((r) => r.value === reminderMinutes)?.label ??
                `${reminderMinutes}m before`;
              const ok = await confirm({
                title:
                  conflicts.length > 0
                    ? `Time conflict — schedule anyway?`
                    : "Create Google Meet?",
                description: `A calendar event "${title.trim()}" will be created (${formatBDDateTime(startISO)} → ${formatBDTime(endISO)} BDT) with a "${reminderLabel}" reminder. Google will email an invite with the Meet link to ${attendees.length} attendee${attendees.length > 1 ? "s" : ""}: ${attendees.join(", ")}.${conflictBlock}`,
                confirmLabel:
                  conflicts.length > 0 ? "Schedule anyway" : "Create meeting",
                cancelLabel: "Back",
                tone: conflicts.length > 0 ? "danger" : "info",
              });
              if (ok) schedM.mutate();
            }}
          >
            {schedM.isPending || checkingConflicts ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <CalendarPlus className="mr-1.5 size-3.5" />
            )}
            Create with Google Meet
          </Button>
        </div>
      </section>

      <section className="rounded-sm border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Scheduled ({meetings.data?.length ?? 0})
          </div>
          <button
            type="button"
            onClick={() => rsvpSyncM.mutate()}
            disabled={rsvpSyncM.isPending}
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-background px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-muted disabled:opacity-60"
            title="Pull the latest RSVP status from Google Calendar"
          >
            {rsvpSyncM.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : null}
            Sync RSVPs
          </button>
        </div>
        <ul className="divide-y divide-border">
          {meetings.isLoading && (
            <li className="p-3 text-[12px] text-muted-foreground">Loading…</li>
          )}
          {meetings.data?.length === 0 && !meetings.isLoading && (
            <li className="p-3 text-[12px] text-muted-foreground">No meetings.</li>
          )}
          {meetings.data?.map((m: LeadMeetingRow) => {
            const isCancelled = m.status === "cancelled";
            const responses = m.attendee_responses ?? {};
            const reminderLabel =
              REMINDER_OPTIONS.find((r) => r.value === m.reminder_minutes)
                ?.label ??
              (typeof m.reminder_minutes === "number"
                ? `${m.reminder_minutes} min before`
                : "Default reminder");
            return (
              <li key={m.id} className="grid gap-1.5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={cn(
                      "text-[12.5px] font-medium",
                      isCancelled && "text-muted-foreground line-through",
                    )}
                  >
                    {m.title}
                  </div>
                  <span
                    className={cn(
                      "rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                      m.status === "scheduled"
                        ? "bg-brand-50 text-brand-700"
                        : isCancelled
                          ? "bg-muted text-muted-foreground"
                          : "bg-emerald-50 text-emerald-700",
                    )}
                  >
                    {m.status}
                  </span>
                </div>
                <div className="font-mono text-[11.5px] text-muted-foreground">
                  {formatBDDateTime(m.starts_at)} → {formatBDTime(m.ends_at)} · BDT
                </div>
                <div className="text-[11.5px] text-muted-foreground">
                  Created by{" "}
                  <span className="font-medium text-foreground">
                    {m.created_by_name || "—"}
                  </span>{" "}
                  · {formatBDDateTime(m.created_at)} · Reminder:{" "}
                  <span className="text-foreground">{reminderLabel}</span>
                </div>
                {m.attendees && m.attendees.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.attendees.map((a) => {
                      const key = a.toLowerCase();
                      const rs = (responses[key] ?? "needsAction") as RsvpStatus;
                      const meta = RSVP_META[rs];
                      return (
                        <span
                          key={a}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[10.5px]",
                            meta.className,
                          )}
                          title={`${a} — ${meta.label}`}
                        >
                          <span className="truncate max-w-[220px]">{a}</span>
                          <span className="opacity-70">·</span>
                          <span className="uppercase tracking-wider">
                            {meta.label}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
                {m.rsvp_synced_at && !isCancelled && (
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    RSVPs synced {formatBDTime(m.rsvp_synced_at)}
                  </div>
                )}
                <div className="mt-1 flex items-center gap-2">
                  {m.meeting_link && !isCancelled && (
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
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-sm text-[11.5px]"
                        onClick={() => {
                          setRescheduleTarget(m);
                          setReStart(toBDInput(m.starts_at));
                          setReEnd(toBDInput(m.ends_at));
                          setReReminder(
                            typeof m.reminder_minutes === "number"
                              ? m.reminder_minutes
                              : 30,
                          );
                        }}
                      >
                        Reschedule
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-sm text-[11.5px] text-red-600 hover:bg-red-50"
                        onClick={async () => {
                          const ok = await confirm({
                            title: "Cancel this meeting?",
                            description: `"${m.title}" scheduled for ${formatBDDateTime(m.starts_at)} (BDT) will be deleted from Google Calendar and all attendees will be notified.`,
                            confirmLabel: "Cancel meeting",
                            cancelLabel: "Keep it",
                            tone: "danger",
                          });
                          if (ok) cancelM.mutate(m.id);
                        }}
                        disabled={cancelM.isPending}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <Dialog
        open={!!rescheduleTarget}
        onOpenChange={(o) => !o && setRescheduleTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[14px]">
              Reschedule meeting
            </DialogTitle>
          </DialogHeader>
          {rescheduleTarget && (
            <div className="grid gap-3">
              <div className="text-[12px] text-muted-foreground">
                <span className="font-medium text-foreground">
                  {rescheduleTarget.title}
                </span>
                <div className="mt-0.5 font-mono text-[11.5px]">
                  Currently: {formatBDDateTime(rescheduleTarget.starts_at)} →{" "}
                  {formatBDTime(rescheduleTarget.ends_at)} · BDT
                </div>
              </div>
              <Field label="New start (BDT)">
                <Input
                  type="datetime-local"
                  value={reStart}
                  onChange={(e) => setReStart(e.target.value)}
                  className="h-9 rounded-sm font-mono text-[12.5px]"
                />
              </Field>
              <Field label="New end (BDT)">
                <Input
                  type="datetime-local"
                  value={reEnd}
                  onChange={(e) => setReEnd(e.target.value)}
                  className="h-9 rounded-sm font-mono text-[12.5px]"
                />
              </Field>
              <Field label="Reminder">
                <select
                  value={reReminder}
                  onChange={(e) => setReReminder(Number(e.target.value))}
                  className="h-9 w-full rounded-sm border border-input bg-background px-2 text-[12.5px]"
                >
                  {REMINDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="text-[11px] text-muted-foreground">
                Google will email an updated invite to all{" "}
                {rescheduleTarget.attendees?.length ?? 0} attendee(s).
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-sm text-[12px]"
                  onClick={() => setRescheduleTarget(null)}
                  disabled={rescheduleM.isPending || reChecking}
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  className="h-8 rounded-sm bg-primary text-[12px] text-primary-foreground hover:bg-brand-700"
                  disabled={
                    !reStart || !reEnd || rescheduleM.isPending || reChecking
                  }
                  onClick={async () => {
                    const startISO = bdInputToISO(reStart);
                    const endISO = bdInputToISO(reEnd);
                    if (new Date(endISO) <= new Date(startISO)) {
                      toast.error("End time must be after start time.");
                      return;
                    }
                    const unchanged =
                      new Date(startISO).getTime() ===
                        new Date(rescheduleTarget.starts_at).getTime() &&
                      new Date(endISO).getTime() ===
                        new Date(rescheduleTarget.ends_at).getTime() &&
                      reReminder === rescheduleTarget.reminder_minutes;
                    if (unchanged) {
                      toast.info("No changes to save.");
                      return;
                    }
                    setReChecking(true);
                    let conflicts: Awaited<
                      ReturnType<typeof conflictsFn>
                    > = [];
                    try {
                      conflicts = await conflictsFn({
                        data: { startsAt: startISO, endsAt: endISO },
                      });
                    } finally {
                      setReChecking(false);
                    }
                    conflicts = conflicts.filter(
                      (c) => c.eventId !== rescheduleTarget.google_event_id,
                    );
                    const conflictBlock =
                      conflicts.length > 0
                        ? `\n\n⚠ Conflicts (${conflicts.length}):\n${conflicts
                            .slice(0, 5)
                            .map(
                              (c) =>
                                `• ${c.summary} — ${formatBDDateTime(c.startsAt)} → ${formatBDTime(c.endsAt)}`,
                            )
                            .join("\n")}`
                        : "";
                    const reminderLabel =
                      REMINDER_OPTIONS.find((r) => r.value === reReminder)?.label ??
                      `${reReminder}m before`;
                    const ok = await confirm({
                      title:
                        conflicts.length > 0
                          ? "Time conflict — reschedule anyway?"
                          : "Reschedule meeting?",
                      description: `"${rescheduleTarget.title}" will be moved to ${formatBDDateTime(startISO)} → ${formatBDTime(endISO)} BDT with a "${reminderLabel}" reminder. Google will notify all attendees.${conflictBlock}`,
                      confirmLabel:
                        conflicts.length > 0
                          ? "Reschedule anyway"
                          : "Reschedule",
                      cancelLabel: "Back",
                      tone: conflicts.length > 0 ? "danger" : "info",
                    });
                    if (ok)
                      rescheduleM.mutate({
                        id: rescheduleTarget.id,
                        startsAt: startISO,
                        endsAt: endISO,
                        reminderMinutes: reReminder,
                      });
                  }}
                >
                  {rescheduleM.isPending || reChecking ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : null}
                  Update event
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


// Reusable multi-select popover for gmail attendees
function EmailMultiSelect({
  options,
  value,
  onChange,
  placeholder,
  emptyText,
}: {
  options: { email: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (email: string) => {
    if (value.includes(email)) onChange(value.filter((e) => e !== email));
    else onChange([...value, email]);
  };
  const label =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? value[0]
        : `${value.length} selected`;
  return (
    <div className="grid gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-9 w-full items-center justify-between rounded-sm border border-border bg-background px-2.5 text-left text-[12.5px] hover:bg-muted/40"
          >
            <span className={cn(value.length === 0 && "text-muted-foreground")}>
              {label}
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <div className="max-h-64 overflow-auto">
            {options.length === 0 ? (
              <div className="p-3 text-[12px] text-muted-foreground">
                {emptyText}
              </div>
            ) : (
              options.map((o) => {
                const checked = value.includes(o.email);
                return (
                  <button
                    key={o.email}
                    type="button"
                    onClick={() => toggle(o.email)}
                    className="flex w-full items-start gap-2 border-b border-border px-2.5 py-2 text-left text-[12px] hover:bg-muted/40 last:border-b-0"
                  >
                    <Checkbox checked={checked} className="mt-0.5" />
                    <div className="grid">
                      <span className="font-medium text-foreground">
                        {o.label}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {o.email}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((e) => (
            <span
              key={e}
              className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
            >
              {e}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== e))}
                className="text-muted-foreground/70 hover:text-red-600"
                aria-label={`Remove ${e}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
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
