
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4">
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
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">{r.is_primary ? "Primary" : r.role || r.source}</span>
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
