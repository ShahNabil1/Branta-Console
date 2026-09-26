// Mobile-first "New lead" structured form. Full-screen bottom sheet on phones,
// centered dialog on larger screens. Three short steps + sticky save bar.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronLeft, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createLead, type LeadRow } from "@/lib/leads.functions";
import {
  listLeadServiceOptions,
  listLeadSourceOptions,
  listLeadStatusOptions,
  SERVICE_FALLBACK,
  SOURCE_FALLBACK,
  STATUS_FALLBACK,
} from "@/lib/lead-options.functions";
import {
  bdToISO,
  isValidBDPhone,
  normalizePhone,
  PRIORITY_OPTIONS,
  type LeadPriority,
} from "./lead-meta";

type Form = {
  name: string;
  company: string;
  contact_person: string;
  phone: string;
  whatsapp: string;
  waSame: boolean;
  email: string;
  source: string;
  source_other: string;
  service: string;
  service_other: string;
  requirement: string;
  budget: string;
  currency: "BDT" | "USD";
  timeline: string;
  notes: string;
  status: string;
  priority: LeadPriority;
  fuDate: string;
  fuTime: string;
};

const EMPTY: Form = {
  name: "",
  company: "",
  contact_person: "",
  phone: "",
  whatsapp: "",
  waSame: true,
  email: "",
  source: "",
  source_other: "",
  service: "",
  service_other: "",
  requirement: "",
  budget: "",
  currency: "BDT",
  timeline: "",
  notes: "",
  status: "new",
  priority: "medium",
  fuDate: "",
  fuTime: "",
};

const STEPS = ["Client", "Requirement", "Follow-up"] as const;
const TIMELINES = ["ASAP", "1–2 weeks", "1 month", "2–3 months", "Flexible"];

export function LeadFormSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (row: LeadRow) => void;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createLead);
  const srcFn = useServerFn(listLeadSourceOptions);
  const svcFn = useServerFn(listLeadServiceOptions);
  const stFn = useServerFn(listLeadStatusOptions);
  const sources = useQuery({ queryKey: ["lead-source-options"], queryFn: () => srcFn(), initialData: SOURCE_FALLBACK, staleTime: 300_000 }).data;
  const services = useQuery({ queryKey: ["lead-service-options"], queryFn: () => svcFn(), initialData: SERVICE_FALLBACK, staleTime: 300_000 }).data;
  const statuses = useQuery({ queryKey: ["lead-status-options"], queryFn: () => stFn(), initialData: STATUS_FALLBACK, staleTime: 300_000 }).data;

  const [f, setF] = useState<Form>(EMPTY);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setF(EMPTY);
      setStep(0);
      setTouched(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const srcNeeds = sources.find((s) => s.key === f.source)?.requires_detail;
  const svcNeeds = services.find((s) => s.key === f.service)?.requires_detail;

  const errors = useMemo(() => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!f.name.trim()) e.name = "Client name is required";
    if (!f.phone.trim()) e.phone = "Mobile number is required";
    else if (!isValidBDPhone(f.phone)) e.phone = "Use 01XXXXXXXXX or +8801XXXXXXXXX";
    if (!f.waSame && f.whatsapp.trim() && !/^\+?\d[\d\s-]{7,}$/.test(f.whatsapp.trim()))
      e.whatsapp = "Enter a valid WhatsApp number";
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "Invalid email";
    if (!f.source) e.source = "Pick a lead source";
    if (srcNeeds && !f.source_other.trim()) e.source_other = "Tell us the source";
    if (!f.service) e.service = "Pick a service";
    if (svcNeeds && !f.service_other.trim()) e.service_other = "Describe the service";
    if (f.budget.trim() && (isNaN(Number(f.budget)) || Number(f.budget) < 0)) e.budget = "Numbers only";
    if (f.fuDate) {
      const t = new Date(bdToISO(f.fuDate, f.fuTime)).getTime();
      if (t < Date.now() - 60_000) e.fuDate = "Follow-up can't be in the past";
    }
    return e;
  }, [f, srcNeeds, svcNeeds]);

  const stepFields: (keyof Form)[][] = [
    ["name", "phone", "whatsapp", "email"],
    ["source", "source_other", "service", "service_other", "budget"],
    ["fuDate"],
  ];
  const stepValid = (i: number) => stepFields[i].every((k) => !errors[k]);
  const err = (k: keyof Form) => (touched ? errors[k] : undefined);

  const m = useMutation({
    mutationFn: () => {
      const phone = normalizePhone(f.phone.trim());
      return createFn({
        data: {
          name: f.name.trim(),
          company: f.company.trim() || null,
          contact_person: f.contact_person.trim() || null,
          phone,
          whatsapp: f.waSame ? phone : f.whatsapp.trim() ? normalizePhone(f.whatsapp.trim()) : null,
          email: f.email.trim() || null,
          source: f.source || null,
          source_other: srcNeeds ? f.source_other.trim() : null,
          service: f.service || null,
          service_other: svcNeeds ? f.service_other.trim() : null,
          requirement: f.requirement.trim() || null,
          budget: f.budget.trim() ? Number(f.budget) : null,
          value_usd: f.budget.trim() ? Number(f.budget) : null,
          currency: f.currency,
          timeline: f.timeline.trim() || null,
          notes: f.notes.trim() || null,
          status: f.status,
          priority: f.priority,
          next_follow_up_at: f.fuDate ? bdToISO(f.fuDate, f.fuTime) : null,
        },
      });
    },
    onSuccess: (row) => {
      toast.success("Lead saved");
      qc.invalidateQueries({ queryKey: ["leads"] });
      onCreated(row);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save lead"),
  });

  const next = () => {
    setTouched(true);
    if (!stepValid(step)) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      setTouched(false);
    } else {
      m.mutate();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/40 animate-fade-in sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New lead"
        onClick={(e) => e.stopPropagation()}
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background animate-sheet-up sm:h-auto sm:max-h-[92dvh] sm:max-w-xl sm:rounded-lg sm:border sm:border-border sm:shadow-2xl sm:animate-scale-in"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-border bg-card px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => (step > 0 ? setStep(step - 1) : onClose())}
              className="grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted active:scale-95"
              aria-label={step > 0 ? "Back" : "Close"}
            >
              {step > 0 ? <ChevronLeft className="size-5" /> : <X className="size-5" />}
            </button>
            <div className="text-center">
              <div className="text-[15px] font-bold text-foreground">New lead</div>
              <div className="text-[12px] text-muted-foreground">
                Step {step + 1} of {STEPS.length} · {STEPS[step]}
              </div>
            </div>
            <div className="size-10" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => (i < step ? setStep(i) : undefined)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i <= step ? "bg-primary" : "bg-muted",
                )}
                aria-label={s}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div key={step} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 animate-fade-in">
          {step === 0 && (
            <div className="grid gap-4">
              <Field label="Lead / Client name" required error={err("name")}>
                <input className={inputCls(err("name"))} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Rahim Uddin" autoFocus />
              </Field>
              <Field label="Company / Brand name">
                <input className={inputCls()} value={f.company} onChange={(e) => set("company", e.target.value)} placeholder="e.g. Dhaka Foods Ltd." />
              </Field>
              <Field label="Contact person">
                <input className={inputCls()} value={f.contact_person} onChange={(e) => set("contact_person", e.target.value)} placeholder="Who you talk to" />
              </Field>
              <Field label="Mobile number" required error={err("phone")}>
                <input className={inputCls(err("phone"))} inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="01XXXXXXXXX" />
              </Field>
              <div className="grid gap-2">
                <label className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                  <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={f.waSame} onChange={(e) => set("waSame", e.target.checked)} />
                  WhatsApp is the same as mobile
                </label>
                {!f.waSame && (
                  <Field label="WhatsApp number" error={err("whatsapp")}>
                    <input className={inputCls(err("whatsapp"))} inputMode="tel" value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="+8801XXXXXXXXX" />
                  </Field>
                )}
              </div>
              <Field label="Email" error={err("email")}>
                <input className={inputCls(err("email"))} type="email" inputMode="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="name@company.com" />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4">
              <Field label="Lead source" required error={err("source")}>
                <Chips options={sources.map((s) => ({ key: s.key, label: s.label }))} value={f.source} onChange={(v) => set("source", v)} />
              </Field>
              {srcNeeds && (
                <Field label="Source detail" required error={err("source_other")}>
                  <input className={inputCls(err("source_other"))} value={f.source_other} onChange={(e) => set("source_other", e.target.value)} placeholder="Where did this lead come from?" />
                </Field>
              )}
              <Field label="Interested service" required error={err("service")}>
                <Chips options={services.map((s) => ({ key: s.key, label: s.label }))} value={f.service} onChange={(v) => set("service", v)} />
              </Field>
              {svcNeeds && (
                <Field label="Service detail" required error={err("service_other")}>
                  <input className={inputCls(err("service_other"))} value={f.service_other} onChange={(e) => set("service_other", e.target.value)} />
                </Field>
              )}
              <Field label="Project requirement">
                <textarea className={cn(inputCls(), "min-h-[96px] py-2.5")} value={f.requirement} onChange={(e) => set("requirement", e.target.value)} placeholder="What does the client need?" />
              </Field>
              <Field label="Approximate budget" error={err("budget")}>
                <div className="flex gap-2">
                  <input className={cn(inputCls(err("budget")), "flex-1 font-mono")} inputMode="decimal" value={f.budget} onChange={(e) => set("budget", e.target.value)} placeholder="50000" />
                  <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
                    {(["BDT", "USD"] as const).map((c) => (
                      <button key={c} type="button" onClick={() => set("currency", c)} className={cn("h-11 px-3 text-[13px] font-semibold transition-colors", f.currency === c ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground")}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </Field>
              <Field label="Expected timeline">
                <Chips options={TIMELINES.map((t) => ({ key: t, label: t }))} value={f.timeline} onChange={(v) => set("timeline", v === f.timeline ? "" : v)} />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4">
              <Field label="Lead status">
                <select className={inputCls()} value={f.status} onChange={(e) => set("status", e.target.value)}>
                  {statuses.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <div className="grid grid-cols-4 gap-1.5">
                  {PRIORITY_OPTIONS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => set("priority", p.key)}
                      className={cn(
                        "h-11 rounded-md border text-[13px] font-semibold transition-all active:scale-95",
                        f.priority === p.key ? "border-transparent text-primary-foreground shadow-sm" : "border-border bg-card text-foreground",
                      )}
                      style={f.priority === p.key ? { background: `var(${p.tone})` } : undefined}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Next follow-up date" error={err("fuDate")}>
                  <input type="date" className={inputCls(err("fuDate"))} value={f.fuDate} onChange={(e) => set("fuDate", e.target.value)} />
                </Field>
                <Field label="Time">
                  <input type="time" className={inputCls()} value={f.fuTime} onChange={(e) => set("fuTime", e.target.value)} disabled={!f.fuDate} />
                </Field>
              </div>
              <Field label="Client notes">
                <textarea className={cn(inputCls(), "min-h-[96px] py-2.5")} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth remembering…" />
              </Field>
              <p className="rounded-md bg-muted px-3 py-2 text-[12px] text-muted-foreground">
                This lead will be assigned to you automatically. Your name, employee ID, date and time are saved.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border bg-card px-4 pt-3 pb-safe">
          <button
            type="button"
            onClick={next}
            disabled={m.isPending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-[15px] font-bold text-primary-foreground shadow-sm transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-60"
          >
            {m.isPending ? <Loader2 className="size-4 animate-spin" /> : step === STEPS.length - 1 ? <Check className="size-4" /> : null}
            {step === STEPS.length - 1 ? "Save lead" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

function inputCls(error?: string) {
  return cn(
    "h-11 w-full rounded-md border bg-card px-3 text-[15px] text-foreground outline-none transition-shadow placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-primary/40 disabled:opacity-50",
    error ? "border-destructive" : "border-border",
  );
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] font-semibold text-foreground">
        {label} {required && <span className="text-primary">*</span>}
      </span>
      {children}
      {error && <span className="animate-fade-in text-[12px] font-medium text-destructive">{error}</span>}
    </div>
  );
}

function Chips({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "min-h-10 rounded-full border px-3.5 text-[13px] font-medium transition-all active:scale-95",
            value === o.key ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-card text-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
