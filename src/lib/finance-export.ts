export type FinanceIncome = {
  date: string;
  transactionId: string;
  party: string;
  purpose: string;
  method: string;
  amount: number;
};
export type FinanceExpense = {
  date: string;
  purpose: string;
  transactionId: string;
  amount: number;
};
export type FinanceExport = {
  companyName: string;
  income: FinanceIncome[];
  expenses: FinanceExpense[];
  from: string | null;
  to: string | null;
  missingFields: string[];
};
export const INCOME_HEADERS = [
  "SL",
  "Date",
  "Transaction ID",
  "Client / Source",
  "Project / Purpose",
  "Payment Method",
  "Amount (BDT)",
];
export const EXPENSE_HEADERS = ["SL", "Date", "Expense Purpose", "Transaction ID", "Amount (BDT)"];
export const SUMMARY_HEADERS = [
  "Report Period",
  "Total Income",
  "Total Expense",
  "Net Profit / Loss",
  "Status",
];
export const MONTH_HEADERS = ["Month", "Income", "Expense", "Net Profit / Loss"];
export const dateLabel = (date: string) =>
  date ? date.slice(0, 10).split("-").reverse().join("/") : "";
export const periodLabel = (r: Pick<FinanceExport, "from" | "to">) =>
  !r.from && !r.to
    ? "All time"
    : `${r.from ? dateLabel(r.from) : "Beginning"} to ${r.to ? dateLabel(r.to) : "Present"}`;
export const financeFilename = (r: Pick<FinanceExport, "from" | "to">, ext: "xlsx" | "pdf") =>
  `Finance_Report_${r.from ?? "All"}_to_${r.to ?? "Time"}.${ext}`;
export const moneyLabel = (value: number) =>
  value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function financeSummary(r: Pick<FinanceExport, "income" | "expenses">) {
  const months = new Map<string, { month: string; income: number; expense: number; net: number }>();
  let incomeCents = 0,
    expenseCents = 0;
  for (const [kind, rows] of [
    ["income", r.income],
    ["expense", r.expenses],
  ] as const) {
    for (const row of rows) {
      const cents = Math.round(row.amount * 100);
      if (kind === "income") incomeCents += cents;
      else expenseCents += cents;
      const key = row.date.slice(0, 7);
      const month = months.get(key) ?? { month: key, income: 0, expense: 0, net: 0 };
      month[kind] += cents;
      months.set(key, month);
    }
  }
  const income = incomeCents / 100,
    expense = expenseCents / 100,
    net = (incomeCents - expenseCents) / 100;
  return {
    income,
    expense,
    net,
    status: net > 0 ? "Profit" : net < 0 ? "Loss" : "Break-even",
    months: [...months.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({
        month: m.month,
        income: m.income / 100,
        expense: m.expense / 100,
        net: (m.income - m.expense) / 100,
      })),
  };
}
export async function deliverFinanceFile(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
