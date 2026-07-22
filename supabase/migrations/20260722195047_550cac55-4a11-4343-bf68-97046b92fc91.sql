CREATE OR REPLACE VIEW public.v_wallet_balances AS
SELECT user_id,
    currency,
    sum(CASE WHEN status = 'locked'::payout_status THEN amount ELSE 0::numeric END) AS locked,
    sum(CASE WHEN status = 'available'::payout_status THEN amount ELSE 0::numeric END) AS available,
    sum(CASE WHEN status = 'requested'::payout_status THEN amount ELSE 0::numeric END) AS requested,
    sum(CASE WHEN status = 'paid'::payout_status THEN amount ELSE 0::numeric END) AS paid_total
FROM public.invoice_payouts p
WHERE role IS DISTINCT FROM 'company'
GROUP BY user_id, currency;