import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, X, Eye, Download, Printer, Ban, Wallet, Stamp, FileText, ReceiptText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableItem } from "@/components/finance/searchable-select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  listSalarySlips,
  issueSalarySlip,
  voidSalarySlip,
  getSignedSalarySlipUrl,
  listSalaryEmployees,
  listSalaryInvoiceOptions,
  setSalarySignedSlip,
  getSalarySealedFileUrl,
  type SalaryComponent,
} from "@/lib/salary.functions";
import { getSignedExpenseVoucherUrl } from "@/lib/finance.functions";


export const Route = createFileRoute("/_authenticated/app/finance/salary")({
  head: () => ({
    meta: [
      { title: "Salary · Finance · Branta" },
      { name: "description", content: "Issue employee salary slips, auto-record expenses and wallet credits." },
    ],
  }),
  component: SalaryPage,
});

const PAYMENT_METHODS = ["Bank Transfer", "bKash", "Nagad", "Rocket", "Cash", "Cheque", "Other"];
const RECEIPT_BUCKET = "expense-receipts";
const MAX_SLIP_MB = 15;
const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

async function uploadSealed(file: File) {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id ?? "anon";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `salary-signed/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

const DEPARTMENTS = ["HR & Admin", "Management", "Finance", "Sales & Outreach", "Marketing", "Production", "Development", "Operations", "Other"];

function fmt(n: number, cur: string) {
  return (cur === "BDT" ? "৳ " : "$ ") + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 });
}
function monthLabel(d: string) {
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function SalaryPage() {
  const confirm = useConfirm();
  const listFn = useServerFn(listSalarySlips);
  const empFn = useServerFn(listSalaryEmployees);
  const issueFn = useServerFn(issueSalarySlip);
  const voidFn = useServerFn(voidSalarySlip);
  const urlFn = useServerFn(getSignedSalarySlipUrl);
  const invFn = useServerFn(listSalaryInvoiceOptions);
  const sealFn = useServerFn(setSalarySignedSlip);
  const sealedUrlFn = useServerFn(getSalarySealedFileUrl);
  const voucherFn = useServerFn(getSignedExpenseVoucherUrl);


  const slipsQ = useQuery({ queryKey: ["salary.slips"], queryFn: () => listFn() });
  const empQ = useQuery({ queryKey: ["salary.employees"], queryFn: () => empFn() });
  const invQ = useQuery({ queryKey: ["salary.invoices"], queryFn: () => invFn() });
  const [busyId, setBusyId] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [currency, setCurrency] = useState<"BDT" | "USD">("BDT");
  const [base, setBase] = useState("");
  const [comps, setComps] = useState<SalaryComponent[]>([]);
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("Bank Transfer");
  const [txn, setTxn] = useState("");
  const [bank, setBank] = useState("");
  const [dept, setDept] = useState("HR & Admin");
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));

  const employees: SearchableItem[] = useMemo(
    () =>
      (empQ.data ?? []).map((e) => ({
        value: e.user_id,
        label: e.full_name || e.employee_code || e.user_id.slice(0, 8),
        hint: e.employee_code ?? undefined,
        keywords: [e.job_role, e.employee_code],
      })),
    [empQ.data],
  );

  const invoices: SearchableItem[] = useMemo(
    () =>
      (invQ.data ?? []).map((i) => ({
        value: i.id,
        label: `${i.slug ?? "—"} — ${i.title}`,
        hint: i.customer_name ?? undefined,
        keywords: [i.slug, i.customer_name, i.title],
      })),
    [invQ.data],
  );

  const net = useMemo(
    () => Number(base || 0) + comps.reduce((a, c) => a + Number(c.amount || 0), 0),
    [base, comps],
  );

  const reset = () => {
    setUserId(""); setBase(""); setComps([]); setReason(""); setTxn(""); setBank("");
  };

  const issue = useMutation({
    mutationFn: () =>
      issueFn({
        data: {
          user_id: userId,
          period_month: month,
          currency,
          base_amount: Number(base || 0),
          components: comps
            .filter((c) => c.label.trim() && Number(c.amount) !== 0)
            .map((c) => ({
              label: c.label.trim(),
              amount: Number(c.amount),
              invoice_id: c.invoice_id ?? null,
              invoice_slug: c.invoice_slug ?? null,
            })),
          reason: reason.trim() || null,
          payment_method: method || null,
          bank_name: bank.trim() || null,
          txn_id: txn.trim() || null,
          paid_on: paidOn,
          department: dept,
        },
      }),
    onSuccess: () => {
      toast.success("Salary slip issued — expense recorded and wallet credited.");
      setOpen(false);
      reset();
      slipsQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openPdf = async (id: string, mode?: "print", download?: boolean) => {
    try {
      const r = await urlFn({ data: { id, ...(mode ? { mode } : {}) } });
      window.open(download ? `${r.url}&dl=1` : r.url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /** Voucher PDF of the salary expense this slip created. */
  const openVoucher = async (expenseId: string | null, mode?: "print", download?: boolean) => {
    if (!expenseId) { toast.error("No linked salary expense for this slip"); return; }
    try {
      setBusyId(expenseId + (mode ?? "v"));
      const r = await voucherFn({ data: { id: expenseId, ...(mode ? { mode } : {}) } });
      window.open(download ? `${r.url}&dl=1` : r.url, "_blank", "noopener");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyId(null); }
  };



  const uploadSealedCopy = async (id: string, file: File) => {
    try {
      if (file.size > MAX_SLIP_MB * 1024 * 1024) throw new Error(`File must be ≤ ${MAX_SLIP_MB} MB`);
      setBusyId(id + "seal");
      const path = await uploadSealed(file);
      await sealFn({ data: { id, path } });
      toast.success("Signed & sealed slip uploaded");
      slipsQ.refetch();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyId(null); }
  };

  const openSealed = async (id: string, download?: boolean) => {
    try {
      setBusyId(id + "sealview");
      const r = await sealedUrlFn({ data: { id, ...(download ? { download: true } : {}) } });
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyId(null); }
  };

  const removeSealed = async (id: string) => {
    const ok = await confirm({
      title: "Remove sealed copy",
      description: "The stored signed copy will be detached from this slip.",
      tone: "danger" as const,
    });
    if (!ok) return;
    try {
      setBusyId(id + "seal");
      await sealFn({ data: { id, path: null } });
      slipsQ.refetch();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusyId(null); }
  };

  const doVoid = async (id: string, slipNo: string | null) => {
    const ok = await confirm({
      title: `Void ${slipNo ?? "salary slip"}?`,
      description:
        "The linked expense will be removed and the employee wallet credit reversed (a clawback is posted if it was already withdrawn).",
      confirmLabel: "Void slip",
      tone: "danger" as const,
    });
    if (!ok) return;
    try {
      await voidFn({ data: { id } });
      toast.success("Salary slip voided.");
      slipsQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-[17px] font-semibold tracking-tight">Salary</h1>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Issue monthly salary slips. Each slip records a company expense and credits the employee wallet.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="h-9 shrink-0 rounded-sm text-[13px]">
          <Plus className="mr-1.5 size-3.5" /> <span className="hidden sm:inline">Issue salary</span><span className="sm:hidden">Issue</span>
        </Button>
      </div>

      <div className="hidden overflow-x-auto rounded-sm border border-border bg-card lg:block">
        <table className="w-full min-w-[1000px] text-[13px]">

          <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Slip</th>
              <th className="px-3 py-2 text-left font-semibold">Employee</th>
              <th className="px-3 py-2 text-left font-semibold">Month</th>
              <th className="px-3 py-2 text-right font-semibold">Net</th>
              <th className="px-3 py-2 text-left font-semibold">Paid on</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2 text-left font-semibold">Expense voucher</th>
              <th className="px-3 py-2 text-left font-semibold">Sealed copy</th>
              <th className="px-3 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {slipsQ.isLoading && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                <Loader2 className="mx-auto size-4 animate-spin" />
              </td></tr>
            )}
            {!slipsQ.isLoading && (slipsQ.data ?? []).length === 0 && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-[12.5px] text-muted-foreground">
                No salary slips yet.
              </td></tr>
            )}

            {(slipsQ.data ?? []).map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-[12px]">{s.slip_no ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{s.employee_name ?? "—"}</div>
                  <div className="text-[11.5px] text-muted-foreground">{s.employee_code ?? ""}</div>
                </td>
                <td className="px-3 py-2">{monthLabel(s.period_month)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(s.net_amount, s.currency)}</td>
                <td className="px-3 py-2">{String(s.paid_on).slice(0, 10)}</td>
                <td className="px-3 py-2">
                  <span className={s.status === "void" ? "text-destructive" : "text-emerald-600"}>
                    {s.status === "void" ? "Void" : "Issued"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-[11.5px] text-muted-foreground">{s.voucher_no ?? "—"}</span>
                    <Button size="sm" variant="ghost" className="h-7 px-2" title="View expense voucher"
                      disabled={!s.expense_id || busyId === (s.expense_id ?? "") + "v"}
                      onClick={() => openVoucher(s.expense_id)}>
                      {busyId === (s.expense_id ?? "") + "v"
                        ? <Loader2 className="size-3.5 animate-spin" />
                        : <ReceiptText className="size-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" title="Download voucher PDF"
                      disabled={!s.expense_id}
                      onClick={() => openVoucher(s.expense_id, undefined, true)}>
                      <Download className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" title="Print on letterhead"
                      disabled={!s.expense_id || busyId === (s.expense_id ?? "") + "print"}
                      onClick={() => openVoucher(s.expense_id, "print")}>
                      <Printer className="size-3.5" />
                    </Button>
                  </div>
                </td>

                <td className="px-3 py-2">
                  {s.signed_slip_url ? (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="View sealed copy"
                        onClick={() => openSealed(s.id)}>
                        {busyId === s.id + "sealview" ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" title="Download sealed copy"
                        onClick={() => openSealed(s.id, true)}>
                        <Download className="size-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" title="Remove sealed copy"
                        onClick={() => removeSealed(s.id)}>
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
                      {busyId === s.id + "seal" ? <Loader2 className="size-3.5 animate-spin" /> : <Stamp className="size-3.5" />}
                      Upload
                      <input type="file" accept={ACCEPT} className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void uploadSealedCopy(s.id, f);
                        }} />
                    </label>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openPdf(s.id)} title="View slip">
                      <Eye className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openPdf(s.id, undefined, true)} title="Download">
                      <Download className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openPdf(s.id, "print")} title="Print (letterhead)">
                      <Printer className="size-3.5" />
                    </Button>
                    {s.status !== "void" && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => doVoid(s.id, s.slip_no)} title="Void">
                        <Ban className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile / tablet cards */}
      <div className="rounded-sm border border-border bg-card lg:hidden">
        {slipsQ.isLoading && (
          <div className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="mx-auto size-4 animate-spin" /></div>
        )}
        {!slipsQ.isLoading && (slipsQ.data ?? []).length === 0 && (
          <div className="px-3 py-10 text-center text-[12.5px] text-muted-foreground">No salary slips yet.</div>
        )}
        {(slipsQ.data ?? []).map((s) => (
          <RecordCard
            key={`m-${s.id}`}
            title={s.employee_name ?? "—"}
            subtitle={`${s.employee_code ?? ""} · ${monthLabel(s.period_month)}`}
            amount={fmt(s.net_amount, s.currency)}
            badge={
              <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase ${s.status === "void" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                {s.status === "void" ? "Void" : "Issued"}
              </span>
            }
            fields={[
              { label: "Slip", value: <span className="font-mono">{s.slip_no ?? "—"}</span>, primary: true },
              { label: "Paid on", value: String(s.paid_on).slice(0, 10) },
              { label: "Expense voucher", value: <span className="font-mono">{s.voucher_no ?? "—"}</span> },
              { label: "Sealed copy", value: s.signed_slip_url ? "Uploaded" : "Not uploaded" },
            ]}
            actions={
              <RowActionsMenu>
                <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]" onClick={() => openPdf(s.id)}>
                  <Eye className="mr-2 size-3.5" /> View slip
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]" onClick={() => openPdf(s.id, undefined, true)}>
                  <Download className="mr-2 size-3.5" /> Download slip
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]" onClick={() => openPdf(s.id, "print")}>
                  <Printer className="mr-2 size-3.5" /> Print (letterhead)
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]" disabled={!s.expense_id}
                  onClick={() => openVoucher(s.expense_id)}>
                  <ReceiptText className="mr-2 size-3.5" /> View expense voucher
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]" disabled={!s.expense_id}
                  onClick={() => openVoucher(s.expense_id, undefined, true)}>
                  <Download className="mr-2 size-3.5" /> Download voucher
                </Button>
                {s.signed_slip_url ? (
                  <>
                    <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]" onClick={() => openSealed(s.id)}>
                      <FileText className="mr-2 size-3.5" /> View sealed copy
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px]" onClick={() => openSealed(s.id, true)}>
                      <Download className="mr-2 size-3.5" /> Download sealed copy
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px] text-destructive" onClick={() => removeSealed(s.id)}>
                      <X className="mr-2 size-3.5" /> Remove sealed copy
                    </Button>
                  </>
                ) : (
                  <label className="inline-flex h-8 w-full cursor-pointer items-center rounded-sm px-3 text-[12px] hover:bg-muted">
                    <Stamp className="mr-2 size-3.5" /> Upload sealed copy
                    <input type="file" accept={ACCEPT} className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void uploadSealedCopy(s.id, f);
                      }} />
                  </label>
                )}
                {s.status !== "void" && (
                  <Button size="sm" variant="ghost" className="h-8 w-full rounded-sm text-[12px] text-destructive" onClick={() => doVoid(s.id, s.slip_no)}>
                    <Ban className="mr-2 size-3.5" /> Void slip
                  </Button>
                )}
              </RowActionsMenu>
            }
          />
        ))}
      </div>


      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/40 p-2 sm:p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-sm border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Issue salary</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="col-span-2">
                <label className="mb-1 block text-[12px] text-muted-foreground">Employee *</label>
                <SearchableSelect items={employees} value={userId} onChange={setUserId} placeholder="Select employee" />
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-muted-foreground">Salary month *</label>
                <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-sm" />
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-muted-foreground">Payment date *</label>
                <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="h-9 rounded-sm" />
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-muted-foreground">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as "BDT" | "USD")}
                  className="h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]"
                >
                  <option value="BDT">BDT</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-muted-foreground">Basic salary *</label>
                <Input type="number" value={base} onChange={(e) => setBase(e.target.value)} placeholder="0.00" className="h-9 rounded-sm" />
              </div>

              <div className="col-span-2">
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[12px] text-muted-foreground">
                    Pay lines — project payment, conveyance, bonus, deduction (negative amount)
                  </label>
                  <button
                    type="button"
                    onClick={() => setComps((c) => [...c, { label: "", amount: 0 }])}
                    className="text-[12px] text-primary hover:underline"
                  >
                    + Add line
                  </button>
                </div>
                <div className="space-y-2">
                  {comps.map((c, i) => (
                    <div key={i} className="flex gap-2">
                      <div className="w-52 shrink-0">
                        <SearchableSelect
                          items={invoices}
                          value={c.invoice_id ?? ""}
                          onChange={(v) => {
                            const inv = (invQ.data ?? []).find((x) => x.id === v);
                            setComps((prev) =>
                              prev.map((p, j) =>
                                j === i
                                  ? {
                                      ...p,
                                      invoice_id: v || null,
                                      invoice_slug: inv?.slug ?? null,
                                      label: p.label.trim() || (inv ? `Project pay — ${inv.title}` : p.label),
                                    }
                                  : p,
                              ),
                            );
                          }}
                          placeholder="Manual / no invoice"
                        />
                      </div>
                      <Input
                        value={c.label}
                        placeholder="e.g. Conveyance / Festival bonus / Advance adjustment"
                        onChange={(e) =>
                          setComps((prev) => prev.map((p, j) => (j === i ? { ...p, label: e.target.value } : p)))
                        }
                        className="h-9 flex-1 rounded-sm"
                      />
                      <Input
                        type="number"
                        value={String(c.amount)}
                        onChange={(e) =>
                          setComps((prev) => prev.map((p, j) => (j === i ? { ...p, amount: Number(e.target.value) } : p)))
                        }
                        className="h-9 w-32 rounded-sm"
                      />
                      <Button
                        variant="ghost"
                        className="h-9 px-2 text-muted-foreground"
                        onClick={() => setComps((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[12px] text-muted-foreground">Payment method</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
                  {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-muted-foreground">Transaction ID</label>
                <Input value={txn} onChange={(e) => setTxn(e.target.value)} placeholder="TrxID" className="h-9 rounded-sm" />
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-muted-foreground">Bank / wallet name</label>
                <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="e.g. City Bank PLC / bKash personal" className="h-9 rounded-sm" />
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-muted-foreground">Department</label>
                <select value={dept} onChange={(e) => setDept(e.target.value)} className="h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
                  {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-[12px] text-muted-foreground">Reason / remarks</label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this amount is being paid" className="h-9 rounded-sm" />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-sm border border-border bg-muted/40 px-3 py-2">
              <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                <Wallet className="size-3.5" /> Net payable
              </span>
              <span className="font-mono text-[15px] font-semibold">{fmt(net, currency)}</span>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" className="h-9 rounded-sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                className="h-9 rounded-sm"
                disabled={!userId || net <= 0 || issue.isPending}
                onClick={() => issue.mutate()}
              >
                {issue.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Issue slip
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
