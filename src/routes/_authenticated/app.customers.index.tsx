import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Loader2, Trash2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createCustomer,
  deleteCustomer,
  listCustomers,
  type CustomerRow,
} from "@/lib/customers.functions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/customers/")({
  component: CustomersPage,
  head: () => ({
    meta: [
      { title: "Customers · Branta Tech Console" },
      {
        name: "description",
        content:
          "All active customers — manually added or auto-imported from converted leads.",
      },
    ],
  }),
});

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function CustomersPage() {
  const qc = useQueryClient();
  const list = useServerFn(listCustomers);
  const create = useServerFn(createCustomer);
  const remove = useServerFn(deleteCustomer);
  const confirm = useConfirm();

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    role: "",
    company: "",
    email: "",
    phone: "",
    source: "",
    service: "",
    currency: "BDT" as "BDT" | "USD",
    notes: "",
  });

  const query = useQuery({
    queryKey: ["customers", "list"],
    queryFn: () => list(),
    staleTime: 15_000,
  });

  const createMut = useMutation({
    mutationFn: async () =>
      create({
        data: {
          ...form,
          email: form.email || null,
          role: form.role || null,
          company: form.company || null,
          phone: form.phone || null,
          source: form.source || null,
          service: form.service || null,
          notes: form.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Customer added");
      setOpen(false);
      setForm({
        name: "",
        role: "",
        company: "",
        email: "",
        phone: "",
        source: "",
        service: "",
        currency: "BDT",
        notes: "",
      });
      qc.invalidateQueries({ queryKey: ["customers", "list"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Customer removed");
      qc.invalidateQueries({ queryKey: ["customers", "list"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const rows: CustomerRow[] = query.data ?? [];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.name, r.company, r.email, r.phone, r.customer_code]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [rows, q]);

  return (
    <div className="flex h-full flex-col">
      <header className="hairline-b flex items-center gap-3 px-4 py-3">
        <Building2 className="size-4 text-muted-foreground" />
        <h1 className="text-[15px] font-bold">Customers</h1>
        <span className="text-[12px] text-muted-foreground">{rows.length} total</span>
        <div className="relative ml-auto w-72">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="h-8 pl-7 text-[13px]"
          />
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> New customer
        </Button>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {query.isLoading ? (
          <div className="grid h-40 place-items-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid h-40 place-items-center text-[13px] text-muted-foreground">
            No customers yet. Leads with status "Converted" appear here automatically.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((r, idx) => {
              const fromLead = !!r.converted_from_lead_id;
              // Alternate accent so the grid feels colorful without being noisy.
              const palette = [
                "#E56A17", // brand orange
                "#2563EB", // blue
                "#10B981", // emerald
                "#8B5CF6", // violet
                "#EC4899", // pink
                "#F59E0B", // amber
              ];
              const accent = palette[(r.customer_code.charCodeAt(r.customer_code.length - 1) || idx) % palette.length];
              const primaryLabel = r.company?.trim() || r.name;
              const attribution = fromLead
                ? r.converter_name
                  ? `Converted by ${r.converter_name}`
                  : "Converted from lead"
                : r.creator_name
                  ? `Created by ${r.creator_name}`
                  : "Manually created";
              return (
                <div
                  key={r.id}
                  style={{
                    animationDelay: `${Math.min(idx, 12) * 30}ms`,
                    ["--card-accent" as string]: accent,
                  }}
                  className={cn(
                    "group relative flex animate-fade-in flex-col overflow-hidden rounded-lg border border-border bg-card p-4 transition-all duration-300",
                    "hover:-translate-y-1 hover:border-[color:var(--card-accent)]/50",
                    "hover:shadow-[0_12px_32px_-16px_color-mix(in_oklab,var(--card-accent)_60%,transparent)]",
                  )}
                >
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-1 transition-all duration-300 group-hover:h-1.5"
                    style={{
                      background: `linear-gradient(90deg, var(--card-accent), color-mix(in oklab, var(--card-accent) 40%, transparent))`,
                    }}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-40"
                    style={{ background: "var(--card-accent)" }}
                  />

                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to="/app/customers/$code"
                      params={{ code: r.customer_code }}
                      className="font-mono text-[11.5px] font-semibold text-[color:var(--card-accent)] hover:underline"
                    >
                      {r.customer_code}
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Delete ${r.customer_code}?`,
                          description: `${r.name} will be removed from customers. This cannot be undone.`,
                          confirmLabel: "Delete",
                          tone: "danger",
                        });
                        if (ok) deleteMut.mutate(r.id);
                      }}
                    >
                      <Trash2 className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>

                  <div className="mt-2 flex items-center gap-3">
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-bold text-primary-foreground shadow-sm transition-transform duration-300 group-hover:scale-110"
                      style={{
                        background: `linear-gradient(135deg, var(--card-accent), color-mix(in oklab, var(--card-accent) 45%, #000))`,
                      }}
                    >
                      {primaryLabel
                        .split(/\s+/)
                        .map((p) => p[0]?.toUpperCase())
                        .join("")
                        .slice(0, 2) || "—"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/app/customers/$code"
                        params={{ code: r.customer_code }}
                        className="block truncate text-[14px] font-semibold text-foreground transition-colors group-hover:text-[color:var(--card-accent)]"
                      >
                        {primaryLabel}
                      </Link>
                      <div className="truncate text-[12px] text-muted-foreground">
                        {attribution}
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-[11px] text-muted-foreground">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
                        fromLead
                          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-600"
                          : "border-border bg-muted/60",
                      )}
                    >
                      {fromLead
                        ? r.converted_from_lead_slug
                          ? `From ${r.converted_from_lead_slug}`
                          : "From lead"
                        : "Manual"}
                    </span>
                    <span className="font-mono">{relTime(r.created_at)}</span>
                  </div>
                </div>
              );
            })}

          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New customer</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-[11px] text-muted-foreground">Name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Role</label>
              <Input
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Company</label>
              <Input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Email</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Phone</label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Source</label>
              <Input
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="e.g. referral, website"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Service</label>
              <Input
                value={form.service}
                onChange={(e) => setForm({ ...form, service: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Currency</label>
              <Select
                value={form.currency}
                onValueChange={(v) => setForm({ ...form, currency: v as "BDT" | "USD" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BDT">BDT</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-[11px] text-muted-foreground">Notes</label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={!form.name.trim() || createMut.isPending}
            >
              {createMut.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
