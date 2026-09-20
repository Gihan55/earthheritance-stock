-- Phase 5: reporting read models. No new tables, no new write paths.
-- Every view is SECURITY INVOKER, so each viewer only ever sees rows their own
-- role's policies allow on the underlying tables. Reports and dashboards read
-- these views; nothing here fabricates or re-values historical data.
-- Apply once to a project that already has 0001 through 0004.
begin;

-- ---- Production: one row per batch output line, with consumption and wastage ----
create view public.production_summary with (security_invoker = true) as
  select b.id as batch_id, b.code as batch_code, b.produced_on, b.status,
    p.full_name as produced_by_name,
    o.item_id, i.code as item_code, i.name as item_name, i.stock_unit,
    o.quantity as output_quantity, o.unit_cost,
    coalesce(ins.input_total, 0) as input_quantity,
    coalesce(wa.wastage_total, 0) as wastage_quantity
  from public.production_batches b
  left join public.profiles p on p.id = b.produced_by
  left join public.production_outputs o on o.batch_id = b.id
  left join public.items i on i.id = o.item_id
  left join (select batch_id, sum(quantity) as input_total
    from public.production_inputs group by batch_id) ins on ins.batch_id = b.id
  left join (select batch_id, sum(quantity) as wastage_total
    from public.production_wastage group by batch_id) wa on wa.batch_id = b.id;

-- ---- Export sales: one row per order line, by buyer / product / country ----------
create view public.export_sales_lines with (security_invoker = true) as
  select o.id as order_id, o.code as order_code, o.order_date, o.status, o.currency,
    o.destination_country, o.requested_ship_date,
    bu.id as buyer_id, bu.code as buyer_code, bu.name as buyer_name,
    l.id as order_line_id, it.id as item_id, it.code as item_code, it.name as item_name,
    it.stock_unit, l.quantity, l.shipped_quantity, l.unit_price,
    l.quantity * l.unit_price as line_value,
    l.shipped_quantity * l.unit_price as shipped_value
  from public.export_orders o
  join public.buyers bu on bu.id = o.buyer_id
  join public.export_order_lines l on l.order_id = o.id
  join public.items it on it.id = l.item_id;

-- ---- Shipment schedule: movements that are planned or in transit -----------------
create view public.shipment_schedule with (security_invoker = true) as
  select s.id, s.code, s.status, s.container_number, s.seal_number,
    s.port_of_loading, s.port_of_discharge, s.vessel, s.etd, s.eta,
    s.dispatched_on, s.delivered_at, s.package_count, s.net_weight_kg, s.gross_weight_kg,
    s.bl_reference, o.code as order_code, o.currency,
    bu.name as buyer_name, o.destination_country,
    coalesce(sl.quantity_total, 0) as planned_quantity
  from public.shipments s
  join public.export_orders o on o.id = s.order_id
  join public.buyers bu on bu.id = s.buyer_id
  left join (select shipment_id, sum(quantity) as quantity_total
    from public.shipment_lines group by shipment_id) sl on sl.shipment_id = s.id;

-- ---- Overdue documents: unpaid/partially paid invoices and bills past due --------
create view public.overdue_documents with (security_invoker = true) as
  select 'export_invoice'::text as document_type, v.id, v.code, v.buyer_id as party_id,
    v.buyer_name as party_name, v.currency, v.issue_date, v.due_date, v.amount, v.outstanding
  from public.export_invoice_balances v
  where v.payment_state <> 'paid' and v.due_date is not null and v.due_date < current_date
  union all
  select 'supplier_bill'::text as document_type, v.id, v.code, v.supplier_id as party_id,
    v.supplier_name as party_name, v.currency, v.issue_date, v.due_date, v.amount, v.outstanding
  from public.supplier_bill_balances v
  where v.payment_state <> 'paid' and v.due_date is not null and v.due_date < current_date;

-- ---- Unapplied balances: advances waiting to be allocated -------------------------
create view public.unapplied_balances with (security_invoker = true) as
  select 'supplier_payment'::text as entry_type, v.id, v.code, v.supplier_id as party_id,
    v.supplier_name as party_name, v.currency, v.payment_date as entry_date,
    v.amount, v.allocated, v.unapplied
  from public.supplier_payment_balances v
  where v.status = 'recorded' and v.amount - v.allocated > 0
  union all
  select 'buyer_receipt'::text as entry_type, v.id, v.code, v.buyer_id as party_id,
    v.buyer_name as party_name, v.currency, v.receipt_date as entry_date,
    v.amount, v.allocated, v.unapplied
  from public.buyer_receipt_balances v
  where v.status = 'recorded' and v.amount - v.allocated > 0;

-- ---- Allocation ledgers: the links that make supplier/buyer statements ------------
create view public.supplier_allocation_ledger with (security_invoker = true) as
  select a.id, a.payment_id, p.code as payment_code, p.payment_date,
    a.bill_id, b.code as bill_code, b.issue_date as bill_date, b.due_date as bill_due_date,
    a.amount, p.currency, p.supplier_id, s.name as supplier_name
  from public.supplier_payment_allocations a
  join public.supplier_payments p on p.id = a.payment_id
  join public.supplier_bills b on b.id = a.bill_id
  join public.suppliers s on s.id = p.supplier_id;

create view public.buyer_allocation_ledger with (security_invoker = true) as
  select a.id, a.receipt_id, r.code as receipt_code, r.receipt_date,
    a.invoice_id, i.code as invoice_code, i.issue_date as invoice_date, i.due_date as invoice_due_date,
    a.amount, r.currency, r.buyer_id, bu.name as buyer_name
  from public.buyer_receipt_allocations a
  join public.buyer_receipts r on r.id = a.receipt_id
  join public.export_invoices i on i.id = a.invoice_id
  join public.buyers bu on bu.id = r.buyer_id;

-- ---- Grants: read-only, and only through the viewer's own policies ----------------
grant select on public.production_summary, public.export_sales_lines, public.shipment_schedule,
  public.overdue_documents, public.unapplied_balances,
  public.supplier_allocation_ledger, public.buyer_allocation_ledger to authenticated;

commit;
