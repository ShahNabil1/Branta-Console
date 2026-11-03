// Mirrors company_wallet_credit_installment: fixed funds first (in order, capped at what is left),
// then percentage funds split the remainder; the last percentage fund absorbs rounding.
export type FundRule = { label: string; mode: "percent" | "fixed"; percent: number; fixed_amount: number };
export type FundShare = { index: number; amount: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function splitInstallment(amount: number, rules: FundRule[]) {
  const shares: FundShare[] = rules.map((_, index) => ({ index, amount: 0 }));
  let left = Math.max(0, r2(amount));
  rules.forEach((r, i) => {
    if (r.mode !== "fixed") return;
    const s = Math.min(Math.max(0, r.fixed_amount || 0), left);
    shares[i].amount = r2(s);
    left = r2(left - s);
  });
  const fixedTotal = r2(Math.max(0, amount) - left);
  const net = left;
  const pctIdx = rules.map((r, i) => (r.mode === "percent" && (r.percent || 0) > 0 ? i : -1)).filter((i) => i >= 0);
  const last = pctIdx[pctIdx.length - 1];
  for (const i of pctIdx) {
    const s = i === last ? left : r2((net * rules[i].percent) / 100);
    shares[i].amount = r2(s);
    left = r2(left - s);
  }
  return { shares, fixedTotal, net };
}

export const percentTotal = (rules: FundRule[]) =>
  Math.round(rules.filter((r) => r.mode === "percent").reduce((s, r) => s + (Number(r.percent) || 0), 0) * 1000) / 1000;
