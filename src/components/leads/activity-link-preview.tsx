import { useActiveCompany } from "@/components/company/company-switcher";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getInvoiceBySlug } from "@/lib/finance.functions";
import { getCustomerByCode } from "@/lib/customers.functions";

type Props =
  | { kind: "invoice"; slug: string }
  | { kind: "customer"; code: string };

export function ActivityLinkPreview(props: Props) {
  const [open, setOpen] = useState(false);
  const label = props.kind === "invoice" ? props.slug : props.code;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-brand hover:bg-muted"
      >
        Open {label} →
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          {props.kind === "invoice" ? (
            <InvoicePreview slug={props.slug} onClose={() => setOpen(false)} />
          ) : (
            <CustomerPreview code={props.code} onClose={() => setOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function money(n: number | null | undefined, currency: string | null | undefined) {
  if (n == null) return "—";
  const c = currency ?? "BDT";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: c }).format(n);
  } catch {
    return `${c} ${n.toLocaleString()}`;
  }
}

function InvoicePreview({ slug, onClose }: { slug: string; onClose: () => void }) {
  const fn = useServerFn(getInvoiceBySlug);
  const q = useQuery({
    queryKey: ["preview", "invoice", slug],
    queryFn: () => fn({ data: { slug } }),
    staleTime: 15_000,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-mono text-[13px]">Invoice {slug}</DialogTitle>
      </DialogHeader>
      {q.isLoading ? (
        <div className="grid place-items-center py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : q.isError || !q.data ? (
        <div className="py-6 text-center text-[12.5px] text-muted-foreground">
          Could not load invoice.
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[12.5px]">
            <dt className="text-muted-foreground">Customer</dt>
            <dd className="text-foreground">
              {q.data.invoice.customer_name ?? "—"}
              {q.data.invoice.customer_code && (
                <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                  {q.data.invoice.customer_code}
                </span>
              )}
            </dd>
            <dt className="text-muted-foreground">Title</dt>
            <dd className="text-foreground">{q.data.invoice.title ?? "—"}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-mono text-[11px] uppercase tracking-wider text-foreground">
              {q.data.invoice.status}
            </dd>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-mono text-foreground">
              {money(q.data.invoice.total_amount, q.data.invoice.currency)}
            </dd>
            <dt className="text-muted-foreground">Installments</dt>
            <dd className="text-foreground">{q.data.installments.length}</dd>
          </dl>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button asChild size="sm">
              <Link
                to="/app/finance/invoices/$slug"
                params={{ slug }}
                onClick={onClose}
              >
                Open invoice
                <ArrowUpRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          </div>
        </>
      )}
    </>
  );
}

function CustomerPreview({ code, onClose }: { code: string; onClose: () => void }) {
  const fn = useServerFn(getCustomerByCode);
  const workspace = useActiveCompany().active?.slug ?? null;
  const q = useQuery({
    queryKey: ["preview", "customer", code, workspace],
    queryFn: () => fn({ data: { code, workspace } }),
    staleTime: 15_000,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-mono text-[13px]">Customer {code}</DialogTitle>
      </DialogHeader>
      {q.isLoading ? (
        <div className="grid place-items-center py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : q.isError || !q.data ? (
        <div className="py-6 text-center text-[12.5px] text-muted-foreground">
          Could not load customer.
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[12.5px]">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="text-foreground">{q.data.customer.name}</dd>
            <dt className="text-muted-foreground">Company</dt>
            <dd className="text-foreground">{q.data.customer.company ?? "—"}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="text-foreground">{q.data.customer.email ?? "—"}</dd>
            <dt className="text-muted-foreground">Phone</dt>
            <dd className="text-foreground">{q.data.customer.phone ?? "—"}</dd>
            <dt className="text-muted-foreground">Service</dt>
            <dd className="text-foreground">{q.data.customer.service ?? "—"}</dd>
            <dt className="text-muted-foreground">Currency</dt>
            <dd className="font-mono text-foreground">{q.data.customer.currency}</dd>
          </dl>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button asChild size="sm">
              <Link to="/app/customers/$code" params={{ code }} onClick={onClose}>
                Open customer
                <ArrowUpRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          </div>
        </>
      )}
    </>
  );
}
