import { CustomerDrawer } from "@/components/finance/customer-drawer";
import type { CustomerRow } from "@/lib/customers.functions";
import type { Currency } from "@/lib/finance.functions";

/** Invoice "Quick add customer" reuses the one New customer drawer. */
export function QuickCustomerDialog(props: { open: boolean; onOpenChange: (o: boolean) => void; defaultCurrency?: Currency; onCreated: (c: CustomerRow) => void }) {
  return <CustomerDrawer {...props} />;
}
