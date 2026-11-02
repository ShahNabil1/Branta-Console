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
  Pencil,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { MyWalletPanel } from "@/components/profile/my-wallet-panel";
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

  const methods = q.data?.profile.payment_methods ?? [];

  const save = useMutation({
    mutationFn: async ({ next }: { next: PaymentMethod[]; msg: string }) => {
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
          payment_methods: next,
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
    onSuccess: (_d, v) => {
      toast.success(v.msg);
      void q.refetch();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (q.isLoading) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4 px-3 py-5 sm:px-6 sm:py-8">
        <div className="h-40 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4 px-3 py-5 sm:px-6 sm:py-8">
      <MyWalletPanel />

      <section className="rounded-md border border-border bg-card">
        <header className="border-b border-border px-5 py-3">
          <h2 className="text-[13px] font-semibold text-foreground">Payment Methods</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Bank or Mobile-Financial-Service accounts. Mark one as primary —
            payroll and reimbursements use it first.
          </p>
        </header>
        <div className="p-5">
          <PaymentMethodsBlock
            methods={methods}
            saving={save.isPending}
            onSave={async (next, msg) => {
              await save.mutateAsync({ next, msg });
            }}
          />
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

function pmValid(m: PaymentMethod) {
  return m.kind === "bank"
    ? !!(m.bank_name && m.account_holder?.trim() && m.account_number?.trim() && m.branch?.trim())
    : !!(m.mfs_provider && m.account_holder?.trim() && /^01[3-9]\d{8}$/.test(m.mfs_number ?? ""));
}

function Confirm({
  open, title, body, action, destructive, onCancel, onConfirm,
}: {
  open: boolean; title: string; body: string; action: string; destructive?: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PaymentMethodsBlock({
  methods,
  onSave,
  saving,
}: {
  methods: PaymentMethod[];
  onSave: (next: PaymentMethod[], msg: string) => Promise<void>;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<PaymentMethod | null>(null);
  const add = (kind: "bank" | "mfs") =>
    setDraft({
      id: newPmId(), kind, is_primary: methods.length === 0,
      bank_name: null, account_holder: null, account_number: null, branch: null,
      mfs_provider: null, mfs_number: null,
    });

  return (
    <div className="space-y-3">
      {methods.length === 0 && !draft && (
        <div className="rounded-sm border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-[12px] text-muted-foreground">
          No payment methods yet. Add a bank account or an MFS wallet below.
        </div>
      )}
      {methods.map((m) => (
        <PaymentMethodCard
          key={m.id}
          method={m}
          saving={saving}
          onSave={(p) => onSave(methods.map((x) => (x.id === m.id ? p : x)), "Payment method updated")}
          onRemove={() => {
            const next = methods.filter((x) => x.id !== m.id);
            if (next.length && !next.some((x) => x.is_primary)) next[0] = { ...next[0]!, is_primary: true };
            return onSave(next, "Payment method deleted");
          }}
          onMakePrimary={() =>
            onSave(methods.map((x) => ({ ...x, is_primary: x.id === m.id })), "Primary method updated")
          }
        />
      ))}
      {draft && (
        <PaymentMethodCard
          method={draft}
          isNew
          saving={saving}
          onCancelNew={() => setDraft(null)}
          onSave={async (p) => {
            await onSave([...methods, p], "Payment method added");
            setDraft(null);
          }}
        />
      )}
      {!draft && (
        <div className="flex items-center gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={() => add("bank")} className="h-9 rounded-sm text-[12.5px] font-semibold">
            <Plus className="mr-1.5 size-3.5" /><Landmark className="mr-1.5 size-3.5" />Add Bank
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => add("mfs")} className="h-9 rounded-sm text-[12.5px] font-semibold">
            <Plus className="mr-1.5 size-3.5" /><Smartphone className="mr-1.5 size-3.5" />Add MFS
          </Button>
        </div>
      )}
    </div>
  );
}

function ViewRow({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className={cn("text-[13px] font-medium text-foreground", mono && "font-mono")}>{value || "—"}</div>
    </div>
  );
}

function PaymentMethodCard({
  method,
  isNew,
  saving,
  onSave,
  onRemove,
  onMakePrimary,
  onCancelNew,
}: {
  method: PaymentMethod;
  isNew?: boolean;
  saving: boolean;
  onSave: (m: PaymentMethod) => Promise<void>;
  onRemove?: () => Promise<void>;
  onMakePrimary?: () => Promise<void>;
  onCancelNew?: () => void;
}) {
  const [editing, setEditing] = useState(!!isNew);
  const [d, setD] = useState<PaymentMethod>(method);
  const [confirm, setConfirm] = useState<null | "delete" | "primary">(null);
  useEffect(() => {
    if (!editing) setD(method);
  }, [method, editing]);
  const onPatch = (p: Partial<PaymentMethod>) => setD((x) => ({ ...x, ...p }));
  const dirty = isNew || JSON.stringify(d) !== JSON.stringify(method);
  const cancel = () => (isNew ? onCancelNew?.() : (setD(method), setEditing(false)));
  const save = async () => {
    try {
      await onSave(d);
      setEditing(false);
    } catch {
      /* toast shown by mutation */
    }
  };
  const m = editing ? d : method;

  return (
    <div
      className={cn(
        "rounded-md border bg-card p-4 transition-colors",
        method.is_primary && !isNew ? "border-brand ring-1 ring-brand/30" : "border-border",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {editing && isNew ? (
            <div className="inline-flex items-center gap-1 rounded-sm border border-border p-0.5 text-[11px]">
              {(["bank", "mfs"] as const).map((k) => (
                <button key={k} type="button" onClick={() => onPatch({ kind: k })}
                  className={cn("rounded-[3px] px-2 py-0.5 font-semibold", m.kind === k ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                  {k === "bank" ? "Bank" : "MFS"}
                </button>
              ))}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
              {m.kind === "bank" ? <Landmark className="size-4" /> : <Smartphone className="size-4" />}
              {m.kind === "bank" ? m.bank_name || "Bank account" : m.mfs_provider || "MFS wallet"}
            </span>
          )}
          {method.is_primary && !isNew && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-brand/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand">
              <Star className="size-3 fill-current" /> Primary
            </span>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-1.5">
            {!method.is_primary && (
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setConfirm("primary")} className="h-7 rounded-sm text-[11.5px] font-semibold">
                <Star className="mr-1 size-3" /> Make primary
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)} className="h-7 rounded-sm text-[11.5px] font-semibold">
              <Pencil className="mr-1 size-3" /> Edit
            </Button>
          </div>
        )}
      </div>

      {!editing ? (
        m.kind === "bank" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ViewRow label="Account Holder" value={m.account_holder} />
            <ViewRow label="Account Number" value={m.account_number} mono />
            <ViewRow label="Branch" value={m.branch} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ViewRow label="Account Holder" value={m.account_holder} />
            <ViewRow label="MFS Number" value={m.mfs_number} mono />
          </div>
        )
      ) : (
        <>
          {m.kind === "bank" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Bank Name *">
                <SearchableSelect value={m.bank_name ?? null} onChange={(v) => onPatch({ bank_name: v })} options={BD_BANKS} placeholder="Search Bangladeshi banks…" />
              </Field>
              <Field label="Account Holder Name *">
                <Input className="h-9 rounded-sm" value={m.account_holder ?? ""} onChange={(e) => onPatch({ account_holder: e.target.value })} />
              </Field>
              <Field label="Account Number *">
                <Input className="h-9 rounded-sm font-mono text-[12px]" value={m.account_number ?? ""} onChange={(e) => onPatch({ account_number: e.target.value })} />
              </Field>
              <Field label="Branch *">
                <Input className="h-9 rounded-sm" value={m.branch ?? ""} onChange={(e) => onPatch({ branch: e.target.value })} placeholder="e.g. Gulshan, Dhaka" />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="MFS Provider *">
                <SearchableSelect value={m.mfs_provider ?? null} onChange={(v) => onPatch({ mfs_provider: v })} options={BD_MFS_PROVIDERS} placeholder="Select MFS provider…" />
              </Field>
              <Field label="Account Holder Name *">
                <Input className="h-9 rounded-sm" value={m.account_holder ?? ""} onChange={(e) => onPatch({ account_holder: e.target.value })} />
              </Field>
              <Field label="MFS Number *" className="md:col-span-2">
                <Input className="h-9 rounded-sm font-mono text-[12px]" value={m.mfs_number ?? ""} onChange={(e) => onPatch({ mfs_number: e.target.value.replace(/\D/g, "").slice(0, 11) })} placeholder="01XXXXXXXXX" inputMode="numeric" />
              </Field>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
            {!isNew ? (
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setConfirm("delete")} className="h-8 rounded-sm text-[12px] font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="mr-1 size-3.5" /> Delete
              </Button>
            ) : <span />}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={saving} className="h-8 rounded-sm text-[12px]">
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={save} disabled={!dirty || !pmValid(d) || saving} className="h-8 rounded-sm text-[12px] font-semibold">
                {saving ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                {isNew ? "Save" : "Save changes"}
              </Button>
            </div>
          </div>
        </>
      )}

      <Confirm
        open={confirm === "primary"}
        title="Make this your primary method?"
        body="Payroll and reimbursements will be sent to this account first."
        action="Make primary"
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); void onMakePrimary?.().catch(() => {}); }}
      />
      <Confirm
        open={confirm === "delete"}
        title="Delete this payment method?"
        body={method.is_primary ? "This is your primary method. The next saved method will become primary." : "This account will be removed from your profile."}
        action="Delete"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); void onRemove?.().then(() => setEditing(false)).catch(() => {}); }}
      />
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
