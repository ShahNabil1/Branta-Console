import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  isFinanceAdminCheck,
  getSignedExpenseVoucherUrl,
  setExpenseSignedVoucher,
  listEmployeesForFinance,
  type ExpenseCategory,
  type Currency,
} from "@/lib/finance.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableItem } from "@/components/finance/searchable-select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Loader2, Plus, Trash2, Receipt, Upload, Eye, Download, X, FileText, Printer, Stamp, Pencil } from "lucide-react";

const DEPARTMENTS = ["Management", "Finance", "Sales & Outreach", "Marketing", "Production", "Development", "HR & Admin", "Operations", "Other"];
const PAYMENT_METHODS = ["Cash", "bKash", "Nagad", "Rocket", "Bank Transfer", "Card", "Cheque", "Other"];

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

async function uploadToBucket(file: File, prefix: string) {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id ?? "anon";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${prefix}${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(error.message);
  return path;
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
  const update = useServerFn(updateExpense);
  const del = useServerFn(deleteExpense);
  const check = useServerFn(isFinanceAdminCheck);
  const voucherUrlFn = useServerFn(getSignedExpenseVoucherUrl);
  const setSignedFn = useServerFn(setExpenseSignedVoucher);
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

  const listEmp = useServerFn(listEmployeesForFinance);
  const emps = useQuery({
    queryKey: ["finance-employees"], queryFn: () => listEmp(), staleTime: 60_000,
    enabled: !!isAdmin.data?.isAdmin,
  });
  const employeeItems: SearchableItem[] = (emps.data ?? []).map((e) => ({
    value: e.user_id,
    label: e.full_name ?? e.user_id.slice(0, 8),
    hint: e.employee_code ?? undefined,
    keywords: [e.full_name, e.employee_code, e.job_role],
  }));

  const emptyForm = {
    category: "office" as ExpenseCategory,
    amount: "",
    currency: "BDT" as Currency,
    spent_on: new Date().toISOString().slice(0, 10),
    vendor: "",
    notes: "",
    txn_id: "",
    payment_method: "",
    department: "",
    requested_by: "",
    request_purpose: "",
  };

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pdfViewer, setPdfViewer] = useState<{ url: string; name: string } | null>(null);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setReceiptFile(null);
    setOpen(true);
  };
  const startEdit = (r: {
    id: string; category: ExpenseCategory; amount: number; currency: Currency;
    spent_on: string; vendor: string | null; notes: string | null;
    txn_id?: string | null; payment_method?: string | null; department?: string | null;
    requested_by?: string | null; request_purpose?: string | null;
  }) => {
    setEditingId(r.id);
    setForm({
      category: r.category,
      amount: String(r.amount),
      currency: r.currency,
      spent_on: r.spent_on,
      vendor: r.vendor ?? "",
      notes: r.notes ?? "",
      txn_id: r.txn_id ?? "",
      payment_method: r.payment_method ?? "",
      department: r.department ?? "",
      requested_by: r.requested_by ?? "",
      request_purpose: r.request_purpose ?? "",
    });
    setReceiptFile(null);
    setOpen(true);
  };


  const viewVoucher = async (id: string, voucherNo: string | null) => {
    try {
      setBusyId(id + "view");
      const { url } = await voucherUrlFn({ data: { id, mode: "digital" } });
      setPdfViewer({ url, name: `Voucher-${voucherNo ?? id}.pdf` });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyId(null); }
  };

  // Prefers the uploaded sealed/signed copy when one exists; otherwise the generated voucher.
  const downloadVoucher = async (id: string, voucherNo: string | null, signedPath?: string | null) => {
    try {
      setBusyId(id + "dl");
      if (signedPath) {
        const name = `Voucher-${voucherNo ?? id}-sealed.${signedPath.split(".").pop() ?? "pdf"}`;
        const su = await signedDownloadUrl(signedPath, name);
        const link = document.createElement("a");
        link.href = su; link.download = name; link.rel = "noopener";
        document.body.appendChild(link); link.click(); link.remove();
        return;
      }
      const { url } = await voucherUrlFn({ data: { id, mode: "digital" } });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Could not generate voucher PDF");
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl; a.download = `Voucher-${voucherNo ?? id}.pdf`; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyId(null); }
  };


  const openVoucher = async (id: string, mode: "digital" | "print") => {
    try {
      setBusyId(id + mode);
      const { url } = await voucherUrlFn({ data: { id, mode } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyId(null); }
  };

  const uploadSigned = async (id: string, file: File) => {
    try {
      if (file.size > MAX_RECEIPT_MB * 1024 * 1024) throw new Error(`File must be ≤ ${MAX_RECEIPT_MB} MB`);
      setBusyId(id + "signed");
      const path = await uploadToBucket(file, "signed/");
      await setSignedFn({ data: { id, path } });
      toast.success("Signed voucher uploaded");
      void q.refetch();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyId(null); }
  };

  const removeSigned = async (id: string) => {
    const ok = await confirm({ title: "Remove signed voucher", description: "The stored sealed copy will be detached.", tone: "danger" });
    if (!ok) return;
    try {
      setBusyId(id + "signed");
      await setSignedFn({ data: { id, path: null } });
      toast.success("Removed");
      void q.refetch();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyId(null); }
  };

  const openReceipt = async (path: string) => {
    try {
      const name = path.split("/").pop() ?? "receipt";
      if (isImagePath(path)) {
        setViewer({ url: await signedUrl(path), name });
      } else {
        window.open(await signedUrl(path), "_blank", "noopener,noreferrer");
      }
    } catch (e) { toast.error((e as Error).message); }
  };
  const downloadReceipt = async (path: string) => {
    try {
      const name = path.split("/").pop() ?? "receipt";
      const url = await signedDownloadUrl(path, name);
      const a = document.createElement("a");
      a.href = url; a.download = name; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast.error((e as Error).message); }
  };

  const add = useMutation({
    mutationFn: async () => {
      let receipt_url: string | null = null;
      if (receiptFile) {
        if (receiptFile.size > MAX_RECEIPT_MB * 1024 * 1024) {
          throw new Error(`Receipt must be ≤ ${MAX_RECEIPT_MB} MB`);
        }
        setUploading(true);
        try {
          receipt_url = await uploadToBucket(receiptFile, "");
        } finally {
          setUploading(false);
        }
      }
      const payload = {
        category: form.category,
        amount: Number(form.amount),
        currency: form.currency,
        spent_on: form.spent_on,
        vendor: form.vendor || null,
        notes: form.notes || null,
        txn_id: form.txn_id.trim() || null,
        payment_method: form.payment_method || null,
        department: form.department || null,
        requested_by: form.requested_by || null,
        request_purpose: form.request_purpose.trim() || null,
      };
      if (editingId) {
        await update({ data: { id: editingId, ...payload, ...(receipt_url ? { receipt_url } : {}) } });
      } else {
        await create({ data: { ...payload, receipt_url } });
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Expense updated" : "Expense added");
      setOpen(false);
      setEditingId(null);
      setReceiptFile(null);
      setForm(emptyForm);
      void q.refetch();
    },
    onError: (e) => { setUploading(false); toast.error((e as Error).message); },
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
        <Button onClick={startCreate} className="h-9 rounded-sm bg-primary hover:bg-brand-700">
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
              <th className="px-3 py-2">Voucher</th>
              <th className="px-3 py-2">Receipt</th>
              <th className="px-3 py-2">Signed copy</th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">No expenses yet.</td></tr>
            ) : q.data?.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">{r.spent_on}</td>
                <td className="px-3 py-2 capitalize">{r.category}</td>
                <td className="px-3 py-2">{r.vendor ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.amount, r.currency)}</td>
                <td className="px-3 py-2 text-muted-foreground truncate max-w-xs">{r.notes ?? ""}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-[11.5px] text-muted-foreground">{r.voucher_no ?? "—"}</span>
                    <Button size="sm" variant="ghost" className="h-7 rounded-sm px-2 text-[11.5px]"
                      disabled={!r.voucher_no || busyId === r.id + "view"}
                      onClick={() => viewVoucher(r.id, r.voucher_no)} title="View voucher invoice">
                      {busyId === r.id + "view" ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 rounded-sm px-2 text-[11.5px]"
                      disabled={!r.voucher_no || busyId === r.id + "dl"}
                      onClick={() => downloadVoucher(r.id, r.voucher_no)} title="Download voucher PDF">
                      {busyId === r.id + "dl" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 rounded-sm px-2 text-[11.5px]"
                      disabled={!r.voucher_no || busyId === r.id + "print"}
                      onClick={() => openVoucher(r.id, "print")} title="Print on letterhead paper">
                      {busyId === r.id + "print" ? <Loader2 className="size-3.5 animate-spin" /> : <Printer className="size-3.5" />}
                    </Button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  {r.receipt_url ? (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 rounded-sm px-2 text-[11.5px]"
                        onClick={() => openReceipt(r.receipt_url as string)}
                        title={isPdfPath(r.receipt_url) ? "Open PDF" : "View image"}>
                        {isPdfPath(r.receipt_url) ? <FileText className="size-3.5" /> : <Eye className="size-3.5" />}
                        <span className="ml-1">View</span>
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 rounded-sm px-2 text-[11.5px]"
                        onClick={() => downloadReceipt(r.receipt_url as string)} title="Download">
                        <Download className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-[11.5px] text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.signed_voucher_url ? (
                    <div className="flex items-center gap-1">
                      <span className="rounded-sm bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase text-emerald-700">Signed</span>
                      <Button size="sm" variant="ghost" className="h-7 rounded-sm px-2"
                        onClick={() => openReceipt(r.signed_voucher_url as string)} title="View sealed copy">
                        {isPdfPath(r.signed_voucher_url) ? <FileText className="size-3.5" /> : <Eye className="size-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 rounded-sm px-2"
                        onClick={() => downloadReceipt(r.signed_voucher_url as string)} title="Download">
                        <Download className="size-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 rounded-sm px-2 text-rose-600 hover:bg-rose-50"
                        disabled={busyId === r.id + "signed"} onClick={() => removeSigned(r.id)} title="Remove">
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-sm border border-dashed border-input px-2 py-1 text-[11.5px] text-muted-foreground hover:border-primary hover:text-primary">
                      {busyId === r.id + "signed" ? <Loader2 className="size-3.5 animate-spin" /> : <Stamp className="size-3.5" />}
                      <span>Upload sealed</span>
                      <input type="file" accept={ACCEPT} className="hidden"
                        onChange={(ev) => {
                          const f = ev.target.files?.[0];
                          ev.target.value = "";
                          if (f) void uploadSigned(r.id, f);
                        }} />
                    </label>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(r)}
                    className="h-7 rounded-sm" title="Edit expense">
                    <Pencil className="size-3.5" />
                  </Button>
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
            <h3 className="text-[14px] font-semibold">{editingId ? "Edit expense" : "Add expense"}</h3>
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
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground">
                  {editingId ? "Replace receipt" : "Receipt"} <span className="text-muted-foreground/70 normal-case font-normal">(optional — image or PDF, ≤ {MAX_RECEIPT_MB} MB)</span>
                </label>
                {!receiptFile ? (
                  <label className="mt-1 flex h-20 cursor-pointer items-center justify-center gap-2 rounded-sm border border-dashed border-input bg-background text-[12px] text-muted-foreground hover:border-primary hover:text-primary">
                    <Upload className="size-3.5" />
                    <span>Click to upload proof / receipt</span>
                    <input type="file" accept={ACCEPT} className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (f && f.size > MAX_RECEIPT_MB * 1024 * 1024) {
                          toast.error(`File must be ≤ ${MAX_RECEIPT_MB} MB`);
                          e.target.value = ""; return;
                        }
                        setReceiptFile(f);
                      }} />
                  </label>
                ) : (
                  <div className="mt-1 flex items-center justify-between rounded-sm border border-input bg-background px-2 py-1.5 text-[12px]">
                    <div className="flex min-w-0 items-center gap-2">
                      {receiptFile.type.startsWith("image/") ? <Eye className="size-3.5 shrink-0" /> : <FileText className="size-3.5 shrink-0" />}
                      <span className="truncate">{receiptFile.name}</span>
                      <span className="shrink-0 text-muted-foreground">({(receiptFile.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 rounded-sm px-1.5"
                      onClick={() => setReceiptFile(null)} disabled={uploading}>
                      <X className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setOpen(false); setEditingId(null); }} className="h-9 rounded-sm" disabled={add.isPending}>Cancel</Button>
              <Button onClick={() => add.mutate()} disabled={add.isPending || !form.amount}
                className="h-9 rounded-sm bg-primary hover:bg-brand-700">
                {(add.isPending || uploading) && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                {uploading ? "Uploading…" : editingId ? "Save changes" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {viewer && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4" onClick={() => setViewer(null)}>
          <div className="relative max-h-[90vh] w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between rounded-t-md border border-border bg-card px-3 py-2">
              <div className="flex min-w-0 items-center gap-2 text-[12.5px]">
                <Eye className="size-3.5 shrink-0" />
                <span className="truncate">{viewer.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 rounded-sm px-2 text-[11.5px]"
                  onClick={() => { const a = document.createElement("a"); a.href = viewer.url; a.download = viewer.name; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); }}>
                  <Download className="mr-1 size-3.5" /> Download
                </Button>
                <Button size="sm" variant="ghost" className="h-7 rounded-sm px-2" onClick={() => setViewer(null)}>
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="max-h-[80vh] overflow-auto rounded-b-md border-x border-b border-border bg-black">
              <img src={viewer.url} alt={viewer.name} className="mx-auto block max-h-[80vh] object-contain" />
            </div>
          </div>
        </div>
      )}
      {pdfViewer && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4" onClick={() => setPdfViewer(null)}>
          <div className="relative flex h-[92vh] w-full max-w-4xl flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between rounded-t-md border border-border bg-card px-3 py-2">
              <div className="flex min-w-0 items-center gap-2 text-[12.5px]">
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate">{pdfViewer.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 rounded-sm px-2 text-[11.5px]"
                  onClick={() => window.open(pdfViewer.url, "_blank", "noopener,noreferrer")}>
                  Open in new tab
                </Button>
                <Button size="sm" variant="ghost" className="h-7 rounded-sm px-2" onClick={() => setPdfViewer(null)}>
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
            <iframe title={pdfViewer.name} src={pdfViewer.url}
              className="flex-1 rounded-b-md border-x border-b border-border bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}
