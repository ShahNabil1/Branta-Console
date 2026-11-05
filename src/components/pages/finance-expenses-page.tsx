import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { useCompanyPath } from "@/components/company/use-company-path";
import { useActiveCompany } from "@/components/company/company-switcher";
import { getCompanyFundConfig, getCompanyWallet } from "@/lib/company-wallet.functions";
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
import { RowActionsMenu } from "@/components/finance/responsive-record-list";
import { PageHero } from "@/components/branta/page-hero";
import { ExpenseItemsEditor, type ExpenseItem } from "@/components/finance/expense-items-editor";
import { ExpenseReceiptsGallery } from "@/components/finance/expense-receipts-gallery";
import { storedReceipts } from "@/components/finance/receipt-media";
import { ExpenseDownloadButton } from "@/components/finance/expense-download-button";
import { downloadFile } from "@/components/finance/download-file";
import { ExpenseReceiptsEditor, type ReceiptDraft } from "@/components/finance/expense-receipts-editor";

import { ExportMenu } from "@/components/finance/export-menu";
import { formatCategory } from "@/lib/expense-categories";
import { ReasonDialog } from "@/components/finance/reason-dialog";
import { ExpenseLogsDialog } from "@/components/finance/expense-logs-dialog";
import { ExpenseCard } from "@/components/finance/expense-card";
import { logExpenseAction } from "@/lib/expense-logs.functions";
import { InsufficientFundDialog, useFundOptions } from "@/components/finance/fund-move-dialog";
import { parseInsufficient } from "@/lib/fund-ops.functions";
import { defaultFilters, type ReportFilters } from "@/lib/report-filters";
import { Loader2, Plus, Trash2, Receipt, Eye, X, FileText, ImageOff, Stamp, Pencil, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ExpenseDrawerContent, ExpenseDrawerHeader } from "@/components/finance/expense-drawer";
import { TestLoader } from "@/components/ui/test-loader";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

const STEPS = [
  { label: "Basics", hint: "what, how much and who" },
  { label: "Payment", hint: "fund, project and line items" },
  { label: "Details", hint: "purpose, notes and receipts" },
] as const;

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
  const activeCompany = useActiveCompany().active;
  const workspace = activeCompany?.slug ?? null;
  const sisterId = activeCompany && !activeCompany.is_holding ? activeCompany.id : null;
  const walletFn = useServerFn(getCompanyWallet);
  const fundCfgFn = useServerFn(getCompanyFundConfig);
  const sisterWallet = useQuery({ queryKey: ["company-wallet", sisterId], enabled: !!sisterId, queryFn: () => walletFn({ data: { companyId: sisterId as string, limit: 1 } }) });
  const sisterCfg = useQuery({ queryKey: ["company-fund-config", sisterId], enabled: !!sisterId, queryFn: () => fundCfgFn({ data: { companyId: sisterId as string } }) });
  const walletItems: SearchableItem[] = (((sisterCfg.data?.active as { company_fund_buckets?: { key: string; label: string; sort: number }[] } | null)?.company_fund_buckets) ?? [])
    .slice().sort((a, b) => a.sort - b.sort)
    .map((b) => {
      const bal = Number((sisterWallet.data?.buckets ?? []).find((x: { bucket_key: string }) => x.bucket_key === b.key)?.balance ?? 0);
      return { value: b.key, label: b.label, hint: `৳${Math.round(bal).toLocaleString("en-IN")} available` };
    });
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
  const isAdmin = useQuery({ queryKey: ["is-finance-admin", workspace], queryFn: () => check({ data: { workspace } }), staleTime: 60_000 });
  const q = useQuery({
    queryKey: ["expenses", workspace], queryFn: () => listFn({ data: { workspace } }), staleTime: 15_000,
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
    sub: e.job_role,
    avatar: e.avatar_url ?? "",
    keywords: [e.full_name, e.employee_code, e.job_role],
  }));

  const invListFn = useServerFn(listInvoices);
  const invoices = useQuery({
    queryKey: ["finance-invoices-lite", workspace], queryFn: () => invListFn({ data: { workspace } }), staleTime: 60_000,
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
    wallet_bucket: "",
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
  const [step, setStep] = useState(0);
  const goTo = (i: number) => {
    for (let j = 0; j < i; j++) if (!canNext(j)) { setStep(j); toast.error("Enter the amount and date first"); return; }
    setStep(i);
  };
  const canNext = (i: number) => i < 0 || (i === 0 ? Number(form.amount) > 0 && !!form.spent_on : true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [receipts, setReceipts] = useState<ReceiptDraft[]>([]);
  const [formSnap, setFormSnap] = useState("");
  const draftRef = useRef(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setFormSnap(JSON.stringify({ form, receipts })); }, [open]);
  const [uploading, setUploading] = useState(false);
  const [receiptGallery, setReceiptGallery] = useState<ExpenseRow | null>(null);
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pdfViewer, setPdfViewer] = useState<{ url: string; name: string } | null>(null);
  // Audit trail: mandatory reason before edit/delete, per-voucher activity log,
  // and silent logging of every view / download.
  const logAction = useServerFn(logExpenseAction);
  const track = (expenseId: string, action: "voucher_viewed" | "voucher_downloaded" | "receipt_viewed" | "receipt_downloaded", detail?: string) => {
    void logAction({ data: { expenseId, action, detail: detail ?? null } }).catch(() => {});
  };
  const [editReason, setEditReason] = useState<string | null>(null);
  const [askEditFor, setAskEditFor] = useState<ExpenseRow | null>(null);
  const [askDeleteFor, setAskDeleteFor] = useState<ExpenseRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [logsFor, setLogsFor] = useState<{ id: string; voucher: string | null; createdAt: string } | null>(null);

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
    // Reopen an unsaved new-expense draft instead of wiping it.
    if (!editingId && draftRef.current) { setOpen(true); return; }
    draftRef.current = true;
    setStep(0);
    setEditingId(null);
    setForm(emptyForm);
    setItems([]);
    setReceipts([]);
    setOpen(true);
  };
  const startEdit = (r: ExpenseRow, reason: string) => {
    draftRef.current = false;
    setStep(0);
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
    wallet_bucket: "",
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
      if (signedPath) {
        const name = `Voucher-${voucherNo ?? id}-sealed.${signedPath.split(".").pop() ?? "pdf"}`;
        const su = await signedDownloadUrl(signedPath, name);
        await downloadFile(su, name);
        track(id, "voucher_downloaded", "sealed copy");
        return;
      }
      const { url } = await voucherUrlFn({ data: { id, mode: "digital" } });
      await downloadFile(url, `Voucher-${voucherNo ?? id}.pdf`);
      track(id, "voucher_downloaded", "generated PDF");
    } catch (e) { toast.error((e as Error).message); throw e; }
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
      const url = await signedDownloadUrl(path, name);
      await downloadFile(url, name);
      if (expenseId) track(expenseId, "receipt_downloaded", name);
    } catch (e) { toast.error((e as Error).message); throw e; }
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
        paying_fund_id: editingId || sisterId ? null : form.paying_fund_id || null,
        wallet_bucket: editingId || !sisterId ? null : form.wallet_bucket || null,
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
        await create({ data: { ...payload, workspace, idempotency_key: idemRef.current } });
        if (sisterId) void sisterWallet.refetch();
      }
    },
    onSuccess: () => {
      idemRef.current = null;
      toast.success(editingId ? "Expense updated" : "Expense added");
      setOpen(false);
      draftRef.current = false;
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
      <PageHero
        icon={Receipt}
        eyebrow={activeCompany?.name ?? "Finance"}
        title="Expenses"
        subtitle={`${(q.data ?? []).length} expense${(q.data ?? []).length === 1 ? "" : "s"} · only ${activeCompany?.name ?? "this company"}'s outflow`}
        actions={<>
          <Button asChild variant="outline" className="gap-1.5">
            <Link to={cp("/app/finance/recycle-bin") as "/app/finance/recycle-bin"}><Trash2 className="size-4" /> <span className="hidden sm:inline">Recycle Bin</span></Link>
          </Button>
          <ExportMenu filters={filters} kind="expense" />
          <Button onClick={startCreate} className="gap-1.5 shadow-md shadow-brand/25 transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-95">
            <Plus className="size-4" /> Add expense
          </Button>
        </>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(() => {
          const shown = visible;
          const total = shown.reduce((a, r) => a + Number(r.amount), 0);
          const monthKey = new Date().toISOString().slice(0, 7);
          const month = shown.filter((r) => r.spent_on.startsWith(monthKey)).reduce((a, r) => a + Number(r.amount), 0);
          const signed = shown.filter((r) => r.signed_voucher_url).length;
          const byCat = new Map<string, number>();
          shown.forEach((r) => byCat.set(r.category, (byCat.get(r.category) ?? 0) + Number(r.amount)));
          const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
          return ([
            { l: "Total in view", v: fmt(total, filters.currency), tone: "text-rose-600 bg-rose-50 ring-rose-200" },
            { l: "This month", v: fmt(month, filters.currency), tone: "text-amber-600 bg-amber-50 ring-amber-200" },
            { l: "Top category", v: top ? formatCategory(top[0]) : "—", tone: "text-sky-600 bg-sky-50 ring-sky-200" },
            { l: "Signed vouchers", v: `${signed} / ${shown.length}`, tone: "text-emerald-600 bg-emerald-50 ring-emerald-200" },
          ]).map((k, i) => (
            <div key={k.l} style={{ animationDelay: `${i * 40}ms` }} className="group rounded-lg border border-border bg-card p-4 shadow-sm transition-all duration-200 animate-in fade-in slide-in-from-bottom-1 fill-mode-both hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">{k.l}</span>
                <span className={cn("grid size-7 place-items-center rounded-md ring-1 ring-inset transition-transform group-hover:scale-110", k.tone)}><Receipt className="size-3.5" /></span>
              </div>
              <div className="mt-2 truncate font-mono text-[17px] font-bold">{k.v}</div>
            </div>
          ));
        })()}
      </div>

      <ReportFilterBar filters={filters} onChange={setFilters} kind="expense" />

      <UnderlineTabs
        ariaLabel="Filter by category"
        className="border-b border-border"
        value={filters.categories[0] ?? "__all"}
        onChange={(c) => setFilters({ ...filters, categories: c === "__all" ? [] : [c] })}
        items={(["__all", ...CATEGORIES] as string[]).map((c) => ({
          id: c,
          label: c === "__all" ? "All categories" : formatCategory(c),
          count: (q.data ?? []).filter((r) => r.currency === filters.currency && (c === "__all" || r.category === c)
            && (filters.preset === "all" || (r.spent_on >= filters.from && r.spent_on <= filters.to))).length,
        }))}
      />

      <div className="grid w-full min-w-0 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {visible.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-xl bg-brand/10 text-brand"><Receipt className="size-6" /></span>
            <div className="mt-3 text-[14px] font-bold">{(q.data ?? []).length === 0 ? "No expenses yet" : "No expenses match the selected filters"}</div>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Record {activeCompany?.name ?? "the company"}'s first expense with its receipt.</p>
            <Button onClick={startCreate} className="mt-4 gap-1.5"><Plus className="size-4" /> Add expense</Button>
          </div>
        ) : visible.map((r) => {
          const receipts = storedReceipts(r).length;
          const creator = employeeItems.find(employee => employee.value === r.created_by);
          return (
          <ExpenseCard key={r.id} record={r} category={formatCategory(r.category)} amount={`− ${fmt(r.amount, r.currency)}`}
            receiptCount={receipts} highlighted={highlightId === r.id}
            requestedByAvatar={employeeItems.find(employee => employee.value === r.requested_by)?.avatar}
            addedByName={creator?.label} addedByAvatar={creator?.avatar}
            downloading={busyId === r.id + "dl"}
            onActivity={() => setLogsFor({ id: r.id, voucher: r.voucher_no, createdAt: r.created_at })}
            onView={() => viewVoucher(r.id, r.voucher_no)}
            onDownload={() => downloadVoucher(r.id, r.voucher_no, r.signed_voucher_url)}
            onEdit={() => setAskEditFor(r)}
            menu={<RowActionsMenu>
                  {receipts > 0 && <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]"
                    onClick={() => setReceiptGallery(r)}><Receipt className="mr-2 size-3.5" />Receipts / proof · {receipts}</Button>}
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
                  <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px] text-rose-600"
                    onClick={() => setAskDeleteFor(r)}>
                    <Trash2 className="mr-2 size-3.5" /> Delete (Recycle Bin)
                  </Button>
                </RowActionsMenu>}
          />
          );
        })}
      </div>


      <Sheet open={open} onOpenChange={(v) => { if (!v && !add.isPending) { setOpen(false); setEditingId(null); } }}>
        <ExpenseDrawerContent>
          <ExpenseDrawerHeader>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-inset ring-brand/20"><Receipt className="size-5" /></span>
              <div className="min-w-0">
                <SheetTitle className="text-[16px] font-bold">{editingId ? "Edit expense" : "Add expense"}</SheetTitle>
                <SheetDescription className="text-[12px]">{activeCompany?.name ?? "Company"} · step {step + 1} of 3 — {STEPS[step].hint}</SheetDescription>
              </div>
            </div>
            <ol className="mt-4 grid grid-cols-3 gap-2">
              {STEPS.map((st, i) => {
                const done = i < step, on = i === step;
                return (
                  <li key={st.label}>
                    <button type="button" onClick={() => goTo(i)}
                      className="group w-full text-left">
                      <span className="relative block h-1 overflow-hidden rounded-full bg-muted">
                        <span className="absolute inset-y-0 left-0 rounded-full bg-brand transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]" style={{ width: done || on ? "100%" : "0%" }} />
                      </span>
                      <span className={cn("mt-2 flex items-center gap-1.5 text-[12px] font-bold transition-colors", on ? "text-foreground" : done ? "text-brand" : "text-muted-foreground group-hover:text-foreground")}>
                        <span className={cn("grid size-5 place-items-center rounded-full text-[10.5px] transition-all duration-300", done ? "bg-brand text-white" : on ? "bg-foreground text-background scale-110" : "bg-muted text-muted-foreground")}>
                          {done ? <Check className="size-3" /> : i + 1}
                        </span>
                        {st.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </ExpenseDrawerHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div key={step} className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-300">
            {step === 0 && (<>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Category</label>
                  <div className="mt-1.5"><SearchableSelect searchable={false} items={CATEGORIES.map((c) => ({ value: c, label: formatCategory(c) }))} value={form.category} onChange={(v) => v && setForm({ ...form, category: v as ExpenseCategory })} /></div>
                </div>
                <div>
                  <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Currency</label>
                  <div className="mt-1.5"><SearchableSelect searchable={false} items={[{ value: "BDT", label: "৳ BDT", hint: "Bangladeshi Taka" }, { value: "USD", label: "$ USD", hint: "US Dollar" }]} value={form.currency} onChange={(v) => v && setForm({ ...form, currency: v as Currency })} /></div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Amount</label>
                  <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="mt-1.5 h-10 rounded-lg font-mono text-[14px] font-bold shadow-sm transition-all hover:border-foreground/25 focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)] focus-visible:ring-0 focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)]" />
                </div>
                <div>
                  <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Date</label>
                  <Input type="date" value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })}
                    className="mt-1.5 h-10 rounded-lg text-[13px] font-semibold shadow-sm transition-all hover:border-foreground/25 focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)] focus-visible:ring-0 focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)]" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Vendor</label>
                  <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                    enterKeyHint="done"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    className="mt-1.5 h-10 rounded-lg text-[13px] font-semibold shadow-sm transition-all hover:border-foreground/25 focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)] focus-visible:ring-0 focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)]" placeholder="e.g. Figma, Google Ads, GP" />
                </div>
                <div>
                  <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Department</label>
                  <div className="mt-1.5"><SearchableSelect clearable searchable={false} items={DEPARTMENTS.map((d) => ({ value: d, label: d }))} value={form.department} onChange={(v) => setForm({ ...form, department: v })} placeholder="— Select department —" /></div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Requested by</label>
                  <div className="mt-1.5">
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
                  <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Paid by</label>
                  <div className="mt-1.5">
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
            </>)}
            {step === 1 && (<>
              {!editingId && sisterId && (
                <div className="rounded-xl border border-border bg-muted/30 p-3.5 transition-colors hover:border-foreground/15">
                  <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Pay from wallet fund (optional)</label>
                  <div className="mt-1.5">
                    <SearchableSelect items={walletItems} value={form.wallet_bucket} onChange={(v) => setForm({ ...form, wallet_bucket: v })} placeholder="— Not charged to the wallet —" emptyText="No wallet funds yet" />
                  </div>
                  {form.wallet_bucket && Number(form.amount) > Number((sisterWallet.data?.buckets ?? []).find((x: { bucket_key: string }) => x.bucket_key === form.wallet_bucket)?.balance ?? 0) && (
                    <p className="mt-1 text-[11.5px] font-medium text-destructive">Amount is above this fund's wallet balance.</p>
                  )}
                </div>
              )}
              {!editingId && !sisterId && (
                <div className="rounded-xl border border-border bg-muted/30 p-3.5 transition-colors hover:border-foreground/15">
                  <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Paying fund (Fund Ledger · optional)</label>
                  <div className="mt-1.5">
                    <SearchableSelect clearable items={(fundOpts.data ?? []).map((f) => ({ value: f.id, label: f.name, hint: `available ৳ ${f.available.toLocaleString()}`, sub: Number(form.amount) > f.available ? "Not enough balance for this amount" : null, disabled: Number(form.amount) > f.available && f.id !== form.paying_fund_id, keywords: [f.code] }))} value={form.paying_fund_id} onChange={(v) => setForm({ ...form, paying_fund_id: v })} placeholder="— Not charged to a fund —" emptyText="No fund matches" />
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
              <div className="rounded-xl border border-border bg-muted/30 p-3.5 transition-colors hover:border-foreground/15">
                <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Linked invoice / project</label>
                <div className="mt-1.5">
                  <SearchableSelect
                    items={invoiceItems}
                    value={form.linked_invoice_id}
                    onChange={(v) => setForm({ ...form, linked_invoice_id: v, is_project_cost: v ? form.is_project_cost : false })}
                    clearable
                    placeholder="— Not linked to a client project —"
                    emptyText="No invoice matches"
                  />
                </div>
                <div className="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ gridTemplateRows: form.linked_invoice_id ? "1fr" : "0fr", opacity: form.linked_invoice_id ? 1 : 0 }}
                  aria-hidden={!form.linked_invoice_id} inert={!form.linked_invoice_id}>
                  <div className="min-h-0 overflow-hidden">
                    <button type="button" role="switch" aria-checked={form.is_project_cost}
                      onClick={() => setForm((f) => ({ ...f, is_project_cost: !f.is_project_cost }))}
                      className={cn("mt-3 flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all duration-200 active:scale-[0.99]",
                        form.is_project_cost ? "border-brand/40 bg-brand/5 shadow-sm" : "border-border bg-card hover:border-foreground/20")}>
                      <span className={cn("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200", form.is_project_cost ? "bg-brand" : "bg-muted-foreground/30")}>
                        <span className={cn("absolute top-0.5 size-4 rounded-full bg-card shadow transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]", form.is_project_cost ? "left-[18px]" : "left-0.5")} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-bold">Count as project cost</span>
                        <span className="mt-0.5 block text-[11.5px] font-medium leading-snug text-muted-foreground">
                          Deducted from that invoice total before the stakeholder split — net distributable updates automatically.
                        </span>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Payment method</label>
                  <div className="mt-1.5"><SearchableSelect clearable searchable={false} items={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} value={form.payment_method} onChange={(v) => setForm({ ...form, payment_method: v })} placeholder="— Select method —" /></div>
                </div>
                <div>
                  <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Transaction ID (TrxID)</label>
                  <Input value={form.txn_id} onChange={(e) => setForm({ ...form, txn_id: e.target.value })}
                    className="mt-1.5 h-10 rounded-lg font-mono text-[14px] font-bold shadow-sm transition-all hover:border-foreground/25 focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)] focus-visible:ring-0 focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)]" placeholder="e.g. 9K3D8AB21X" />
                </div>
              </div>
              <ExpenseItemsEditor
                items={items}
                onChange={setItems}
                maxTotal={Number(form.amount) || 0}
                currency={form.currency}
              />
            </>)}
            {step === 2 && (<>
              <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/30 p-3">
                <div><div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Amount</div><div className="mt-0.5 font-mono text-[15px] font-bold">{form.currency} {Number(form.amount || 0).toLocaleString()}</div></div>
                <div><div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Category</div><div className="mt-0.5 text-[13px] font-bold">{formatCategory(form.category)}</div></div>
                <div><div className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">Date</div><div className="mt-0.5 font-mono text-[13px] font-bold">{form.spent_on}</div></div>
              </div>
              <div>
                <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Purpose of request</label>
                <textarea value={form.request_purpose} onChange={(e) => setForm({ ...form, request_purpose: e.target.value })}
                  rows={3}
                  className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 shadow-sm outline-none transition-all hover:border-foreground/25 focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)] focus-visible:ring-0 focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)] text-[13.5px] font-semibold leading-snug"
                  placeholder="Why was this expense needed? Write the full reason — it prints on the voucher." />
              </div>
              <div>
                <label className="text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 shadow-sm outline-none transition-all hover:border-foreground/25 focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)] focus-visible:ring-0 focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_15%,transparent)] text-[13px] leading-snug" />
              </div>

              <ExpenseReceiptsEditor receipts={receipts} onChange={setReceipts} />
            </>)}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border bg-card px-6 py-3.5">
            <DiscardCancelButton dirty onCancel={() => { setOpen(false); setEditingId(null); draftRef.current = false; }} className="h-9 rounded-md" disabled={add.isPending} />
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="outline" onClick={() => setStep(step - 1)} disabled={add.isPending} className="h-9 gap-1 rounded-md">
                  <ChevronLeft className="size-4" /> Back
                </Button>
              )}
              {step < 2 ? (
                <Button onClick={() => goTo(step + 1)} className="h-9 gap-1 rounded-md shadow-md shadow-brand/25 transition-all active:scale-95">
                  Continue <ChevronRight className="size-4" />
                </Button>
              ) : (
                <Button onClick={() => add.mutate()} disabled={add.isPending || !form.amount}
                  className="h-9 min-w-28 gap-1.5 rounded-md shadow-md shadow-brand/25 transition-all active:scale-95">
                  {add.isPending || uploading ? <TestLoader tone="white" /> : <Check className="size-4" />}
                  {uploading ? "Uploading…" : add.isPending ? "Saving…" : editingId ? "Save changes" : "Save expense"}
                </Button>
              )}
            </div>
          </div>
        </ExpenseDrawerContent>
      </Sheet>

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
          createdAt={logsFor.createdAt}
          employeeItems={employeeItems}
          onClose={() => setLogsFor(null)}
        />
      )}

      {receiptGallery && <ExpenseReceiptsGallery receipts={storedReceipts(receiptGallery)} voucherNo={receiptGallery.voucher_no}
        onClose={() => setReceiptGallery(null)}
        onView={r => track(receiptGallery.id, "receipt_viewed", r.name)}
        onDownloaded={r => track(receiptGallery.id, "receipt_downloaded", r.name)}
        onDownload={async r => { if (!r.path) throw new Error("Receipt is unavailable"); await downloadReceipt(r.path, receiptGallery.id); }} />}

      {viewer && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4" onClick={() => setViewer(null)}>
          <div className="relative max-h-[90vh] w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between rounded-t-md border border-border bg-card px-3 py-2">
              <div className="flex min-w-0 items-center gap-2 text-[12.5px]">
                <Eye className="size-3.5 shrink-0" />
                <span className="truncate">{viewer.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <ExpenseDownloadButton className="h-7 w-32 rounded-sm px-2 text-[11.5px]" resetKey={viewer.url}
                  onDownload={async () => { try { await downloadFile(viewer.url, viewer.name); } catch (error) { toast.error("File could not be downloaded."); throw error; } }} />
                <Button size="sm" variant="ghost" className="h-7 rounded-sm px-2" onClick={() => setViewer(null)}>
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="max-h-[80vh] overflow-auto rounded-b-md border-x border-b border-border bg-black">
              {/\.(heic|heif)$/i.test(viewer.name) ? (
                <div className="mx-auto my-10 flex max-w-md flex-col items-center gap-2.5 rounded-xl border border-border bg-card p-8 text-center shadow-lg">
                  <span className="grid size-14 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-inset ring-brand/20">
                    <ImageOff className="size-6" />
                  </span>
                  <div className="text-[13.5px] font-bold">HEIC preview isn't supported by browsers</div>
                  <p className="text-[12px] font-medium leading-relaxed text-muted-foreground">
                    iPhone photos (.heic) can't be shown here — the file is stored safely. Download it to view, or convert it to JPG first.
                  </p>
                </div>
              ) : (
                <img src={viewer.url} alt={viewer.name} className="mx-auto block max-h-[80vh] object-contain" />
              )}
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
