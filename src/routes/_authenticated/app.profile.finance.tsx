import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  Check,
  Plus,
  Trash2,
  Star,
  Landmark,
  Smartphone,
  Wallet,
} from "lucide-react";
import {
  getMyProfile,
  updateMyProfile,
  type PaymentMethod,
} from "@/lib/profile.functions";
import { BD_BANKS, BD_MFS_PROVIDERS } from "@/lib/bd-banks";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/profile/finance")({
  head: () => ({ meta: [{ title: "Finance & Wallet · Profile" }] }),
  component: FinanceTab,
});

function FinanceTab() {
  const fetchProfile = useServerFn(getMyProfile);
  const update = useServerFn(updateMyProfile);
  const q = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => fetchProfile(),
    staleTime: 15_000,
  });

  const userId = q.data?.profile.user_id;
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`profile:${userId}:finance`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${userId}` },
        () => void q.refetch(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, q]);

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  useEffect(() => {
    if (q.data) setMethods(q.data.profile.payment_methods ?? []);
  }, [q.data]);

  const dirty = useMemo(
    () =>
      q.data
        ? JSON.stringify(methods) !==
          JSON.stringify(q.data.profile.payment_methods ?? [])
        : false,
    [methods, q.data],
  );

  const save = useMutation({
    mutationFn: async () => {
      const p = q.data!.profile;
      await update({
        data: {
          full_name: p.full_name,
          legal_full_name: p.legal_full_name,
          phone_primary: p.phone_primary,
          phone_alt: p.phone_alt,
          address_line1: p.address_line1,
          address_line2: p.address_line2,
          division: p.division,
          district: p.district,
          upazila: p.upazila,
          post_office: p.post_office,
          city: p.city,
          postcode: p.postcode,
          country: p.country,
          bank_name: p.bank_name,
          bank_account_name: p.bank_account_name,
          bank_account_number: p.bank_account_number,
          bank_routing: p.bank_routing,
          mfs_provider: p.mfs_provider,
          mfs_number: p.mfs_number,
          payment_methods: methods,
          avatar_url: p.avatar_url,
          nid_url: p.nid_url,
          cv_url: p.cv_url,
          identity_doc_type: p.identity_doc_type,
          nid_front_url: p.nid_front_url,
          nid_back_url: p.nid_back_url,
          passport_photo_url: p.passport_photo_url,
          passport_address_url: p.passport_address_url,
          birth_certificate_url: p.birth_certificate_url,
          personal_gmail: p.personal_gmail,
        },
      });
    },
    onSuccess: () => {
      toast.success("Payment methods updated");
      void q.refetch();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const primary = methods.find((m) => m.is_primary);
  const primaryLabel =
    primary
      ? primary.kind === "bank"
        ? `${primary.bank_name ?? "Bank"} · ${primary.account_number ?? ""}`
        : `${primary.mfs_provider ?? "MFS"} · ${primary.mfs_number ?? ""}`
      : "No primary account";

  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-6 py-8">
        <div className="h-40 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-6 py-8">
      {/* Wallet placeholder */}
      <section className="overflow-hidden rounded-md border border-border bg-gradient-to-br from-brand/5 to-transparent">
        <div className="flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-3">
          <div>
            <h2 className="text-[13px] font-semibold text-foreground">Wallet</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Your Branta Tech wallet — coming next. Withdrawals will route to
              the primary account below.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-sm border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-amber-800">
            Coming soon
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
          <div className="rounded-md border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Wallet className="size-3" /> Available balance
            </div>
            <div className="mt-1 font-mono text-[22px] font-semibold text-foreground">
              ৳ 0.00
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Pending withdrawals
            </div>
            <div className="mt-1 font-mono text-[22px] font-semibold text-muted-foreground">
              ৳ 0.00
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Payout to
            </div>
            <div className="mt-1 truncate text-[13.5px] font-medium text-foreground">
              {primaryLabel}
            </div>
          </div>
        </div>
      </section>

      {/* Payment Methods */}
      <section className="rounded-md border border-border bg-card">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-3">
          <div>
            <h2 className="text-[13px] font-semibold text-foreground">
              Payment Methods
            </h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Bank or Mobile-Financial-Service accounts. Mark one as primary —
              payroll and reimbursements use it first.
            </p>
          </div>
          <Button
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            className="h-9 rounded-sm bg-primary text-primary-foreground hover:bg-brand-700"
          >
            {save.isPending ? (
              <><Loader2 className="mr-1.5 size-3.5 animate-spin" />Saving…</>
            ) : (
              "Save changes"
            )}
          </Button>
        </header>
        <div className="p-5">
          <PaymentMethodsBlock methods={methods} onChange={setMethods} />
        </div>
      </section>
    </div>
  );
}

// ---------- Primitives ----------
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
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function newPmId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function PaymentMethodsBlock({
  methods,
  onChange,
}: {
  methods: PaymentMethod[];
  onChange: (next: PaymentMethod[]) => void;
}) {
  const update = (id: string, patch: Partial<PaymentMethod>) =>
    onChange(methods.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const remove = (id: string) => {
    const next = methods.filter((m) => m.id !== id);
    if (next.length > 0 && !next.some((m) => m.is_primary)) {
      next[0] = { ...next[0]!, is_primary: true };
    }
    onChange(next);
  };
  const setPrimary = (id: string) =>
    onChange(methods.map((m) => ({ ...m, is_primary: m.id === id })));
  const add = (kind: "bank" | "mfs") => {
    const method: PaymentMethod = {
      id: newPmId(),
      kind,
      is_primary: methods.length === 0,
      bank_name: null,
      account_holder: null,
      account_number: null,
      branch: null,
      mfs_provider: null,
      mfs_number: null,
    };
    onChange([...methods, method]);
  };

  return (
    <div className="space-y-3">
      {methods.length === 0 && (
        <div className="rounded-sm border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-[12px] text-muted-foreground">
          No payment methods yet. Add a bank account or an MFS wallet below.
        </div>
      )}
      {methods.map((m) => (
        <PaymentMethodCard
          key={m.id}
          method={m}
          onPatch={(p) => update(m.id, p)}
          onRemove={() => remove(m.id)}
          onMakePrimary={() => setPrimary(m.id)}
        />
      ))}
      <div className="flex items-center gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={() => add("bank")} className="h-8 rounded-sm text-[12px]">
          <Plus className="mr-1.5 size-3" /><Landmark className="mr-1.5 size-3.5" />Add Bank
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => add("mfs")} className="h-8 rounded-sm text-[12px]">
          <Plus className="mr-1.5 size-3" /><Smartphone className="mr-1.5 size-3.5" />Add MFS
        </Button>
      </div>
    </div>
  );
}

function PaymentMethodCard({
  method,
  onPatch,
  onRemove,
  onMakePrimary,
}: {
  method: PaymentMethod;
  onPatch: (patch: Partial<PaymentMethod>) => void;
  onRemove: () => void;
  onMakePrimary: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-card p-4 transition-colors",
        method.is_primary ? "border-brand ring-1 ring-brand/30" : "border-border",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-sm border border-border p-0.5 text-[11px]">
            <button type="button" onClick={() => onPatch({ kind: "bank" })}
              className={cn("rounded-[3px] px-2 py-0.5", method.kind === "bank" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
              Bank
            </button>
            <button type="button" onClick={() => onPatch({ kind: "mfs" })}
              className={cn("rounded-[3px] px-2 py-0.5", method.kind === "mfs" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
              MFS
            </button>
          </div>
          {method.is_primary && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-brand/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand">
              <Star className="size-3 fill-current" /> Primary
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!method.is_primary && (
            <Button type="button" variant="ghost" size="sm" onClick={onMakePrimary} className="h-7 rounded-sm text-[11px]">
              <Star className="mr-1 size-3" /> Make primary
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="h-7 rounded-sm text-[11px] text-red-600 hover:bg-red-50 hover:text-red-700">
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      {method.kind === "bank" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Bank Name *">
            <SearchableSelect value={method.bank_name ?? null} onChange={(v) => onPatch({ bank_name: v })} options={BD_BANKS} placeholder="Search Bangladeshi banks…" />
          </Field>
          <Field label="Account Holder Name *">
            <Input className="h-9 rounded-sm" value={method.account_holder ?? ""} onChange={(e) => onPatch({ account_holder: e.target.value })} />
          </Field>
          <Field label="Account Number *">
            <Input className="h-9 rounded-sm font-mono text-[12px]" value={method.account_number ?? ""} onChange={(e) => onPatch({ account_number: e.target.value })} />
          </Field>
          <Field label="Branch *">
            <Input className="h-9 rounded-sm" value={method.branch ?? ""} onChange={(e) => onPatch({ branch: e.target.value })} placeholder="e.g. Gulshan, Dhaka" />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="MFS Provider *">
            <SearchableSelect value={method.mfs_provider ?? null} onChange={(v) => onPatch({ mfs_provider: v })} options={BD_MFS_PROVIDERS} placeholder="Select MFS provider…" />
          </Field>
          <Field label="Account Holder Name *">
            <Input className="h-9 rounded-sm" value={method.account_holder ?? ""} onChange={(e) => onPatch({ account_holder: e.target.value })} />
          </Field>
          <Field label="MFS Number *" className="md:col-span-2">
            <Input className="h-9 rounded-sm font-mono text-[12px]" value={method.mfs_number ?? ""} onChange={(e) => onPatch({ mfs_number: e.target.value })} placeholder="01XXXXXXXXX" inputMode="numeric" />
          </Field>
        </div>
      )}
    </div>
  );
}

function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: string[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => o.toLowerCase().includes(n)) : options;
  }, [q, options]);
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-sm border border-input bg-background px-2.5 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className={cn(!value && "text-muted-foreground")}>{value ?? placeholder}</span>
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-sm border border-border bg-popover shadow-md">
          <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
            <Search className="size-3.5 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" className="h-7 w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground" />
          </div>
          <div className="max-h-60 overflow-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">No matches</div>
            )}
            {filtered.map((o) => {
              const selected = o === value;
              return (
                <button
                  type="button" key={o}
                  onClick={() => { onChange(o); setOpen(false); setQ(""); }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-accent",
                    selected && "bg-accent",
                  )}
                >
                  <span>{o}</span>
                  {selected && <Check className="size-3.5 text-brand" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
