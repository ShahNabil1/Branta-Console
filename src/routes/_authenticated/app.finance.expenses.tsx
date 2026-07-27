import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  listExpenses,
  createExpense,
  deleteExpense,
  isFinanceAdminCheck,
  type ExpenseCategory,
  type Currency,
} from "@/lib/finance.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Loader2, Plus, Trash2, Receipt, Upload, Eye, Download, X, FileText } from "lucide-react";

const RECEIPT_BUCKET = "expense-receipts";
const MAX_RECEIPT_MB = 15;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

function isImagePath(p: string | null | undefined) {
  if (!p) return false;
  return /\.(png|jpe?g|webp|gif|heic|avif)$/i.test(p);
}
function isPdfPath(p: string | null | undefined) {
  return !!p && /\.pdf$/i.test(p);
}
async function signedUrl(path: string, expires = 300) {
  const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, expires);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
async function signedDownloadUrl(path: string, filename?: string) {
  const { data, error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(path, 300, { download: filename ?? true });
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export const Route = createFileRoute("/_authenticated/app/finance/expenses")({
  head: () => ({ meta: [{ title: "Expenses · Finance · Branta" }] }),
  component: ExpensesPage,
});

const CATEGORIES: ExpenseCategory[] = ["salary", "tools", "ads", "office", "misc", "tax", "refund"];

function fmt(n: number, cur: string) {
  return (cur === "BDT" ? "৳ " : "$ ") + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

function ExpensesPage() {
  const listFn = useServerFn(listExpenses);
  const create = useServerFn(createExpense);
  const del = useServerFn(deleteExpense);
  const check = useServerFn(isFinanceAdminCheck);
  const confirm = useConfirm();
  const isAdmin = useQuery({ queryKey: ["is-finance-admin"], queryFn: () => check(), staleTime: 60_000 });
  const q = useQuery({
    queryKey: ["expenses"], queryFn: () => listFn(), staleTime: 15_000,
    enabled: !!isAdmin.data?.isAdmin,
  });

  useEffect(() => {
    const ch = supabase.channel("expenses").on("postgres_changes",
      { event: "*", schema: "public", table: "expenses" }, () => void q.refetch()).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [q]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: "office" as ExpenseCategory,
    amount: "",
    currency: "BDT" as Currency,
    spent_on: new Date().toISOString().slice(0, 10),
    vendor: "",
    notes: "",
  });

  const add = useMutation({
    mutationFn: async () => {
      await create({ data: {
        category: form.category,
        amount: Number(form.amount),
        currency: form.currency,
        spent_on: form.spent_on,
        vendor: form.vendor || null,
        notes: form.notes || null,
      }});
    },
    onSuccess: () => {
      toast.success("Expense added");
      setOpen(false);
      setForm({ ...form, amount: "", vendor: "", notes: "" });
      void q.refetch();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isAdmin.isLoading) return <div className="grid h-64 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (!isAdmin.data?.isAdmin) {
    return <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <Receipt className="mx-auto mb-3 size-8 text-muted-foreground" />
      <h1 className="text-[18px] font-semibold">Finance-only page</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">Finance or Super-admin role required.</p>
    </div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-foreground">Expenses</h1>
          <p className="text-[12.5px] text-muted-foreground">Track company outflow — reflected in the dashboard.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="h-9 rounded-sm bg-primary hover:bg-brand-700">
          <Plus className="mr-1.5 size-3.5" /> Add expense
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <table className="w-full text-[12.5px]">
          <thead className="border-b border-border bg-muted/30 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Notes</th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">No expenses yet.</td></tr>
            ) : q.data?.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">{r.spent_on}</td>
                <td className="px-3 py-2 capitalize">{r.category}</td>
                <td className="px-3 py-2">{r.vendor ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.amount, r.currency)}</td>
                <td className="px-3 py-2 text-muted-foreground truncate max-w-xs">{r.notes ?? ""}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={async () => {
                    const ok = await confirm({ title: "Delete expense", description: "This cannot be undone.", tone: "danger" });
                    if (!ok) return;
                    await del({ data: { id: r.id } });
                    toast.success("Deleted");
                    void q.refetch();
                  }} className="h-7 rounded-sm text-rose-600 hover:bg-rose-50">
                    <Trash2 className="size-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4">
          <div className="w-full max-w-md rounded-md border border-border bg-card p-5 shadow-lg">
            <h3 className="text-[14px] font-semibold">Add expense</h3>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
                    className="mt-1 h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px] capitalize">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Currency</label>
                  <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}
                    className="mt-1 h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
                    <option value="BDT">BDT</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Amount</label>
                  <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="mt-1 h-9 rounded-sm font-mono" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Date</label>
                  <Input type="date" value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })}
                    className="mt-1 h-9 rounded-sm" />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground">Vendor</label>
                <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                  className="mt-1 h-9 rounded-sm" placeholder="e.g. Figma, Google Ads, GP" />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground">Notes</label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1 h-9 rounded-sm" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} className="h-9 rounded-sm">Cancel</Button>
              <Button onClick={() => add.mutate()} disabled={add.isPending || !form.amount}
                className="h-9 rounded-sm bg-primary hover:bg-brand-700">
                {add.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
