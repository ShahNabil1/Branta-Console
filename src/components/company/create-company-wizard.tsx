import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Building2, Check, ChevronsUpDown, Crown, Loader2, Sparkles, UserCog, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CreateCompanySchema, createCompany, listCompanyLeaderOptions, type PersonLite } from "@/lib/companies.functions";
import { CompanyAvatar, PersonChip } from "./company-avatar";
import { slugify } from "@/lib/companies.functions";
import { cn } from "@/lib/utils";

type Form = { name: string; email: string; phone: string; address: string; website_url: string; ceo_user_id: string; coo_user_id: string };
const EMPTY: Form = { name: "", email: "", phone: "", address: "", website_url: "", ceo_user_id: "", coo_user_id: "" };
const STEPS = [
  { key: "basic", label: "Basic info", icon: Building2 },
  { key: "lead", label: "Leadership", icon: Crown },
  { key: "review", label: "Review", icon: Sparkles },
] as const;

export function CreateCompanyWizard({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (slug: string) => void }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState(false);
  const qc = useQueryClient();
  const optsFn = useServerFn(listCompanyLeaderOptions);
  const createFn = useServerFn(createCompany);
  const opts = useQuery({ queryKey: ["company-leader-options"], queryFn: () => optsFn(), enabled: open, staleTime: 60_000 });
  const people = opts.data ?? [];
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  const parsed = CreateCompanySchema.safeParse({ ...f, coo_user_id: f.coo_user_id || null });
  const errs: Partial<Record<keyof Form, string>> = {};
  if (!parsed.success) for (const i of parsed.error.issues) errs[i.path[0] as keyof Form] ??= i.message;
  if (f.coo_user_id && f.coo_user_id === f.ceo_user_id) errs.coo_user_id = "COO must be a different person";
  const stepOk = step === 0 ? !errs.name && !errs.email && !errs.phone && !errs.address && !errs.website_url
    : step === 1 ? !errs.ceo_user_id && !errs.coo_user_id : parsed.success && !errs.coo_user_id;

  const reset = () => { setStep(0); setF(EMPTY); setTouched(false); };
  const save = useMutation({
    mutationFn: () => createFn({ data: { ...f, coo_user_id: f.coo_user_id || null } as never }),
    onSuccess: (r) => {
      toast.success(`${f.name} created`, { description: "CEO & COO now have full access to this company." });
      qc.invalidateQueries({ queryKey: ["companies"] });
      onOpenChange(false); reset(); onCreated(r.slug);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const next = () => { setTouched(true); if (stepOk) { setTouched(false); setStep((s) => s + 1); } };
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const show = (k: keyof Form) => (touched ? errs[k] : undefined);

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setTimeout(reset, 250); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
        <div className="relative overflow-hidden border-b border-border px-6 pb-5 pt-6">
          <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-brand/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 top-6 size-40 rounded-full bg-status-viewed/10 blur-3xl" />
          <SheetTitle className="relative text-[18px] font-bold tracking-tight">Create a company</SheetTitle>
          <p className="relative mt-1 text-[12.5px] text-muted-foreground">Add a new sister concern under Branta Tech Group.</p>
          <ol className="relative mt-5 flex items-center gap-2">
            {STEPS.map((s, i) => {
              const done = i < step, cur = i === step;
              return (
                <li key={s.key} className="flex flex-1 items-center gap-2">
                  <button
                    type="button"
                    disabled={i > step}
                    onClick={() => setStep(i)}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition-all duration-300",
                      cur && "scale-105 border-brand bg-brand text-primary-foreground shadow-md shadow-brand/30",
                      done && "border-status-converted/40 bg-status-converted/10 text-status-converted hover:scale-105",
                      !cur && !done && "border-border bg-card text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="size-3.5" /> : <s.icon className="size-3.5" />}
                    <span className="hidden sm:inline">{s.label}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <span className="h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                      <span className={cn("block h-full bg-status-converted transition-all duration-500", done ? "w-full" : "w-0")} />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        <div key={step} className="flex-1 space-y-4 overflow-y-auto px-6 py-5 animate-in fade-in slide-in-from-right-4 duration-300">
          {step === 0 && (
            <>
              <Field label="Company name" required error={show("name")}>
                <Input autoFocus value={f.name} onChange={set("name")} placeholder="e.g. Deveror" className={inputCls} />
              </Field>
              <Field label="Official email" required error={show("email")}>
                <Input type="email" value={f.email} onChange={set("email")} placeholder="hello@company.com" className={inputCls} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Phone" hint="Optional" error={show("phone")}>
                  <Input value={f.phone} onChange={set("phone")} placeholder="+8801XXXXXXXXX" className={inputCls} />
                </Field>
                <Field label="Website" hint="Optional" error={show("website_url")}>
                  <Input value={f.website_url} onChange={set("website_url")} placeholder="https://company.com" className={inputCls} />
                </Field>
              </div>
              <Field label="Address" hint="Optional" error={show("address")}>
                <Textarea rows={3} value={f.address} onChange={set("address")} placeholder="Office address" className="text-[13.5px] font-medium" />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="CEO · Chief Executive Officer" required error={show("ceo_user_id")}>
                <PersonPicker people={people} loading={opts.isLoading} value={f.ceo_user_id} exclude={f.coo_user_id}
                  onChange={(v) => setF((p) => ({ ...p, ceo_user_id: v }))} icon={<Crown className="size-4 text-brand" />} />
              </Field>
              <Field label="COO · Chief Operating Officer" hint="Optional" error={show("coo_user_id") ?? (f.coo_user_id && errs.coo_user_id)}>
                <PersonPicker people={people} loading={opts.isLoading} value={f.coo_user_id} exclude={f.ceo_user_id} clearable
                  onChange={(v) => setF((p) => ({ ...p, coo_user_id: v }))} icon={<UserCog className="size-4 text-status-new" />} />
              </Field>
            </>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
                <CompanyAvatar name={f.name} slug={slugify(f.name)} className="size-12 text-[15px]" />
                <div className="min-w-0">
                  <div className="truncate text-[16px] font-bold">{f.name}</div>
                  <div className="truncate font-mono text-[12px] text-muted-foreground">{f.email}</div>
                </div>
                <button type="button" onClick={() => setStep(0)} className="ml-auto text-[11.5px] font-bold text-brand hover:underline">Edit</button>
              </div>
              <ReviewCard title="Basic info" onEdit={() => setStep(0)} rows={[
                ["Phone", f.phone || "—"], ["Website", f.website_url || "—"], ["Address", f.address || "—"],
              ]} />
              <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Leadership</span>
                  <button type="button" onClick={() => setStep(1)} className="text-[11.5px] font-bold text-brand hover:underline">Edit</button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <LeaderTile role="CEO" p={byId.get(f.ceo_user_id)} />
                  <LeaderTile role="COO" p={f.coo_user_id ? byId.get(f.coo_user_id) : undefined} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-muted/40 px-6 py-3.5">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="gap-1.5 transition-transform active:scale-95">
              <ArrowLeft className="size-4" /> Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          )}
          <span className="ml-auto text-[11px] font-semibold text-muted-foreground">Step {step + 1} of 3</span>
          {step < 2 ? (
            <Button onClick={next} className="gap-1.5 shadow-md shadow-brand/25 transition-all hover:-translate-y-px active:scale-95">
              Next <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={() => save.mutate()} disabled={save.isPending || !stepOk} className="gap-1.5 shadow-md shadow-brand/25 transition-all hover:-translate-y-px active:scale-95">
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save company
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const inputCls = "h-10 text-[13.5px] font-medium";

function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string | false; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold">
        {label}{required && <span className="text-brand">*</span>}
        {hint && <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">{hint}</span>}
      </span>
      <span className={cn("block", error && "animate-shake [&_input]:border-destructive [&_button]:border-destructive")}>{children}</span>
      {error && <span className="mt-1 block text-[11.5px] font-semibold text-destructive animate-in fade-in">{error}</span>}
    </label>
  );
}

function PersonPicker({ people, loading, value, exclude, onChange, clearable, icon }: {
  people: PersonLite[]; loading: boolean; value: string; exclude?: string; onChange: (v: string) => void; clearable?: boolean; icon: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const sel = people.find((p) => p.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-12 w-full items-center gap-2.5 rounded-md border border-input bg-card px-3 text-left shadow-sm transition-all hover:border-brand/50 hover:shadow-md data-[state=open]:border-brand data-[state=open]:ring-2 data-[state=open]:ring-brand/20">
          {icon}
          {sel ? <PersonChip name={sel.full_name || sel.email} avatar={sel.avatar_url} role={sel.job_role ?? sel.employee_code ?? undefined} />
            : <span className="text-[13px] font-medium text-muted-foreground">{loading ? "Loading employees…" : "Select an employee"}</span>}
          <span className="ml-auto flex items-center gap-1">
            {clearable && sel && (
              <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onChange(""); }} className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="size-3.5" />
              </span>
            )}
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search name, email or ID…" />
          <CommandList>
            <CommandEmpty>No employee found.</CommandEmpty>
            <CommandGroup>
              {people.filter((p) => p.id !== exclude).map((p) => (
                <CommandItem key={p.id} value={`${p.full_name} ${p.email} ${p.employee_code}`} onSelect={() => { onChange(p.id); setOpen(false); }} className="gap-2 py-2">
                  <PersonChip name={p.full_name || p.email} avatar={p.avatar_url} />
                  <span className="ml-auto truncate font-mono text-[10.5px] text-muted-foreground">{p.email}</span>
                  {p.id === value && <Check className="size-4 text-brand" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ReviewCard({ title, rows, onEdit }: { title: string; rows: [string, string][]; onEdit: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</span>
        <button type="button" onClick={onEdit} className="text-[11.5px] font-bold text-brand hover:underline">Edit</button>
      </div>
      <dl className="divide-y divide-border">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 py-2 text-[12.5px]">
            <dt className="w-20 shrink-0 font-semibold text-muted-foreground">{k}</dt>
            <dd className={cn("min-w-0 break-words font-semibold", v === "—" && "text-muted-foreground")}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LeaderTile({ role, p }: { role: string; p?: PersonLite }) {
  return (
    <div className={cn("rounded-md border p-3", p ? "border-brand/25 bg-brand/5" : "border-dashed border-border")}>
      {p ? <PersonChip name={p.full_name || p.email} avatar={p.avatar_url} role={`${role} · Super admin`} />
        : <span className="text-[12px] font-semibold text-muted-foreground">{role} · not assigned</span>}
    </div>
  );
}
