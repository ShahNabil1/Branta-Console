import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getInvoiceBySlug,
  updateInvoice,
  markInstallmentPaid,
  revertInstallment,
  deleteInvoice,
  listInvoiceActivityLogs,
  listEmployeesForFinance,
  type InstallmentRow,
  type InvoiceActivityLogRow,
  type InvoiceRow,
  type StakeholderRow,
  type StakeholderRole,
  type Currency,
} from "@/lib/finance.functions";
import { listCustomersForPicker } from "@/lib/customers.functions";
import {
  listInvoiceRecipients,
  listInvoiceEmailEvents,
  sendInvoiceEmail,
  getSignedInvoicePdfUrl,
  type InvoiceEmailEventRow,
  type InvoiceRecipient,
} from "@/lib/invoice-email.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { SearchableSelect, type SearchableItem } from "@/components/finance/searchable-select";
import { Loader2, ArrowLeft, Trash2, CheckCircle2, RotateCcw, Send, Download, Printer, Mail, Clock, CheckCheck, MailOpen, AlertCircle, Pencil, Activity, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/finance/invoices/$slug")({
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} · Invoice · Branta` }],
  }),
  component: InvoiceDetail,
});

function fmt(n: number | null | undefined, cur: string) {
  const sym = cur === "BDT" ? "৳ " : "$ ";
  return sym + Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ROLE_COLORS: Record<string, string> = {
  outreach: "bg-purple-50 text-purple-700 border-purple-200",
  lead_closer: "bg-blue-50 text-blue-700 border-blue-200",
  worker: "bg-emerald-50 text-emerald-700 border-emerald-200",
  company: "bg-amber-50 text-amber-700 border-amber-200",
};

import { ProjectCostEditor, sumProjectCosts, type ProjectCost } from "@/components/finance/project-cost-editor";

type EditInstallment = { label: string; amount: number; due_date: string };
type EditStakeholder = { user_id: string; role: StakeholderRole; percent: number };
type UpdateInvoicePayload = {
  id: string;
  customer_id: string;
  title: string;
  description: string | null;
  project_type: "one_time" | "monthly_retainer";
  starts_on: string | null;
  ends_on: string | null;
  currency: Currency;
  total_amount: number;
  notes: string | null;
  internal_notes: string | null;
  installments: EditInstallment[];
  stakeholders: EditStakeholder[];
  project_costs: Array<{ name: string; amount: number; description: string | null }>;
};

function InvoiceDetail() {
  const { slug } = useParams({ from: "/_authenticated/app/finance/invoices/$slug" });
  const navigate = useNavigate();
  const confirm = useConfirm();
  const getFn = useServerFn(getInvoiceBySlug);
  const markPaid = useServerFn(markInstallmentPaid);
  const revert = useServerFn(revertInstallment);
  const update = useServerFn(updateInvoice);
  const del = useServerFn(deleteInvoice);
  const listRecips = useServerFn(listInvoiceRecipients);
  const listEvents = useServerFn(listInvoiceEmailEvents);
  const listActivity = useServerFn(listInvoiceActivityLogs);
  const listCust = useServerFn(listCustomersForPicker);
  const listEmp = useServerFn(listEmployeesForFinance);
  const sendEmail = useServerFn(sendInvoiceEmail);
  const getPdfUrl = useServerFn(getSignedInvoicePdfUrl);

  const q = useQuery({
    queryKey: ["finance", "invoice", slug],
    queryFn: () => getFn({ data: { slug } }),
    staleTime: 15_000,
  });

  const events = useQuery({
    queryKey: ["finance", "invoice", slug, "events"],
    queryFn: () => listEvents({ data: { slug } }),
    staleTime: 5_000,
  });

  const recipients = useQuery({
    queryKey: ["finance", "invoice", slug, "recipients"],
    queryFn: () => listRecips({ data: { slug } }),
    staleTime: 60_000,
  });

  const activity = useQuery({
    queryKey: ["finance", "invoice", slug, "activity"],
    queryFn: () => listActivity({ data: { slug } }),
    staleTime: 5_000,
  });

  const customers = useQuery({ queryKey: ["customers"], queryFn: () => listCust(), staleTime: 60_000 });
  const employees = useQuery({ queryKey: ["finance-employees"], queryFn: () => listEmp(), staleTime: 60_000 });

  useEffect(() => {
    const ch = supabase.channel(`finance:invoice:${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_installments" }, () => void q.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_payouts" }, () => void q.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => void q.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_email_events" }, () => void events.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_activity_logs", filter: `invoice_slug=eq.${slug}` }, () => void activity.refetch())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [slug, q, events, activity]);

  const [payModal, setPayModal] = useState<InstallmentRow | null>(null);
  const [payRef, setPayRef] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Record<string, boolean>>({});

  const doPay = useMutation({
    mutationFn: async () => {
      if (!payModal) return;
      await markPaid({ data: { installment_id: payModal.id, payment_ref: payRef || null, payment_method: payMethod || null } });
    },
    onSuccess: () => { setPayModal(null); setPayRef(""); setPayMethod(""); toast.success("Installment marked as paid"); void q.refetch(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const picked = (recipients.data ?? []).filter((r) => selectedEmails[r.email]);
      if (!picked.length) throw new Error("Select at least one recipient");
      return await sendEmail({
        data: {
          slug,
          recipients: picked.map((r) => ({ email: r.email, name: r.name })),
          trigger: "manual",
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`Sent to ${res.sent} recipient(s)${res.failed ? `, ${res.failed} failed` : ""}`);
      setSendOpen(false);
      void events.refetch();
      void activity.refetch();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: UpdateInvoicePayload) => update({ data: payload }),
    onSuccess: () => {
      toast.success("Invoice updated");
      setEditOpen(false);
      void q.refetch();
      void activity.refetch();
    },
    onError: (e) => toast.error((e as Error).message),
  });



  const doDelete = async () => {
    if (!q.data) return;
    const ok = await confirm({
      title: "Delete invoice",
      description: `This permanently deletes invoice ${q.data.invoice.slug} and all its installments, stakeholders and payouts.`,
      tone: "danger",
      requireTypedText: q.data.invoice.slug,
      confirmLabel: "Delete permanently",
    });
    if (!ok) return;
    try {
      await del({ data: { id: q.data.invoice.id } });
      toast.success("Invoice deleted");
      navigate({ to: "/app/finance/invoices" });
    } catch (e) { toast.error((e as Error).message); }
  };

  if (q.isLoading) {
    return <div className="grid h-64 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }
  if (q.error) {
    return <div className="p-6 text-rose-600">{(q.error as Error).message}</div>;
  }
  if (!q.data) return null;
  const { invoice, installments, stakeholders, payouts } = q.data;
  const projectCosts = q.data.projectCosts ?? [];
  const costTotal = projectCosts.reduce((a, c) => a + Number(c.amount || 0), 0);
  const netDistributable = Math.max(Number(invoice.total_amount) - costTotal, 0);
  const outstanding = Math.max(0, Number(invoice.total_amount) - Number(invoice.paid_amount));

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <button onClick={() => navigate({ to: "/app/finance/invoices" })}
        className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back to invoices
      </button>

      <div className="rounded-md border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[24px] font-bold text-brand">{invoice.slug}</div>
            <h1 className="mt-1 text-[16px] font-semibold text-foreground">{invoice.title}</h1>
            <p className="text-[12px] text-muted-foreground">
              Customer: <span className="font-medium text-foreground">{invoice.customer_name}</span>
              {invoice.customer_code && <span className="ml-1 font-mono">({invoice.customer_code})</span>}
              · {invoice.project_type === "monthly_retainer" ? "Monthly retainer" : "One-time"}
              · Created {new Date(invoice.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              className="h-8 rounded-sm text-[12px]"
              title="Edit invoice"
            >
              <Pencil className="mr-1.5 size-3.5" /> Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const { url } = await getPdfUrl({ data: { slug: invoice.slug, mode: "print" } });
                  window.open(url, "_blank");
                } catch (e) { toast.error((e as Error).message); }
              }}
              className="h-8 rounded-sm text-[12px]"
              title="Print on pre-printed letterhead (no digital header/footer)"
            >
              <Printer className="mr-1.5 size-3.5" /> Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const { url } = await getPdfUrl({ data: { slug: invoice.slug, mode: "digital" } });
                  window.open(url, "_blank");
                } catch (e) { toast.error((e as Error).message); }
              }}
              className="h-8 rounded-sm text-[12px]"
              title="Download PDF with full digital letterhead"
            >
              <Download className="mr-1.5 size-3.5" /> PDF
            </Button>

            <Button
              size="sm"
              onClick={() => {
                const map: Record<string, boolean> = {};
                (recipients.data ?? []).forEach((r) => { if (r.is_primary) map[r.email] = true; });
                setSelectedEmails(map);
                setSendOpen(true);
              }}
              className="h-8 rounded-sm bg-brand text-[12px] text-white hover:bg-brand/90"
            >
              <Send className="mr-1.5 size-3.5" /> Send invoice
            </Button>
            <Button variant="outline" size="sm" onClick={doDelete} className="h-8 rounded-sm text-[12px] text-rose-600 hover:bg-rose-50">
              <Trash2 className="mr-1.5 size-3.5" /> Delete
            </Button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatBox label="Total" value={fmt(invoice.total_amount, invoice.currency)} />
          <StatBox label="Paid" value={fmt(invoice.paid_amount, invoice.currency)} tone="good" />
          <StatBox label="Outstanding" value={fmt(outstanding, invoice.currency)} tone={outstanding > 0 ? "warn" : "neutral"} />
          <StatBox label="Status" value={invoice.status.replace("_"," ")} tone={invoice.status === "paid" ? "good" : "neutral"} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-md border border-border bg-card lg:col-span-2">
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Installments</h2>
          </div>
          <table className="w-full text-[12.5px]">
            <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {installments.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-muted-foreground">{i.sequence}</td>
                  <td className="px-3 py-2 font-medium">{i.label}</td>
                  <td className="px-3 py-2 text-muted-foreground">{i.due_date}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(i.amount, invoice.currency)}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex rounded-sm border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase",
                      i.status === "paid" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : i.status === "overdue" ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-slate-200 bg-slate-50 text-slate-700")}>
                      {i.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {i.status === "paid" ? (
                      <Button variant="ghost" size="sm" onClick={async () => {
                        await revert({ data: { installment_id: i.id } });
                        toast.success("Reverted");
                        void q.refetch();
                      }} className="h-7 rounded-sm text-[11px] text-muted-foreground">
                        <RotateCcw className="mr-1 size-3" /> Revert
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setPayModal(i)}
                        className="h-7 rounded-sm text-[11px]">
                        <CheckCircle2 className="mr-1 size-3" /> Mark paid
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
        <div className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Project cost</h2>
          </div>
          <div className="space-y-1.5 px-4 py-3 text-[12.5px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Invoice total</span>
              <span className="font-mono">{invoice.currency} {Number(invoice.total_amount).toFixed(2)}</span>
            </div>
            {projectCosts.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="truncate">{c.name}</span>
                  {c.description && <span className="block text-[11px] text-muted-foreground">{c.description}</span>}
                </span>
                <span className="font-mono text-muted-foreground">− {Number(c.amount).toFixed(2)}</span>
              </div>
            ))}
            {!projectCosts.length && <div className="text-[11.5px] text-muted-foreground">No project costs recorded.</div>}
            <div className="flex items-center justify-between border-t border-border pt-1.5">
              <span className="text-muted-foreground">Total project cost</span>
              <span className="font-mono">− {invoice.currency} {costTotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold">Net distributable</span>
              <span className="font-mono font-semibold">{invoice.currency} {netDistributable.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Stakeholders</h2>
            <p className="text-[11px] text-muted-foreground">Percent of net distributable</p>
          </div>
          <div className="divide-y divide-border">
            {stakeholders.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-medium">{s.user_name ?? s.user_id.slice(0, 8)}</div>
                  <span className={cn("mt-0.5 inline-flex rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase", ROLE_COLORS[s.role])}>
                    {s.role.replace("_"," ")}
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[12.5px] font-semibold">{s.percent}%</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {invoice.currency} {((netDistributable * Number(s.percent)) / 100).toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">Payouts</h2>
          <p className="text-[11.5px] text-muted-foreground">Auto-generated per installment × stakeholder. Unlocks when the installment is marked paid.</p>
        </div>
        <table className="w-full text-[12.5px]">
          <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Installment</th>
              <th className="px-3 py-2">Stakeholder</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => {
              const stk = stakeholders.find((s) => s.id === p.stakeholder_id);
              const inst = installments.find((i) => i.id === p.installment_id);
              return (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2">{inst?.label ?? "—"} <span className="text-muted-foreground">#{inst?.sequence}</span></td>
                  <td className="px-3 py-2 font-medium">{stk?.user_name ?? "—"}</td>
                  <td className="px-3 py-2 capitalize text-muted-foreground">{p.role.replace("_"," ")}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(p.amount, p.currency)}</td>
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex rounded-sm border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase",
                      p.status === "available" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : p.status === "paid" ? "border-blue-200 bg-blue-50 text-blue-700"
                      : p.status === "requested" ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-slate-200 bg-slate-50 text-slate-600")}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Delivery */}
      <DeliveryPanel events={events.data ?? []} loading={events.isLoading} />

      <ActivityPanel logs={activity.data ?? []} loading={activity.isLoading} />

      {/* Send dialog */}
      {sendOpen && (
        <SendInvoiceDialog
          recipients={recipients.data ?? []}
          selected={selectedEmails}
          onSelectedChange={setSelectedEmails}
          sending={sendMutation.isPending}
          onClose={() => setSendOpen(false)}
          onSend={() => sendMutation.mutate()}
        />
      )}

      {editOpen && (
        <EditInvoiceDialog
          invoice={invoice}
          installments={installments}
          stakeholders={stakeholders}
          projectCosts={q.data.projectCosts ?? []}
          customers={customers.data ?? []}
          employees={employees.data ?? []}
          saving={updateMutation.isPending}
          onClose={() => setEditOpen(false)}
          onSave={(payload: UpdateInvoicePayload) => updateMutation.mutate(payload)}
        />
      )}


      {payModal && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/80 p-2 sm:p-4">
          <div className="w-full max-w-md rounded-md border border-border bg-card p-5 shadow-lg">
            <h3 className="text-[14px] font-semibold">Mark installment paid</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {payModal.label} · {fmt(payModal.amount, invoice.currency)}
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground">Payment reference</label>
                <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} className="mt-1 h-9 rounded-sm" placeholder="TxnID / cheque no." />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase text-muted-foreground">Method</label>
                <Input value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="mt-1 h-9 rounded-sm" placeholder="Bank / bKash / cash / wire" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPayModal(null)} className="h-9 rounded-sm">Cancel</Button>
              <Button onClick={() => doPay.mutate()} disabled={doPay.isPending}
                className="h-9 rounded-sm bg-emerald-600 hover:bg-emerald-700">
                {doPay.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityPanel({ logs, loading }: { logs: InvoiceActivityLogRow[]; loading: boolean }) {
  return (
    <div id="activity" className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold"><Activity className="size-3.5" /> Activity log</h2>
      </div>
      {loading ? (
        <div className="p-6 text-center text-[12px] text-muted-foreground">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="p-6 text-center text-[12px] text-muted-foreground">No invoice activity recorded yet.</div>
      ) : (
        <ol className="divide-y divide-border">
          {logs.map((log) => (
            <li key={log.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[140px_1fr] sm:gap-4">
              <div className="font-mono text-[10.5px] text-muted-foreground">{new Date(log.created_at).toLocaleString()}</div>
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-semibold text-foreground">{log.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{log.actor_name ?? (log.actor_id ? log.actor_id.slice(0, 8) : "System")}</span>
                  <span>·</span>
                  <span className="font-mono uppercase">{log.action.replaceAll("_", " ")}</span>
                  {log.body && <><span>·</span><span className="truncate">{log.body}</span></>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StatBox({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "warn" | "neutral" }) {
  return (
    <div className="rounded-sm border border-border bg-background p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono text-[15px] font-semibold",
        tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-foreground")}>
        {value}
      </div>
    </div>
  );
}

function DeliveryPanel({ events, loading }: { events: InvoiceEmailEventRow[]; loading: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold flex items-center gap-1.5"><Mail className="size-3.5" /> Delivery</h2>
        <p className="text-[11.5px] text-muted-foreground">Live status of every invoice email sent from Branta. Updates automatically as Resend reports back.</p>
      </div>
      {loading ? (
        <div className="p-6 text-center text-[12px] text-muted-foreground">Loading…</div>
      ) : events.length === 0 ? (
        <div className="p-6 text-center text-[12px] text-muted-foreground">No emails sent yet. Click <b>Send invoice</b> to deliver a branded PDF.</div>
      ) : (
        <ul className="divide-y divide-border">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-medium">{e.recipient_email}</div>
                <div className="truncate text-[11px] text-muted-foreground">{e.subject}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] text-muted-foreground">
                  {new Date(e.created_at).toLocaleString()}
                </span>
                <DeliveryChip status={e.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeliveryChip({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; Icon: typeof Clock }> = {
    queued: { label: "Queued", className: "border-slate-200 bg-slate-50 text-slate-600", Icon: Clock },
    sending: { label: "Sending", className: "border-slate-200 bg-slate-50 text-slate-600", Icon: Clock },
    sent: { label: "Sent", className: "border-blue-200 bg-blue-50 text-blue-700", Icon: Send },
    delivered: { label: "Delivered", className: "border-emerald-200 bg-emerald-50 text-emerald-700", Icon: CheckCheck },
    opened: { label: "Opened", className: "border-violet-200 bg-violet-50 text-violet-700", Icon: MailOpen },
    bounced: { label: "Bounced", className: "border-rose-200 bg-rose-50 text-rose-700", Icon: AlertCircle },
    complained: { label: "Complained", className: "border-rose-200 bg-rose-50 text-rose-700", Icon: AlertCircle },
    failed: { label: "Failed", className: "border-rose-200 bg-rose-50 text-rose-700", Icon: AlertCircle },
    suppressed: { label: "Suppressed", className: "border-amber-200 bg-amber-50 text-amber-700", Icon: AlertCircle },
    delivery_delayed: { label: "Delayed", className: "border-amber-200 bg-amber-50 text-amber-700", Icon: Clock },
  };
  const cfg = map[status] ?? map.queued;
  const Icon = cfg.Icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10.5px] font-semibold uppercase", cfg.className)}>
      <Icon className="size-3" /> {cfg.label}
    </span>
  );
}

function EditInvoiceDialog({
  invoice,
  installments,
  stakeholders,
  projectCosts,
  customers,
  employees,
  saving,
  onClose,
  onSave,
}: {
  invoice: InvoiceRow;
  installments: InstallmentRow[];
  stakeholders: StakeholderRow[];
  projectCosts: Array<{ name: string; amount: number; description: string | null }>;
  customers: Array<{ id: string; customer_code: string; name: string; company: string | null; email: string | null; phone: string | null }>;
  employees: Array<{ user_id: string; full_name: string | null; employee_code: string | null; job_role: string | null; email?: string | null }>;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: UpdateInvoicePayload) => void;
}) {
  const [customerId, setCustomerId] = useState(invoice.customer_id);
  const [title, setTitle] = useState(invoice.title);
  const [description, setDescription] = useState(invoice.description ?? "");
  const [projectType, setProjectType] = useState<"one_time" | "monthly_retainer">(invoice.project_type);
  const [currency, setCurrency] = useState<Currency>(invoice.currency);
  const [total, setTotal] = useState(String(invoice.total_amount));
  const [startsOn, setStartsOn] = useState(invoice.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(invoice.ends_on ?? "");
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [internalNotes, setInternalNotes] = useState(invoice.internal_notes ?? "");
  const [editInstallments, setEditInstallments] = useState<EditInstallment[]>(
    installments.map((i) => ({ label: i.label, amount: Number(i.amount), due_date: i.due_date })),
  );
  const [editStakeholders, setEditStakeholders] = useState<EditStakeholder[]>(
    stakeholders.map((s) => ({ user_id: s.user_id, role: s.role, percent: Number(s.percent) })),
  );

  const [editCosts, setEditCosts] = useState<ProjectCost[]>(
    projectCosts.map((c) => ({ name: c.name, amount: Number(c.amount), description: c.description ?? "" })),
  );

  const customerItems: SearchableItem[] = customers.map((c) => ({
    value: c.id,
    label: `${c.customer_code} · ${c.name}`,
    hint: c.company ?? c.email ?? c.phone ?? undefined,
    keywords: [c.name, c.customer_code, c.email, c.phone, c.company],
  }));
  const employeeItems: SearchableItem[] = employees.map((e) => ({
    value: e.user_id,
    label: e.full_name ?? e.user_id.slice(0, 8),
    hint: e.employee_code ?? e.email ?? undefined,
    keywords: [e.full_name, e.employee_code, e.job_role, e.email],
  }));
  const totalNum = Number(total) || 0;
  const instSum = editInstallments.reduce((a, i) => a + Number(i.amount || 0), 0);
  const pctSum = editStakeholders.reduce((a, s) => a + Number(s.percent || 0), 0);
  const costSum = sumProjectCosts(editCosts);
  const canSave =
    !!customerId && !!title.trim() && totalNum > 0 &&
    Math.abs(instSum - totalNum) < 0.01 && Math.abs(pctSum - 100) < 0.01 &&
    editInstallments.every((i) => i.label.trim() && i.due_date && Number(i.amount) > 0) &&
    editStakeholders.every((s) => s.user_id && Number(s.percent) > 0) &&
    editCosts.every((c) => c.name.trim()) && costSum <= totalNum + 0.01;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/80 p-2 sm:p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-md border border-border bg-card shadow-lg">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-3">
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold"><Pencil className="size-3.5" /> Edit invoice {invoice.slug}</h3>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} className="h-8 rounded-sm text-[12px]">Cancel</Button>
            <Button
              onClick={() => onSave({
                id: invoice.id,
                customer_id: customerId,
                title: title.trim(),
                description: description.trim() || null,
                project_type: projectType,
                starts_on: startsOn || null,
                ends_on: endsOn || null,
                currency,
                total_amount: totalNum,
                notes: notes.trim() || null,
                internal_notes: internalNotes.trim() || null,
                installments: editInstallments.map((i) => ({ label: i.label.trim(), amount: Number(i.amount), due_date: i.due_date })),
                stakeholders: editStakeholders.map((s) => ({ user_id: s.user_id, role: s.role, percent: Number(s.percent) })),
                project_costs: editCosts
                  .filter((c) => c.name.trim() || Number(c.amount) > 0)
                  .map((c) => ({ name: c.name.trim(), amount: Number(c.amount) || 0, description: c.description.trim() || null })),
              })}
              disabled={!canSave || saving}
              className="h-8 rounded-sm bg-primary text-[12px] text-primary-foreground hover:bg-brand-700"
            >
              {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Save changes
            </Button>
          </div>
        </div>
        <div className="grid gap-4 p-5">
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer *</Label>
              <div className="mt-1"><SearchableSelect items={customerItems} value={customerId} onChange={setCustomerId} placeholder="— Choose customer —" emptyText="No customer matches" /></div>
            </div>
            <div className="md:col-span-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-9 rounded-sm" />
            </div>
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Project type</Label>
              <select value={projectType} onChange={(e) => setProjectType(e.target.value as "one_time" | "monthly_retainer")} className="mt-1 h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
                <option value="one_time">One-time</option>
                <option value="monthly_retainer">Monthly retainer</option>
              </select>
            </div>
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Currency</Label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="mt-1 h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
                <option value="BDT">BDT (৳)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total amount *</Label>
              <Input type="number" value={total} onChange={(e) => setTotal(e.target.value)} className="mt-1 h-9 rounded-sm font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Starts</Label><Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="mt-1 h-9 rounded-sm" /></div>
              <div><Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ends</Label><Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="mt-1 h-9 rounded-sm" /></div>
            </div>
            <div className="md:col-span-2"><Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1 rounded-sm text-[13px]" /></div>
          </section>

          <section className="rounded-sm border border-border p-3">
            <div className="mb-2 flex items-center justify-between"><h4 className="text-[13px] font-semibold">Installments</h4><span className={cn("font-mono text-[11px]", Math.abs(instSum - totalNum) < 0.01 ? "text-emerald-600" : "text-rose-600")}>{instSum.toFixed(2)} / {totalNum.toFixed(2)}</span></div>
            <div className="space-y-2">
              {editInstallments.map((i, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <div className="col-span-1 grid place-items-center font-mono text-[11px] text-muted-foreground">#{idx + 1}</div>
                  <Input value={i.label} onChange={(e) => setEditInstallments(editInstallments.map((x, k) => k === idx ? { ...x, label: e.target.value } : x))} className="col-span-4 h-8 rounded-sm text-[12px]" />
                  <Input type="date" value={i.due_date} onChange={(e) => setEditInstallments(editInstallments.map((x, k) => k === idx ? { ...x, due_date: e.target.value } : x))} className="col-span-3 h-8 rounded-sm text-[12px]" />
                  <Input type="number" value={i.amount} onChange={(e) => setEditInstallments(editInstallments.map((x, k) => k === idx ? { ...x, amount: Number(e.target.value) } : x))} className="col-span-3 h-8 rounded-sm font-mono text-[12px]" />
                  <button type="button" onClick={() => setEditInstallments(editInstallments.filter((_, k) => k !== idx))} disabled={editInstallments.length === 1} className="col-span-1 grid place-items-center rounded-sm text-rose-600 hover:bg-rose-50"><Trash2 className="size-3.5" /></button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditInstallments([...editInstallments, { label: "", amount: 0, due_date: new Date().toISOString().slice(0, 10) }])} className="mt-2 h-7 rounded-sm text-[11px]"><Plus className="mr-1 size-3" /> Add installment</Button>
          </section>

          <section className="rounded-sm border border-border p-3">
            <ProjectCostEditor costs={editCosts} onChange={setEditCosts} total={totalNum} currency={currency} compact />
          </section>

          <section className="rounded-sm border border-border p-3">
            <div className="mb-2 flex items-center justify-between"><h4 className="text-[13px] font-semibold">Stakeholders</h4><span className={cn("font-mono text-[11px]", Math.abs(pctSum - 100) < 0.01 ? "text-emerald-600" : "text-rose-600")}>{pctSum.toFixed(2)}%</span></div>
            <div className="space-y-2">
              {editStakeholders.map((s, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2">
                  <div className="col-span-5"><SearchableSelect items={employeeItems} value={s.user_id} onChange={(v) => setEditStakeholders(editStakeholders.map((x, k) => k === idx ? { ...x, user_id: v } : x))} placeholder="— Employee —" emptyText="No employee matches" className="h-8 text-[12px]" /></div>
                  <select value={s.role} onChange={(e) => setEditStakeholders(editStakeholders.map((x, k) => k === idx ? { ...x, role: e.target.value as StakeholderRole } : x))} className="col-span-4 h-8 rounded-sm border border-input bg-background px-2 text-[12px] capitalize">
                    <option value="outreach">Outreach</option><option value="lead_closer">Lead closer</option><option value="worker">Worker</option><option value="company">Company</option>
                  </select>
                  <Input type="number" value={s.percent} onChange={(e) => setEditStakeholders(editStakeholders.map((x, k) => k === idx ? { ...x, percent: Number(e.target.value) } : x))} className="col-span-2 h-8 rounded-sm font-mono text-[12px]" />
                  <button type="button" onClick={() => setEditStakeholders(editStakeholders.filter((_, k) => k !== idx))} disabled={editStakeholders.length === 1} className="col-span-1 grid place-items-center rounded-sm text-rose-600 hover:bg-rose-50"><Trash2 className="size-3.5" /></button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditStakeholders([...editStakeholders, { user_id: "", role: "worker", percent: 0 }])} className="mt-2 h-7 rounded-sm text-[11px]"><Plus className="mr-1 size-3" /> Add stakeholder</Button>
          </section>

          <div className="grid gap-3 md:grid-cols-2">
            <div><Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 rounded-sm text-[13px]" /></div>
            <div><Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Internal notes</Label><Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} className="mt-1 rounded-sm text-[13px]" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SendInvoiceDialog({
  recipients, selected, onSelectedChange, onClose, onSend, sending,
}: {
  recipients: InvoiceRecipient[];
  selected: Record<string, boolean>;
  onSelectedChange: (m: Record<string, boolean>) => void;
  onClose: () => void;
  onSend: () => void;
  sending: boolean;
}) {
  const toggle = (email: string) => onSelectedChange({ ...selected, [email]: !selected[email] });
  const anySelected = useMemo(() => Object.values(selected).some(Boolean), [selected]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/80 p-2 sm:p-4">
      <div className="w-full max-w-md rounded-md border border-border bg-card p-5 shadow-lg">
        <h3 className="text-[14px] font-semibold flex items-center gap-1.5"><Send className="size-3.5" /> Send invoice</h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Delivered from <b>finance@brantatech.com</b> with the branded PDF attached.
        </p>
        <div className="mt-4 space-y-1.5 max-h-64 overflow-auto">
          {recipients.length === 0 && (
            <div className="rounded-sm border border-dashed border-border p-4 text-center text-[12px] text-muted-foreground">
              No email on this customer or its contacts. Add one on the customer's lead first.
            </div>
          )}
          {recipients.map((r) => (
            <label key={r.email} className="flex items-center gap-2 rounded-sm border border-border px-3 py-2 hover:bg-muted/40 cursor-pointer">
              <input type="checkbox" checked={!!selected[r.email]} onChange={() => toggle(r.email)} className="accent-brand" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium">{r.name || r.email.split("@")[0]}</div>
                <div className="truncate text-[11px] text-muted-foreground">{r.email}</div>
              </div>
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">{r.label ?? (r.is_primary ? "Primary" : r.role || r.source)}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} className="h-9 rounded-sm">Cancel</Button>
          <Button onClick={onSend} disabled={sending || !anySelected} className="h-9 rounded-sm bg-brand text-white hover:bg-brand/90">
            {sending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
