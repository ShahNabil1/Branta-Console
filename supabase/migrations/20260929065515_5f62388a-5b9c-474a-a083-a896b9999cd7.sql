create or replace view public.fund_balances with (security_invoker=true) as
SELECT f.id AS fund_id, f.code, f.name, f.kind, f.is_active, f.display_order,
    COALESCE(sum(l.amount) FILTER (WHERE l.direction = 'credit'), 0::numeric) AS total_credits,
    COALESCE(sum(l.amount) FILTER (WHERE l.direction = 'debit'), 0::numeric) AS total_debits,
    COALESCE(sum(CASE WHEN l.direction = 'credit' THEN l.amount ELSE - l.amount END), 0::numeric) AS ledger_balance,
    COALESCE((SELECT sum(i.amount) FROM installment_allocation_items i JOIN installment_allocations a ON a.id = i.allocation_id
              WHERE i.fund_id = f.id AND a.status = 'active'), 0::numeric) AS allocation_total,
    COALESCE(sum(l.amount) FILTER (WHERE l.direction = 'debit' AND (l.transaction_type <> ALL (ARRAY['transfer_out','loan_out','reversal','loan_repayment']))), 0::numeric)
      - COALESCE(sum(l.amount) FILTER (WHERE l.direction = 'credit' AND l.transaction_type = 'expense_reversal'), 0::numeric) AS spent_total,
    CASE WHEN f.code = 'employee' THEN COALESCE((SELECT sum(e.amount) FROM employee_fund_payments e WHERE e.status = 'committed'), 0::numeric) ELSE 0::numeric END AS committed,
    COALESCE((SELECT sum(x.principal_amount - x.repaid_amount) FROM fund_loans x WHERE x.to_fund_id = f.id AND x.status = ANY (ARRAY['open','partially_repaid'])), 0::numeric) AS borrowed,
    COALESCE((SELECT sum(x.principal_amount - x.repaid_amount) FROM fund_loans x WHERE x.from_fund_id = f.id AND x.status = ANY (ARRAY['open','partially_repaid'])), 0::numeric) AS lent,
    COALESCE((SELECT sum(z.amount) FROM fund_ledger z WHERE z.fund_id = f.id AND z.direction = 'debit' AND z.transaction_type = ANY (ARRAY['employee_payment','salary_payment','bonus','incentive','commission','overtime','adjustment'])), 0::numeric) AS paid_total
FROM finance_funds f LEFT JOIN fund_ledger l ON l.fund_id = f.id
GROUP BY f.id;