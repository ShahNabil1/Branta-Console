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
import { ReportFilterBar } from "@/components/finance/report-filter-bar";
import { RecordCard, RowActionsMenu } from "@/components/finance/responsive-record-list";

import { ExportMenu } from "@/components/finance/export-menu";
import { defaultFilters, type ReportFilters } from "@/lib/report-filters";
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

  // Advanced filtering — same model the export uses, so what you see is what
  // you export (export re-queries the server for the complete filtered set).
  const [filters, setFilters] = useState<ReportFilters>(() => defaultFilters("expense"));
  const visible = (q.data ?? []).filter((r) => {
    if (r.currency !== filters.currency) return false;
    if (filters.preset !== "all" && (r.spent_on < filters.from || r.spent_on > filters.to)) return false;
    if (filters.categories.length && !filters.categories.includes(r.category)) return false;
    if (filters.invoiceId && r.linked_invoice_id !== filters.invoiceId) return false;
    if (filters.paymentMethod && (r.payment_method ?? "").toLowerCase() !== filters.paymentMethod.toLowerCase()) return false;
    if (filters.department && (r.department ?? "") !== filters.department) return false;
    if (filters.vendor && !(r.vendor ?? "").toLowerCase().includes(filters.vendor.toLowerCase())) return false;
    if (filters.createdBy && ![r.created_by, r.requested_by, r.paid_by].includes(filters.createdBy)) return false;
    if (filters.status) {
      const st = r.txn_id ? "paid" : "recorded";
      if (st !== filters.status.toLowerCase()) return false;
    }
    if (filters.minAmount != null && Number(r.amount) < filters.minAmount) return false;
    if (filters.maxAmount != null && Number(r.amount) > filters.maxAmount) return false;
    const term = filters.search.trim().toLowerCase();
    if (term) {
      const hay = [r.vendor, r.notes, r.request_purpose, r.txn_id, r.voucher_no, r.category,
        r.department, r.payment_method, r.requested_by_name, String(r.amount)]
        .filter(Boolean).join(" ").toLowerCase();
      if (!term.split(/\s+/).every((t) => hay.includes(t))) return false;
    }
    return true;
  });

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
    setItems([]);
    setReceipts([]);
    setOpen(true);
  };
  const startEdit = (r: ExpenseRow) => {
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
      paid_by: r.paid_by ?? "",
      linked_invoice_id: r.linked_invoice_id ?? "",
      is_project_cost: !!r.is_project_cost,
      request_purpose: r.request_purpose ?? "",
    });
    setItems((r.items ?? []).map((i) => ({
      name: i.name,
      quantity: Number(i.quantity),
      unit: i.unit ?? "",
      unit_price: Number(i.unit_price),
      note: i.note ?? "",
    })));
    setReceipts((r.attachments ?? []).map((a) => ({
      path: a.path,
      caption: a.caption ?? "",
      name: a.path.split("/").pop() ?? "receipt",
      isPdf: isPdfPath(a.path),
    })));
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

  const toggleShare = async (id: string, enabled: boolean) => {
    try {
      setBusyId(id + "share");
      const res = await shareFn({ data: { id, enabled } });
      if (enabled) {
        const link = `${window.location.origin}/x/${res.voucher_no ?? id}?t=${res.token}`;
        try { await navigator.clipboard.writeText(link); } catch { /* clipboard blocked */ }
        toast.success("Public link on — copied to clipboard");
      } else {
        toast.success("Public link turned off");
      }
      void q.refetch();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyId(null); }
  };

  const add = useMutation({
    mutationFn: async () => {
      setUploading(true);
      let attachments: { path: string; caption: string | null; mime_type: string | null; size_bytes: number | null; kind: "receipt" }[] = [];
      try {
        attachments = await Promise.all(
          receipts.map(async (r) => ({
            path: r.path ?? (await uploadToBucket(r.file as File, "")),
            caption: r.caption.trim() || null,
            mime_type: r.file?.type || null,
            size_bytes: r.file?.size ?? null,
            kind: "receipt" as const,
          })),
        );
      } finally {
        setUploading(false);
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
        paid_by: form.paid_by || null,
        linked_invoice_id: form.linked_invoice_id || null,
        is_project_cost: !!form.linked_invoice_id && form.is_project_cost,
        request_purpose: form.request_purpose.trim() || null,
        items: items
          .filter((i) => i.name.trim())
          .map((i) => ({
            name: i.name.trim(),
            quantity: Number(i.quantity) || 0,
            unit: i.unit.trim() || null,
            unit_price: Number(i.unit_price) || 0,
            amount: (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
            note: i.note.trim() || null,
          })),
        attachments,
        receipt_url: attachments[0]?.path ?? null,
      };
      if (editingId) {
        await update({ data: { id: editingId, ...payload } });
      } else {
        await create({ data: payload });
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Expense updated" : "Expense added");
      setOpen(false);
      setEditingId(null);
      setReceipts([]);
      setItems([]);
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
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[20px] font-semibold text-foreground">Expenses</h1>
          <p className="text-[12.5px] text-muted-foreground">Track company outflow — reflected in the dashboard.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu filters={filters} kind="expense" />
          <Button onClick={startCreate} className="h-9 rounded-sm bg-primary hover:bg-brand-700">
            <Plus className="mr-1.5 size-3.5" /> Add expense
          </Button>
        </div>
      </div>

      <ReportFilterBar filters={filters} onChange={setFilters} kind="expense" />

      <div className="hidden overflow-x-auto rounded-md border border-border bg-card lg:block">
        <table className="w-full min-w-[1000px] text-[12.5px]">

          <thead className="border-b border-border bg-muted/30 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2">Requested by</th>
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">Method / TrxID</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Purpose / Notes</th>
              <th className="px-3 py-2">Voucher</th>
              <th className="px-3 py-2">Receipt</th>
              <th className="px-3 py-2">Signed copy</th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={12} className="px-3 py-10 text-center text-muted-foreground">
                {(q.data ?? []).length === 0 ? "No expenses yet." : "No expenses match the selected filters."}
              </td></tr>
            ) : visible.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-2 text-muted-foreground">{r.spent_on}</td>
                <td className="px-3 py-2 capitalize">{r.category}</td>
                <td className="px-3 py-2">{r.department ?? "—"}</td>
                <td className="px-3 py-2">{r.requested_by_name ?? "—"}</td>
                <td className="px-3 py-2">{r.vendor ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="leading-tight">
                    <div>{r.payment_method ?? "—"}</div>
                    {r.txn_id && <div className="font-mono text-[11px] text-muted-foreground">{r.txn_id}</div>}
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.amount, r.currency)}</td>
                <td className="px-3 py-2 text-muted-foreground truncate max-w-xs">{r.request_purpose || r.notes || ""}</td>
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
                      onClick={() => downloadVoucher(r.id, r.voucher_no, r.signed_voucher_url)}
                      title={r.signed_voucher_url ? "Download sealed (signed) copy" : "Download voucher PDF"}>
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
                  {(r.attachments ?? []).length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {(r.attachments ?? []).map((a, i) => (
                        <Button key={a.id} size="sm" variant="ghost" className="h-7 rounded-sm px-2 text-[11.5px]"
                          onClick={() => openReceipt(a.path)}
                          title={a.caption || `Receipt ${i + 1}`}>
                          {isPdfPath(a.path) ? <FileText className="size-3.5" /> : <Eye className="size-3.5" />}
                          <span className="ml-1">{i + 1}</span>
                        </Button>
                      ))}
                    </div>
                  ) : r.receipt_url ? (
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
                  <Button size="sm" variant="ghost" onClick={() => toggleShare(r.id, !r.share_enabled)}
                    className={`h-7 rounded-sm ${r.share_enabled ? "text-primary" : ""}`}
                    disabled={busyId === r.id + "share"}
                    title={r.share_enabled ? "Public link on — click to copy / turn off" : "Create public share link"}>
                    {busyId === r.id + "share" ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
                  </Button>
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

      {/* Mobile / tablet cards */}
      <div className="rounded-md border border-border bg-card lg:hidden">
        {visible.length === 0 ? (
          <div className="px-3 py-10 text-center text-[12.5px] text-muted-foreground">
            {(q.data ?? []).length === 0 ? "No expenses yet." : "No expenses match the selected filters."}
          </div>
        ) : visible.map((r) => (
          <RecordCard
            key={`m-${r.id}`}
            title={r.vendor || r.category}
            subtitle={r.request_purpose || r.notes || ""}
            amount={fmt(r.amount, r.currency)}
            amountTone="expense"
            badge={
              r.signed_voucher_url ? (
                <span className="rounded-sm bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">Signed</span>
              ) : null
            }
            fields={[
              { label: "Date", value: r.spent_on, primary: true },
              { label: "Category", value: <span className="capitalize">{r.category}</span>, primary: true },
              { label: "Department", value: r.department ?? "—" },
              { label: "Requested by", value: r.requested_by_name ?? "—" },
              { label: "Method", value: r.payment_method ?? "—" },
              { label: "TrxID", value: r.txn_id ? <span className="font-mono">{r.txn_id}</span> : "—" },
              { label: "Voucher", value: <span className="font-mono">{r.voucher_no ?? "—"}</span> },
              { label: "Purpose", value: r.request_purpose || r.notes || "—" },
              { label: "Receipt", value: r.receipt_url ? "Attached" : "—" },
            ]}
            actions={
              <RowActionsMenu>
                <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]"
                  disabled={!r.voucher_no} onClick={() => viewVoucher(r.id, r.voucher_no)}>
                  <Eye className="mr-2 size-3.5" /> View voucher
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]"
                  disabled={!r.voucher_no} onClick={() => downloadVoucher(r.id, r.voucher_no, r.signed_voucher_url)}>
                  <Download className="mr-2 size-3.5" /> Download voucher
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]"
                  disabled={!r.voucher_no} onClick={() => openVoucher(r.id, "print")}>
                  <Printer className="mr-2 size-3.5" /> Print on letterhead
                </Button>
                {r.receipt_url && (
                  <>
                    <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]"
                      onClick={() => openReceipt(r.receipt_url as string)}>
                      <FileText className="mr-2 size-3.5" /> View receipt
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]"
                      onClick={() => downloadReceipt(r.receipt_url as string)}>
                      <Download className="mr-2 size-3.5" /> Download receipt
                    </Button>
                  </>
                )}
                {r.signed_voucher_url ? (
                  <>
                    <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]"
                      onClick={() => openReceipt(r.signed_voucher_url as string)}>
                      <Stamp className="mr-2 size-3.5" /> View sealed copy
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px] text-rose-600"
                      onClick={() => removeSigned(r.id)}>
                      <X className="mr-2 size-3.5" /> Remove sealed copy
                    </Button>
                  </>
                ) : (
                  <label className="inline-flex h-8 w-full cursor-pointer items-center rounded-sm px-3 text-[12px] hover:bg-muted">
                    <Stamp className="mr-2 size-3.5" /> Upload sealed copy
                    <input type="file" accept={ACCEPT} className="hidden"
                      onChange={(ev) => {
                        const f = ev.target.files?.[0];
                        ev.target.value = "";
                        if (f) void uploadSigned(r.id, f);
                      }} />
                  </label>
                )}
                <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]" onClick={() => startEdit(r)}>
                  <Pencil className="mr-2 size-3.5" /> Edit expense
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px] text-rose-600"
                  onClick={async () => {
                    const ok = await confirm({ title: "Delete expense", description: "This cannot be undone.", tone: "danger" });
                    if (!ok) return;
                    await del({ data: { id: r.id } });
                    toast.success("Deleted");
                    void q.refetch();
                  }}>
                  <Trash2 className="mr-2 size-3.5" /> Delete
                </Button>
              </RowActionsMenu>
            }
          />
        ))}
      </div>


      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/80 p-2 sm:p-4">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-md border border-border bg-card p-5 shadow-lg">
            <h3 className="text-[14px] font-semibold">{editingId ? "Edit expense" : "Add expense"}</h3>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Vendor</label>
                  <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                    className="mt-1 h-9 rounded-sm" placeholder="e.g. Figma, Google Ads, GP" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Department</label>
                  <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="mt-1 h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
                    <option value="">— Select —</option>
                    {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Requested by</label>
                  <div className="mt-1">
                    <SearchableSelect
                      items={employeeItems}
                      value={form.requested_by}
                      onChange={(v) => setForm({ ...form, requested_by: v })}
                      placeholder="— Who requested this expense —"
                      emptyText="No employee matches"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Paid by</label>
                  <div className="mt-1">
                    <SearchableSelect
                      items={employeeItems}
                      value={form.paid_by}
                      onChange={(v) => setForm({ ...form, paid_by: v })}
                      placeholder="— Who actually paid —"
                      emptyText="No employee matches"
                    />
                  </div>
                </div>
              </div>
              <div className="rounded-sm border border-border bg-muted/30 p-2.5">
                <label className="text-[11px] font-semibold uppercase text-muted-foreground">Linked invoice / project</label>
                <div className="mt-1">
                  <SearchableSelect
                    items={invoiceItems}
                    value={form.linked_invoice_id}
                    onChange={(v) => setForm({ ...form, linked_invoice_id: v })}
                    placeholder="— Not linked to a client project —"
                    emptyText="No invoice matches"
                  />
                </div>
                <label className="mt-2 flex items-start gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-3.5 accent-[hsl(var(--primary))]"
                    checked={form.is_project_cost}
                    disabled={!form.linked_invoice_id}
                    onChange={(e) => setForm({ ...form, is_project_cost: e.target.checked })}
                  />
                  <span>
                    Count as project cost
                    <span className="block text-[11.5px] text-muted-foreground">
                      Deducted from that invoice total before the stakeholder split — net distributable updates automatically.
                    </span>
                  </span>
                </label>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Payment method</label>
                  <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    className="mt-1 h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
                    <option value="">— Select —</option>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Transaction ID (TrxID)</label>
                  <Input value={form.txn_id} onChange={(e) => setForm({ ...form, txn_id: e.target.value })}
                    className="mt-1 h-9 rounded-sm font-mono" placeholder="e.g. 9K3D8AB21X" />
                </div>
              </div>
              <ExpenseItemsEditor
                items={items}
                onChange={(next) => {
                  setItems(next);
                  const s = sumItems(next);
                  if (next.length) setForm((f) => ({ ...f, amount: s ? String(s) : f.amount }));
                }}
                currency={form.currency}
              />

              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground">Purpose of request</label>
                <textarea value={form.request_purpose} onChange={(e) => setForm({ ...form, request_purpose: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-sm border border-input bg-background px-2 py-1.5 text-[13.5px] font-semibold leading-snug"
                  placeholder="Why was this expense needed? Write the full reason — it prints on the voucher." />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="mt-1 w-full rounded-sm border border-input bg-background px-2 py-1.5 text-[13px] leading-snug" />
              </div>

              <ExpenseReceiptsEditor receipts={receipts} onChange={setReceipts} />
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
