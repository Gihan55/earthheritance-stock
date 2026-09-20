-- 0007: Expose payment method/reference on the balances views so the finance
-- registers can display and filter by bank reference without extra joins.
-- Columns are appended at the end, which keeps CREATE OR REPLACE VIEW valid.
begin;

create or replace view public.supplier_payment_balances with (security_invoker = true) as
  select p.id, p.code, p.supplier_id, s.name as supplier_name, p.currency, p.payment_date,
    p.amount, p.status,
    coalesce(a.allocated, 0) as allocated,
    p.amount - coalesce(a.allocated, 0) as unapplied,
    p.method, p.reference
  from public.supplier_payments p
  join public.suppliers s on s.id = p.supplier_id
  left join (select payment_id, sum(amount) as allocated from public.supplier_payment_allocations group by payment_id) a
    on a.payment_id = p.id;

create or replace view public.buyer_receipt_balances with (security_invoker = true) as
  select r.id, r.code, r.buyer_id, b.name as buyer_name, r.currency, r.receipt_date,
    r.amount, r.status,
    coalesce(a.allocated, 0) as allocated,
    r.amount - coalesce(a.allocated, 0) as unapplied,
    r.method, r.reference
  from public.buyer_receipts r
  join public.buyers b on b.id = r.buyer_id
  left join (select receipt_id, sum(amount) as allocated from public.buyer_receipt_allocations group by receipt_id) a
    on a.receipt_id = r.id;

commit;
