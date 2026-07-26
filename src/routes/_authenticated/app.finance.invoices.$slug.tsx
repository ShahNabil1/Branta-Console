import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getInvoiceBySlug,
  markInstallmentPaid,
  revertInstallment,
  deleteInvoice,
  type InstallmentRow,
} from "@/lib/finance.functions";
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
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Loader2, ArrowLeft, Trash2, CheckCircle2, RotateCcw, Send, Download, Mail, Clock, CheckCheck, MailOpen, AlertCircle } from "lucide-react";
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

function InvoiceDetail() {
  const { slug } = useParams({ from: "/_authenticated/app/finance/invoices/$slug" });
  const navigate = useNavigate();
  const confirm = useConfirm();
  const getFn = useServerFn(getInvoiceBySlug);
  const markPaid = useServerFn(markInstallmentPaid);
  const revert = useServerFn(revertInstallment);
  const del = useServerFn(deleteInvoice);
  const listRecips = useServerFn(listInvoiceRecipients);
  const listEvents = useServerFn(listInvoiceEmailEvents);
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

  useEffect(() => {
    const ch = supabase.channel(`finance:invoice:${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_installments" }, () => void q.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_payouts" }, () => void q.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => void q.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_email_events" }, () => void events.refetch())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [slug, q, events]);

  const [payModal, setPayModal] = useState<InstallmentRow | null>(null);
  const [payRef, setPayRef] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
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
    },
    onError: (e) => toast.error((e as Error).message),

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
              onClick={async () => {
                try {
                  const { url } = await getPdfUrl({ data: { slug: invoice.slug } });
                  window.open(url, "_blank");
                } catch (e) { toast.error((e as Error).message); }
              }}
              className="h-8 rounded-sm text-[12px]"
              title="Download PDF"
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

        <div className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Stakeholders</h2>
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
                <div className="text-right font-mono text-[12.5px] font-semibold">{s.percent}%</div>
              </div>
            ))}
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


      {payModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4">
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
