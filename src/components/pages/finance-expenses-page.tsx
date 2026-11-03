import { DiscardCancelButton } from "@/components/company/danger-confirm";
import { Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  listInvoices,
  type ExpenseCategory,
  type ExpenseRow,
  type Currency,
} from "@/lib/finance.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableItem } from "@/components/finance/searchable-select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ReportFilterBar } from "@/components/finance/report-filter-bar";
import { RecordCard, RowActionsMenu } from "@/components/finance/responsive-record-list";
import { ExpenseItemsEditor, sumItems, type ExpenseItem } from "@/components/finance/expense-items-editor";
import { ExpenseReceiptsEditor, type ReceiptDraft } from "@/components/finance/expense-receipts-editor";

import { ExportMenu } from "@/components/finance/export-menu";
import { formatCategory } from "@/lib/expense-categories";
import { ReasonDialog } from "@/components/finance/reason-dialog";
import { ExpenseLogsDialog } from "@/components/finance/expense-logs-dialog";
import { logExpenseAction } from "@/lib/expense-logs.functions";
import { FundSelect, InsufficientFundDialog, useFundOptions } from "@/components/finance/fund-move-dialog";
import { parseInsufficient } from "@/lib/fund-ops.functions";
import { defaultFilters, type ReportFilters } from "@/lib/report-filters";
import { Loader2, Plus, Trash2, Receipt, Eye, Download, X, FileText, Printer, Stamp, Pencil, Link2, History } from "lucide-react";

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


const CATEGORIES: ExpenseCategory[] = ["salary", "tools", "ads", "office", "misc", "tax", "refund"];

function fmt(n: number, cur: string) {
  return (cur === "BDT" ? "৳ " : "$ ") + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

export function ExpensesPage() {
  const listFn = useServerFn(listExpenses);
  const create = useServerFn(createExpense);
  const idemRef = useRef<string | null>(null);
  const update = useServerFn(updateExpense);
  const del = useServerFn(deleteExpense);
  const check = useServerFn(isFinanceAdminCheck);
  const voucherUrlFn = useServerFn(getSignedExpenseVoucherUrl);
  const setSignedFn = useServerFn(setExpenseSignedVoucher);
  const confirm = useConfirm();
  const { highlight } = useSearch({ strict: false }) as { highlight?: string };
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const isAdmin = useQuery({ queryKey: ["is-finance-admin"], queryFn: () => check(), staleTime: 60_000 });
  const q = useQuery({
    queryKey: ["expenses"], queryFn: () => listFn(), staleTime: 15_000,
    enabled: !!isAdmin.data?.isAdmin,
  });

  // ⌘K search lands here with ?highlight=<expense id> — scroll to the row and
  // flash a brand ring so the user sees exactly which voucher matched.
  useEffect(() => {
    if (!highlight || !q.data?.length) return;
    const row = q.data.find((r) => r.id === highlight);
    if (!row) return;
    // If the active filters (date preset, currency, chips, search…) would hide
    // the matched voucher, reset to an "All time" view in its own currency so
    // the row is guaranteed to be rendered before we try to scroll to it.
    setFilters((f) => {
      const hiddenByCurrency = row.currency !== f.currency;
      const hiddenByDate = f.preset !== "all" && (row.spent_on < f.from || row.spent_on > f.to);
      const hiddenByChips =
        f.categories.length > 0 || !!f.invoiceId || !!f.paymentMethod || !!f.department ||
        !!f.vendor || !!f.createdBy || !!f.status || f.minAmount != null || f.maxAmount != null ||
        !!f.search.trim();
      if (!hiddenByCurrency && !hiddenByDate && !hiddenByChips) return f;
      return { ...defaultFilters("expense"), preset: "all", currency: row.currency };
    });
    setHighlightId(highlight);
    // Both the desktop table and the mobile cards carry the row — poll for the
    // one that is actually visible (offsetParent skips display:none copies),
    // then smooth-scroll it into the middle of the screen.
    let tries = 0;
    const t = setInterval(() => {
      const els = document.querySelectorAll<HTMLElement>(`[data-exp-id="${highlight}"]`);
      const el = Array.from(els).find((e) => e.offsetParent !== null) ?? null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        clearInterval(t);
      } else if (++tries > 25) {
        clearInterval(t);
      }
    }, 120);
    const off = setTimeout(() => setHighlightId(null), 6000);
    return () => {
      clearInterval(t);
      clearTimeout(off);
    };
  }, [highlight, q.data]);

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

  const invListFn = useServerFn(listInvoices);
  const invoices = useQuery({
    queryKey: ["finance-invoices-lite"], queryFn: () => invListFn(), staleTime: 60_000,
    enabled: !!isAdmin.data?.isAdmin,
  });
  const invoiceItems: SearchableItem[] = (invoices.data ?? []).map((i) => ({
    value: i.id,
    label: `${i.slug ?? i.id.slice(0, 8)} — ${i.title}`,
    hint: i.customer_name ?? undefined,
    keywords: [i.slug, i.title, i.customer_name, i.customer_code],
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
    paid_by: "",
    linked_invoice_id: "",
    is_project_cost: false,
    request_purpose: "",
    paying_fund_id: "",
    fund_exception_reason: "",
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
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [receipts, setReceipts] = useState<ReceiptDraft[]>([]);
  const [formSnap, setFormSnap] = useState("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setFormSnap(JSON.stringify({ form, receipts })); }, [open]);
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pdfViewer, setPdfViewer] = useState<{ url: string; name: string } | null>(null);
  // Audit trail: mandatory reason before edit/delete, per-voucher activity log,
  // and silent logging of every view / download / print.
  const logAction = useServerFn(logExpenseAction);
  const track = (expenseId: string, action: "voucher_viewed" | "voucher_downloaded" | "voucher_printed" | "receipt_viewed" | "receipt_downloaded", detail?: string) => {
    void logAction({ data: { expenseId, action, detail: detail ?? null } }).catch(() => {});
  };
  const [editReason, setEditReason] = useState<string | null>(null);
  const [askEditFor, setAskEditFor] = useState<ExpenseRow | null>(null);
  const [askDeleteFor, setAskDeleteFor] = useState<ExpenseRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [logsFor, setLogsFor] = useState<{ id: string; voucher: string | null } | null>(null);

  const confirmDelete = async (reason: string) => {
    if (!askDeleteFor) return;
    try {
      setDeleting(true);
      await del({ data: { id: askDeleteFor.id, reason } });
      toast.success("Moved to Recycle Bin — recoverable for 30 days");
      setAskDeleteFor(null);
      void q.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setItems([]);
    setReceipts([]);
    setOpen(true);
  };
  const startEdit = (r: ExpenseRow, reason: string) => {
    setEditReason(reason);
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
      paying_fund_id: "",
      fund_exception_reason: "",
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
      track(id, "voucher_viewed");
      setPdfViewer({ url, name: `Voucher-${voucherNo ?? id}.pdf` });
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyId(null); }
  };

  // Prefers the uploaded sealed/signed copy when one exists; otherwise the generated voucher.
  const downloadVoucher = async (id: string, voucherNo: string | null, signedPath?: string | null) => {
    try {
      setBusyId(id + "dl");
      track(id, "voucher_downloaded", signedPath ? "sealed copy" : "generated PDF");
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
      track(id, mode === "print" ? "voucher_printed" : "voucher_viewed");
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

  const openReceipt = async (path: string, expenseId?: string) => {
    try {
      const name = path.split("/").pop() ?? "receipt";
      if (expenseId) track(expenseId, "receipt_viewed", name);
      if (isImagePath(path)) {
        setViewer({ url: await signedUrl(path), name });
      } else {
        window.open(await signedUrl(path), "_blank", "noopener,noreferrer");
      }
    } catch (e) { toast.error((e as Error).message); }
  };
  const downloadReceipt = async (path: string, expenseId?: string) => {
    try {
      const name = path.split("/").pop() ?? "receipt";
      if (expenseId) track(expenseId, "receipt_downloaded", name);
      const url = await signedDownloadUrl(path, name);
      const a = document.createElement("a");
      a.href = url; a.download = name; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast.error((e as Error).message); }
  };

  // Private link: only signed-in Finance users can open it (checked server-side).
  const copyLink = async (voucherNo: string | null) => {
    if (!voucherNo) return;
    const link = `${window.location.origin}/x/${encodeURIComponent(voucherNo)}`;
    try { await navigator.clipboard.writeText(link); toast.success("Private link copied — Finance access required to open"); }
    catch { toast.error("Could not copy link"); }
  };

  const [shortfall, setShortfall] = useState<{ required: number; available: number; shortfall: number } | null>(null);
  const fundOpts = useFundOptions();
  const selectedFund = (fundOpts.data ?? []).find((x) => x.id === form.paying_fund_id);
  const add = useMutation({
    mutationFn: async () => {
      setUploading(true);
      let attachments: { path: string; caption: string | null; mime_type: string | null; size_bytes: number | null; kind: "receipt" }[] = [];
      try {
        attachments = await Promise.all(
          receipts.map(async (r) => ({
            path: r.path ?? (await uploadToBucket(r.file as File, "exp/")),
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
        paying_fund_id: editingId ? null : form.paying_fund_id || null,
        fund_exception_reason: form.fund_exception_reason.trim() || null,
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
        await update({ data: { id: editingId, ...payload, edit_reason: editReason ?? "" } });
      } else {
        if (!idemRef.current) idemRef.current = crypto.randomUUID();
        await create({ data: { ...payload, idempotency_key: idemRef.current } });
      }
    },
    onSuccess: () => {
      idemRef.current = null;
      toast.success(editingId ? "Expense updated" : "Expense added");
      setOpen(false);
      setEditingId(null);
      setEditReason(null);
      setReceipts([]);
      setItems([]);
      setForm(emptyForm);
      void q.refetch();
    },
    onError: (e) => {
      setUploading(false);
      const info = parseInsufficient((e as Error).message);
      if (info) setShortfall(info);
      else toast.error((e as Error).message.replace("PROFIT_FUND_PROTECTED: ", "Profit Fund is protected — ").replace("FUND_EXPENSE_LOCKED: ", ""));
    },
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
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-4 px-3 py-5 sm:px-6 sm:py-6 2xl:max-w-[1600px]">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-[18px] font-semibold text-foreground sm:text-[20px]">Expenses</h1>
          <p className="text-[12px] text-muted-foreground sm:text-[12.5px]">Track company outflow — reflected in the dashboard.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="ghost" className="h-9 rounded-sm text-[12.5px]">
            <Link to="/app/finance/recycle-bin">
              <Trash2 className="mr-1.5 size-3.5" /> <span className="hidden sm:inline">Recycle Bin</span>
            </Link>
          </Button>
          <ExportMenu filters={filters} kind="expense" />
          <Button onClick={startCreate} className="h-9 rounded-sm bg-primary hover:bg-brand-700">
            <Plus className="mr-1.5 size-3.5" /> <span className="hidden sm:inline">Add expense</span><span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      <ReportFilterBar filters={filters} onChange={setFilters} kind="expense" />

      <div className="-mx-0.5 flex items-center gap-1.5 overflow-x-auto px-0.5 pb-0.5" role="group" aria-label="Filter by category">
        {(["", ...CATEGORIES] as string[]).map((c) => {
          const active = c ? filters.categories[0] === c : filters.categories.length === 0;
          const n = (q.data ?? []).filter((r) => r.currency === filters.currency && (!c || r.category === c)
            && (filters.preset === "all" || (r.spent_on >= filters.from && r.spent_on <= filters.to))).length;
          return (
            <button key={c || "all"} type="button" onClick={() => setFilters({ ...filters, categories: c ? [c] : [] })}
              className={`shrink-0 rounded-sm px-2.5 py-1 text-[12px] font-medium transition-colors ${
                active ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}>
              {c ? formatCategory(c) : "All categories"} <span className="ml-1 font-mono text-[10.5px] opacity-75">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="hidden w-full max-w-full overflow-x-auto overscroll-x-contain rounded-md border border-border bg-card xl:block">
        <table className="w-full min-w-[1240px] table-auto text-[12.5px]">

          <thead className="sticky top-0 z-10 border-b border-border bg-muted/60 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground backdrop-blur">
            <tr className="[&>th]:whitespace-nowrap">
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
              <tr key={r.id} id={`exp-${r.id}`} data-exp-id={r.id}
                className={`border-t border-border align-top transition-colors duration-500 [&>td]:whitespace-nowrap ${
                  highlightId === r.id ? "bg-brand/10 shadow-[inset_0_0_0_2px_var(--color-brand)]" : ""
                }`}>
                <td className="px-3 py-2 font-mono text-[11.5px] text-muted-foreground">{r.spent_on}</td>
                <td className="px-3 py-2">{formatCategory(r.category)}</td>
                <td className="px-3 py-2">
                  <span className="block max-w-[130px] truncate">{r.department ?? "—"}</span>
                </td>
                <td className="px-3 py-2">
                  <span className="block max-w-[150px] truncate">{r.requested_by_name ?? "—"}</span>
                </td>
                <td className="px-3 py-2">
                  <span className="block max-w-[160px] truncate" title={r.vendor ?? ""}>{r.vendor ?? "—"}</span>
                </td>
                <td className="px-3 py-2">
                  <div className="max-w-[150px] leading-tight">
                    <div className="truncate">{r.payment_method ?? "—"}</div>
                    {r.txn_id && <div className="truncate font-mono text-[11px] text-muted-foreground">{r.txn_id}</div>}
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono">{fmt(r.amount, r.currency)}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  <span className="block max-w-[220px] truncate" title={r.request_purpose || r.notes || ""}>
                    {r.request_purpose || r.notes || "—"}
                  </span>
                </td>
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
                          onClick={() => openReceipt(a.path, r.id)}
                          title={a.caption || `Receipt ${i + 1}`}>
                          {isPdfPath(a.path) ? <FileText className="size-3.5" /> : <Eye className="size-3.5" />}
                          <span className="ml-1">{i + 1}</span>
                        </Button>
                      ))}
                    </div>
                  ) : r.receipt_url ? (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 rounded-sm px-2 text-[11.5px]"
                        onClick={() => openReceipt(r.receipt_url as string, r.id)}
                        title={isPdfPath(r.receipt_url) ? "Open PDF" : "View image"}>
                        {isPdfPath(r.receipt_url) ? <FileText className="size-3.5" /> : <Eye className="size-3.5" />}
                        <span className="ml-1">View</span>
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 rounded-sm px-2 text-[11.5px]"
                        onClick={() => downloadReceipt(r.receipt_url as string, r.id)} title="Download">
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
                        onClick={() => openReceipt(r.signed_voucher_url as string, r.id)} title="View sealed copy">
                        {isPdfPath(r.signed_voucher_url) ? <FileText className="size-3.5" /> : <Eye className="size-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 rounded-sm px-2"
                        onClick={() => downloadReceipt(r.signed_voucher_url as string, r.id)} title="Download">
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
                  <Button size="sm" variant="ghost" onClick={() => copyLink(r.voucher_no)}
                    className="h-7 rounded-sm" disabled={!r.voucher_no}
                    title="Copy private link (Finance only)">
                    <Link2 className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setLogsFor({ id: r.id, voucher: r.voucher_no })}
                    className="h-7 rounded-sm" title="Activity log — who did what, when">
                    <History className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAskEditFor(r)}
                    className="h-7 rounded-sm" title="Edit expense">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAskDeleteFor(r)}
                    className="h-7 rounded-sm text-rose-600 hover:bg-rose-50" title="Move to Recycle Bin">
                    <Trash2 className="size-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile / tablet cards */}
      <div className="w-full min-w-0 space-y-2.5 xl:hidden">
        {visible.length === 0 ? (
          <div className="rounded-md border border-border bg-card px-3 py-10 text-center text-[12.5px] text-muted-foreground">
            {(q.data ?? []).length === 0 ? "No expenses yet." : "No expenses match the selected filters."}
          </div>
        ) : visible.map((r) => (
          <div
            key={`m-${r.id}`}
            id={`exp-m-${r.id}`}
            data-exp-id={r.id}
            className={`overflow-hidden rounded-md border border-border bg-card shadow-sm transition-all duration-500 ${
              highlightId === r.id ? "bg-brand/10 shadow-[inset_0_0_0_2px_var(--color-brand)]" : ""
            }`}
          >
          <RecordCard
            code={r.voucher_no}
            title={r.vendor || formatCategory(r.category)}
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
              { label: "Category", value: formatCategory(r.category), primary: true },
              { label: "Department", value: r.department ?? "—" },
              { label: "Requested by", value: r.requested_by_name ?? "—" },
              { label: "Method", value: r.payment_method ?? "—" },
              { label: "TrxID", value: r.txn_id ? <span className="font-mono">{r.txn_id}</span> : "—" },
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
                      onClick={() => openReceipt(r.receipt_url as string, r.id)}>
                      <FileText className="mr-2 size-3.5" /> View receipt
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]"
                      onClick={() => downloadReceipt(r.receipt_url as string, r.id)}>
                      <Download className="mr-2 size-3.5" /> Download receipt
                    </Button>
                  </>
                )}
                {r.signed_voucher_url ? (
                  <>
                    <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]"
                      onClick={() => openReceipt(r.signed_voucher_url as string, r.id)}>
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
                <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]"
                  disabled={!r.voucher_no} onClick={() => copyLink(r.voucher_no)}>
                  <Link2 className="mr-2 size-3.5" /> Copy private link
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]"
                  onClick={() => setLogsFor({ id: r.id, voucher: r.voucher_no })}>
                  <History className="mr-2 size-3.5" /> Activity log
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]" onClick={() => setAskEditFor(r)}>
                  <Pencil className="mr-2 size-3.5" /> Edit expense
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px] text-rose-600"
                  onClick={() => setAskDeleteFor(r)}>
                  <Trash2 className="mr-2 size-3.5" /> Delete (Recycle Bin)
                </Button>
              </RowActionsMenu>
            }
          />
          </div>
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
                    {CATEGORIES.map((c) => <option key={c} value={c}>{formatCategory(c)}</option>)}
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
              {!editingId && (
                <div className="rounded-sm border border-border bg-muted/30 p-2.5">
                  <label className="text-[11px] font-semibold uppercase text-muted-foreground">Paying fund (Fund Ledger · optional)</label>
                  <div className="mt-1">
                    <FundSelect value={form.paying_fund_id} onChange={(v) => setForm({ ...form, paying_fund_id: v })} funds={fundOpts.data ?? []} placeholder="— Not charged to a fund —" />
                  </div>
                  {selectedFund && Number(form.amount) > selectedFund.available && (
                    <p className="mt-1 text-[11.5px] font-medium text-destructive">Amount is above this fund's available balance.</p>
                  )}
                  {selectedFund?.code === "profit" && (
                    <div className="mt-2 rounded-sm border border-rose-300 bg-rose-50 p-2 text-[12px] text-rose-800">
                      Company Profit Fund is protected. Normal expenses should not use it — enter an exceptional reason to continue.
                      <Input className="mt-1 h-8" value={form.fund_exception_reason} onChange={(e) => setForm({ ...form, fund_exception_reason: e.target.value })} placeholder="Exceptional reason (min 5 chars)" />
                    </div>
                  )}
                  {form.paying_fund_id && form.currency !== "BDT" && <p className="mt-1 text-[11.5px] text-destructive">Fund-backed expenses must be in BDT.</p>}
                </div>
              )}
              <InsufficientFundDialog info={shortfall} fundId={form.paying_fund_id} fundName={selectedFund?.name} onClose={() => { setShortfall(null); void fundOpts.refetch(); }} />
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
              <DiscardCancelButton dirty={JSON.stringify({ form, receipts }) !== formSnap} onCancel={() => { setOpen(false); setEditingId(null); }} className="h-9 rounded-sm" disabled={add.isPending} />
              <Button onClick={() => add.mutate()} disabled={add.isPending || !form.amount}
                className="h-9 rounded-sm bg-primary hover:bg-brand-700">
                {(add.isPending || uploading) && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                {uploading ? "Uploading…" : editingId ? "Save changes" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ReasonDialog
        open={!!askEditFor}
        tone="default"
        title="Why are you editing this expense?"
        description={askEditFor ? `Voucher ${askEditFor.voucher_no ?? "—"} · the old and new values are stored in the activity log.` : undefined}
        placeholder="e.g. Vendor invoice corrected — amount was mistyped."
        confirmLabel="Continue to edit"
        onCancel={() => setAskEditFor(null)}
        onConfirm={(reason) => {
          const target = askEditFor;
          setAskEditFor(null);
          if (target) startEdit(target, reason);
        }}
      />

      <ReasonDialog
        open={!!askDeleteFor}
        tone="danger"
        busy={deleting}
        title="Move this expense to the Recycle Bin?"
        description={askDeleteFor ? `Voucher ${askDeleteFor.voucher_no ?? "—"} will leave the Expenses list and can be recovered for 30 days, after which it deletes itself permanently.` : undefined}
        placeholder="e.g. Duplicate entry — same bill recorded twice."
        confirmLabel="Delete"
        onCancel={() => setAskDeleteFor(null)}
        onConfirm={(reason) => void confirmDelete(reason)}
      />

      {logsFor && (
        <ExpenseLogsDialog
          expenseId={logsFor.id}
          voucherNo={logsFor.voucher}
          onClose={() => setLogsFor(null)}
        />
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
