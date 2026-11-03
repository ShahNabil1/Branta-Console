import { DiscardCancelButton } from "@/components/company/danger-confirm";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { createCustomer, type CustomerRow } from "@/lib/customers.functions";
import type { Currency } from "@/lib/finance.functions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCurrency?: Currency;
  onCreated: (c: CustomerRow) => void;
}

export function QuickCustomerDialog({ open, onOpenChange, defaultCurrency = "BDT", onCreated }: Props) {
  const create = useServerFn(createCustomer);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);

  const reset = () => {
    setName(""); setEmail(""); setPhone(""); setCompany(""); setCurrency(defaultCurrency);
  };

  const submit = useMutation({
    mutationFn: async () => {
      return await create({ data: {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        company: company.trim() || null,
        currency,
      }});
    },
    onSuccess: (c) => {
      toast.success(`Customer ${c.customer_code} created`);
      qc.invalidateQueries({ queryKey: ["customers"] });
      onCreated(c);
      reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const canSubmit = name.trim().length > 0 && !submit.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-md rounded-md">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Quick add customer</DialogTitle>
          <DialogDescription className="text-[12px]">
            Only name is required. You can add more details later from the Customers page.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 rounded-sm" placeholder="Full name" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-9 rounded-sm" placeholder="name@example.com" />
            </div>
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 h-9 rounded-sm" placeholder="+880…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} className="mt-1 h-9 rounded-sm" placeholder="Optional" />
            </div>
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Currency</Label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}
                className="mt-1 h-9 w-full rounded-sm border border-input bg-background px-2 text-[13px]">
                <option value="BDT">BDT (৳)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <DiscardCancelButton dirty={!!(name.trim() || email.trim() || phone.trim() || company.trim() || currency !== defaultCurrency)} className="h-9 rounded-sm" onCancel={() => { reset(); onOpenChange(false); }} />
          <Button onClick={() => submit.mutate()} disabled={!canSubmit}
            className="h-9 rounded-sm bg-primary hover:bg-brand-700">
            {submit.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Create customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
