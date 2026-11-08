import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Plus, Sparkles, UserPlus, Undo2 } from "lucide-react";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TestLoader } from "@/components/ui/test-loader";
import { DangerConfirm, DiscardCancelButton } from "@/components/company/danger-confirm";
import { useActiveCompany } from "@/components/company/company-switcher";
import { ExpenseDrawerContent, ExpenseDrawerHeader } from "@/components/finance/expense-drawer";
import { SearchableSelect } from "@/components/finance/searchable-select";
import { BdPhoneInput } from "@/components/profile/bd-fields";
import { QUIET_INPUT } from "@/components/finance/drawer-fields";
import {
  addCustomerRoleOption,
  createCustomer,
  listCustomerRoleOptions,
  type CustomerRow,
} from "@/lib/customers.functions";
import { CUSTOMER_SOURCES, matchRoles, bdPhoneOk } from "@/lib/customer-form";
import { cn } from "@/lib/utils";
import { catalogOf } from "@/lib/service-catalog";

type Currency = "BDT" | "USD";
const CURRENCIES = [
  { value: "BDT", label: "৳ BDT", hint: "Bangladeshi Taka" },
  { value: "USD", label: "$ USD", hint: "US Dollar" },
];
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const LABEL = "text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70";
const FIELD = "mt-1.5 h-9 rounded-lg shadow-sm focus-visible:border-brand";

const empty = (currency: Currency) => ({
  name: "", role: "", company: "", email: "", phone: "", source: "", service: "", currency, notes: "",
});

/** One-step New customer drawer; same surface, motion and discard rules as Add expense. */
export function CustomerDrawer({
  open,
  onOpenChange,
  defaultCurrency = "BDT",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultCurrency?: Currency;
  onCreated?: (c: CustomerRow) => void;
}) {
  const qc = useQueryClient();
  const { active } = useActiveCompany();
  const workspace = active?.slug ?? null;
  const create = useServerFn(createCustomer);
  const addRole = useServerFn(addCustomerRoleOption);
  const rolesFn = useServerFn(listCustomerRoleOptions);
  const roles = useQuery({ queryKey: ["customer-role-options"], queryFn: () => rolesFn(), staleTime: 300_000, enabled: open });
  const [form, setForm] = useState(() => empty(defaultCurrency));
  const [askClose, setAskClose] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(empty(defaultCurrency));
  const services = catalogOf(active as never).flatMap((g) => g.services.map((s) => ({ value: s, label: s, hint: g.category })));

  const phoneBad = !!form.phone && !bdPhoneOk(form.phone);
  const emailBad = !!form.email.trim() && !emailOk(form.email.trim());
  const valid = form.name.trim().length > 0 && !phoneBad && !emailBad;

  const close = () => { setForm(empty(defaultCurrency)); setAskClose(false); onOpenChange(false); };

  const submit = useMutation({
    mutationFn: async () => {
      const role = form.role.trim();
      if (role && !(roles.data ?? []).some((r) => r.toLowerCase() === role.toLowerCase())) {
        await addRole({ data: { label: role } }).catch(() => undefined);
      }
      return create({ data: {
        workspace,
        name: form.name.trim(),
        role: role || null,
        company: form.company.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone ? `+88${form.phone}` : null,
        source: form.source || null,
        service: form.service || null,
        currency: form.currency,
        notes: form.notes.trim() || null,
      } });
    },
    onSuccess: (c) => {
      toast.success(`Customer ${c.customer_code} created`);
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer-role-options"] });
      onCreated?.(c);
      close();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create customer"),
  });

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v && !submit.isPending) { if (dirty) setAskClose(true); else close(); } }}>
      <ExpenseDrawerContent className="sm:max-w-xl">
        <ExpenseDrawerHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-inset ring-brand/20"><UserPlus className="size-5" /></span>
            <div className="min-w-0">
              <SheetTitle className="text-[16px] font-bold">New customer</SheetTitle>
              <SheetDescription className="text-[12px]">{active?.name ?? "Company"} · only the name is required</SheetDescription>
            </div>
          </div>
        </ExpenseDrawerHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-300">
            <div>
              <label className={LABEL}>Name *</label>
              <Input data-drawer-autofocus autoCapitalize="words" {...QUIET_INPUT} value={form.name} maxLength={160} placeholder="Full name" onChange={(e) => set("name", e.target.value)} className={FIELD} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Role</label>
                <RoleField value={form.role} options={roles.data ?? []} onChange={(v) => set("role", v)} />
              </div>
              <div>
                <label className={LABEL}>Company</label>
                <Input autoCapitalize="words" {...QUIET_INPUT} value={form.company} maxLength={160} placeholder="Client's company" onChange={(e) => set("company", e.target.value)} className={FIELD} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Email</label>
                <Input type="text" inputMode="email" autoCapitalize="none" {...QUIET_INPUT} value={form.email} placeholder="name@example.com" onChange={(e) => set("email", e.target.value.trim())} className={cn(FIELD, emailBad && "border-destructive")} />
                {emailBad && <p className="mt-1 text-[11.5px] text-destructive">Enter a valid email.</p>}
              </div>
              <div>
                <label className={LABEL}>Phone</label>
                <div className="mt-1.5"><BdPhoneInput value={form.phone} onChange={(v) => set("phone", v)} invalid={phoneBad} /></div>
                {phoneBad && <p className="mt-1 text-[11.5px] text-destructive">Enter a valid 11-digit BD number (01XXXXXXXXX).</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL}>Source</label>
                <div className="mt-1.5"><SearchableSelect clearable items={CUSTOMER_SOURCES.map((s) => ({ value: s, label: s }))} value={form.source} onChange={(v) => set("source", v)} placeholder="— Select source —" /></div>
              </div>
              <div>
                <label className={LABEL}>Service</label>
                <div className="mt-1.5"><SearchableSelect clearable items={services} value={form.service} onChange={(v) => set("service", v)} placeholder="— Select service —" emptyText="No services yet — add them in Company Info" /></div>
              </div>
            </div>
            <div className="sm:w-1/2 sm:pr-1.5">
              <label className={LABEL}>Currency</label>
              <div className="mt-1.5"><SearchableSelect searchable={false} items={CURRENCIES} value={form.currency} onChange={(v) => v && set("currency", v as Currency)} /></div>
            </div>
            <div>
              <label className={LABEL}>Notes</label>
              <textarea value={form.notes} rows={3} maxLength={4000} onChange={(e) => set("notes", e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] leading-snug shadow-sm outline-none transition-all hover:border-foreground/25 focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)]" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-card px-6 py-3.5">
          <DiscardCancelButton dirty={dirty} onCancel={close} className="h-9 rounded-md" disabled={submit.isPending} />
          <Button onClick={() => submit.mutate()} disabled={!valid || submit.isPending}
            className="h-9 min-w-32 gap-1.5 rounded-md shadow-md shadow-brand/25 transition-all active:scale-95">
            {submit.isPending ? <TestLoader tone="white" /> : <Check className="size-4" />}
            {submit.isPending ? "Saving…" : "Create customer"}
          </Button>
        </div>
      </ExpenseDrawerContent>
      <DangerConfirm open={askClose} icon={Undo2} title="Discard unsaved changes?" subject="This new customer has not been saved yet."
        points={["Everything typed in this form will be lost.", "Choose No to keep editing."]}
        confirmLabel="Yes, discard" cancelLabel="No, keep editing" onCancel={() => setAskClose(false)} onConfirm={close} />
    </Sheet>
  );
}

/** Role input with saved suggestions; unknown roles can be added and are remembered on save. */
function RoleField({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const [focus, setFocus] = useState(false);
  const [hi, setHi] = useState(0);
  // Only an arrow-key choice is picked on Enter; otherwise Enter/Next keeps the typed role and moves on.
  const [navigated, setNavigated] = useState(false);
  const blurT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const matches = useMemo(() => matchRoles(options, value).slice(0, 8), [options, value]);
  const q = value.trim();
  const exact = options.some((o) => o.toLowerCase() === q.toLowerCase());
  const rows = [...matches.map((m) => ({ label: m, add: false })), ...(q && !exact ? [{ label: q, add: true }] : [])];
  const show = focus && rows.length > 0;
  const pick = (v: string) => { onChange(v); setFocus(false); };
  return (
    <div className="relative mt-1.5">
      <Input value={value} maxLength={120} placeholder="e.g. CEO, HR & Admin" autoCapitalize="words" {...QUIET_INPUT}
        onFocus={() => { clearTimeout(blurT.current); setFocus(true); setHi(0); setNavigated(false); }}
        onBlur={() => { blurT.current = setTimeout(() => setFocus(false), 120); }}
        onChange={(e) => { onChange(e.target.value); setFocus(true); setHi(0); setNavigated(false); }}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setNavigated(true); setHi((h) => Math.min(h + 1, rows.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setNavigated(true); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { if (navigated && rows[hi]) pick(rows[hi].label); else setFocus(false); }
          else if (e.key === "Escape") { e.stopPropagation(); setFocus(false); }
        }}
        className="h-9 rounded-lg shadow-sm focus-visible:border-brand" role="combobox" aria-expanded={show} aria-autocomplete="list" />
      {show && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
          {rows.map((r, i) => (
            <li key={(r.add ? "+" : "") + r.label} role="option" aria-selected={i === hi}
              onMouseDown={(e) => { e.preventDefault(); pick(r.label); }} onMouseEnter={() => setHi(i)}
              className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors", i === hi ? "bg-brand/10 text-foreground" : "text-foreground/85")}>
              {r.add ? <Plus className="size-3.5 text-brand" /> : <Sparkles className="size-3.5 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate">{r.add ? <>Add “{r.label}”</> : r.label}</span>
              {r.add ? <span className="text-[10.5px] font-bold text-muted-foreground">saved for later</span>
                : r.label.toLowerCase() === q.toLowerCase() && <Check className="size-3.5 text-brand" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
