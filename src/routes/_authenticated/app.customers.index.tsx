import { createFileRoute } from "@tanstack/react-router";
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

      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <div className="grid h-40 place-items-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid h-40 place-items-center text-[13px] text-muted-foreground">
            No customers yet. Leads with status "Converted" appear here automatically.
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="hairline-b sticky top-0 bg-card text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Code</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Company</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Phone</th>
                <th className="px-4 py-2 text-left">Source</th>
                <th className="px-4 py-2 text-left">Origin</th>
                <th className="px-4 py-2 text-left">Added</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="hairline-b hover:bg-muted/40">
                  <td className="px-4 py-2 font-mono text-[12px]">{r.customer_code}</td>
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2">{r.company ?? "—"}</td>
                  <td className="px-4 py-2">{r.email ?? "—"}</td>
                  <td className="px-4 py-2">{r.phone ?? "—"}</td>
                  <td className="px-4 py-2">{r.source ?? "—"}</td>
                  <td className="px-4 py-2 text-[12px] text-muted-foreground">
                    {r.converted_from_lead_id ? "From lead" : "Manual"}
                  </td>
                  <td className="px-4 py-2 text-[12px] text-muted-foreground">
                    {relTime(r.created_at)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
