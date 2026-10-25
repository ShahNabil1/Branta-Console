import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, FileText, ExternalLink, ShieldX } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { getExpenseByLink } from "@/lib/expense-share.functions";

export const Route = createFileRoute("/_authenticated/x/$voucher")({
  head: ({ params }) => ({
    meta: [
      { title: `Voucher ${params.voucher} · Branta Tech` },
      { name: "description", content: `Private expense voucher ${params.voucher} from Branta Tech.` },
      { property: "og:title", content: `Voucher ${params.voucher} · Branta Tech` },
      { property: "og:description", content: `Private expense voucher ${params.voucher} from Branta Tech.` },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharedVoucherPage,
});

function money(n: number, cur: string) {
  return (cur === "BDT" ? "৳ " : "$ ") + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

function SharedVoucherPage() {
  const { voucher } = Route.useParams();
  const fetchFn = useServerFn(getExpenseByLink);
  const q = useQuery({
    queryKey: ["expense-link", voucher],
    queryFn: () => fetchFn({ data: { voucher } }),
    retry: false,
  });

  if (q.isLoading) {
    return <div className="grid h-72 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }
  if (q.isError || !q.data || q.data.status !== "ok") {
    const forbidden = q.data?.status === "forbidden";
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <ShieldX className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-3 text-[18px] font-semibold">{forbidden ? "You don't have access" : "Voucher not found"}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {forbidden
            ? "This expense voucher is visible only to Finance team members. Ask a Finance admin if you need it."
            : "This voucher doesn't exist or has been deleted."}
        </p>
        <Link to="/app" className="mt-4 inline-block text-[13px] text-primary underline">Go to dashboard</Link>
      </div>
    );
  }

  const e = q.data.expense;
  const rows: Array<[string, string]> = [
    ["Date", e.spent_on],
    ["Category", e.category],
    ["Department", e.department ?? "—"],
    ["Paid to / Vendor", e.vendor ?? "—"],
    ["Requested by", e.requested_by_name ?? "—"],
    ["Paid by", e.paid_by_name ?? "—"],
    ["Payment method", e.payment_method ?? "—"],
    ["Transaction ID", e.txn_id ?? "—"],
    ["Project", e.invoice_title ? `${e.invoice_slug} — ${e.invoice_title}` : "—"],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Expense voucher</p>
          <h1 className="font-mono text-[22px] font-semibold">{e.voucher_no ?? voucher}</h1>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase text-muted-foreground">Amount</p>
          <p className="font-mono text-[22px] font-semibold text-primary">{money(e.amount, e.currency)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="bg-card px-3 py-2">
            <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{k}</p>
            <p className="text-[13px] capitalize">{v}</p>
          </div>
        ))}
      </div>

      {e.request_purpose && (
        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Purpose of this payment</p>
          <p className="mt-1 text-[15px] font-semibold leading-snug">{e.request_purpose}</p>
          {e.notes && <p className="mt-2 text-[12.5px] text-muted-foreground">{e.notes}</p>}
        </div>
      )}

      {e.items.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[520px] text-[12.5px]">
            <thead className="border-b border-border bg-muted/30 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2 text-right">Unit price</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {e.items.map((i, k) => (
                <tr key={k} className="border-t border-border">
                  <td className="px-3 py-2">
                    {i.name}
                    {i.note && <span className="block text-[11px] text-muted-foreground">{i.note}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono">{i.quantity}{i.unit ? ` ${i.unit}` : ""}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(i.unit_price, e.currency)}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(i.amount, e.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {e.receipts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-[13px] font-semibold">Receipts &amp; proof</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {e.receipts.map((r, k) => (
              <div key={k} className="overflow-hidden rounded-md border border-border bg-card">
                {r.is_pdf ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-4 text-[12.5px] text-primary">
                    <FileText className="size-4" /> Open PDF proof <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    <img src={r.url} alt={r.caption ?? `Receipt ${k + 1}`} className="max-h-64 w-full object-contain bg-muted" />
                  </a>
                )}
                <p className="border-t border-border px-3 py-1.5 text-[11.5px] text-muted-foreground">
                  {r.caption || `Receipt ${k + 1}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="pt-4 text-center text-[11px] text-muted-foreground">
        Branta Tech · Helpline 09644228678 · accounts@brantatech.org
      </p>
    </div>
  );
}
