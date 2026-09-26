-- 0010: Row-level-security planner stability + reservation index.
--
-- Why: app_has_permission()/app_is_active() are SECURITY DEFINER, STABLE and
-- reference auth.uid(), so the planner cannot prove them constant across rows.
-- Used bare in a policy they were re-evaluated once per scanned row, which on
-- the aggregate views (stock_balances, stock_lot_balances, export_order_progress,
-- the balance/register views) meant hundreds of thousands of redundant profiles
-- lookups per page load and pushed Postgres into nested-loop plans.
--
-- Fix: wrap each ROW-INDEPENDENT policy expression in a scalar sub-select
-- `(select ...)`. A non-correlated sub-select becomes an InitPlan evaluated
-- exactly once per query, which lets the planner choose hash aggregates/scans.
-- Semantics are unchanged: the expression still depends only on the caller's
-- session, never on the row.
--
-- Row-dependent policies (documents_read on entity_type, and the Storage
-- objects policies on name) are intentionally left as-is: their argument is a
-- per-row column and cannot be constant-folded.
--
-- Also adds export_reservations(order_line_id): the export_order_progress view
-- groups and joins reservations by order_line_id but only lot_id/order_id were
-- indexed, producing a ~36M-row nested-loop join filter.

begin;

-- ---- Foundation --------------------------------------------------------------
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or (select public.app_has_permission('users.manage')));

drop policy if exists catalog_read on public.permission_catalog;
create policy catalog_read on public.permission_catalog for select to authenticated
  using ((select public.app_is_active()));

drop policy if exists permissions_read on public.role_permissions;
create policy permissions_read on public.role_permissions for select to authenticated
  using ((select public.app_is_active()));

drop policy if exists company_read on public.company_settings;
create policy company_read on public.company_settings for select to authenticated
  using ((select public.app_is_active()));

drop policy if exists invitations_read on public.staff_invitations;
create policy invitations_read on public.staff_invitations for select to authenticated
  using ((select public.app_has_permission('users.manage')));

drop policy if exists audit_read on public.audit_events;
create policy audit_read on public.audit_events for select to authenticated
  using ((select public.app_has_permission('audit.view')));

-- ---- Suppliers & stock -------------------------------------------------------
drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers for select to authenticated
  using ((select public.app_has_permission('suppliers.view') or public.app_has_permission('purchasing.manage')));

drop policy if exists supplier_payment_read on public.supplier_payment_details;
create policy supplier_payment_read on public.supplier_payment_details for select to authenticated
  using ((select public.app_has_permission('finance.view')));

drop policy if exists items_read on public.items;
create policy items_read on public.items for select to authenticated
  using ((select public.app_is_active()));

drop policy if exists warehouses_read on public.warehouses;
create policy warehouses_read on public.warehouses for select to authenticated
  using ((select public.app_is_active()));

drop policy if exists lots_read on public.lots;
create policy lots_read on public.lots for select to authenticated
  using ((select public.app_is_active()));

drop policy if exists movements_read on public.stock_movements;
create policy movements_read on public.stock_movements for select to authenticated
  using ((select public.app_has_permission('inventory.view')));

drop policy if exists purchases_read on public.purchases;
create policy purchases_read on public.purchases for select to authenticated
  using ((select public.app_has_permission('suppliers.view') or public.app_has_permission('purchasing.manage')
    or public.app_has_permission('inventory.view') or public.app_has_permission('finance.view')));

drop policy if exists purchase_lines_read on public.purchase_lines;
create policy purchase_lines_read on public.purchase_lines for select to authenticated
  using ((select public.app_has_permission('suppliers.view') or public.app_has_permission('purchasing.manage')
    or public.app_has_permission('inventory.view') or public.app_has_permission('finance.view')));

drop policy if exists receipts_read on public.goods_receipts;
create policy receipts_read on public.goods_receipts for select to authenticated
  using ((select public.app_has_permission('suppliers.view') or public.app_has_permission('purchasing.manage')
    or public.app_has_permission('inventory.view')));

drop policy if exists receipt_lines_read on public.goods_receipt_lines;
create policy receipt_lines_read on public.goods_receipt_lines for select to authenticated
  using ((select public.app_has_permission('suppliers.view') or public.app_has_permission('purchasing.manage')
    or public.app_has_permission('inventory.view')));

drop policy if exists adjustments_read on public.stock_adjustments;
create policy adjustments_read on public.stock_adjustments for select to authenticated
  using ((select public.app_has_permission('inventory.view') or public.app_has_permission('inventory.approve')));

-- ---- Production --------------------------------------------------------------
drop policy if exists batches_read on public.production_batches;
create policy batches_read on public.production_batches for select to authenticated
  using ((select public.app_has_permission('production.view') or public.app_has_permission('production.manage')));

drop policy if exists batch_inputs_read on public.production_inputs;
create policy batch_inputs_read on public.production_inputs for select to authenticated
  using ((select public.app_has_permission('production.view') or public.app_has_permission('production.manage')));

drop policy if exists batch_outputs_read on public.production_outputs;
create policy batch_outputs_read on public.production_outputs for select to authenticated
  using ((select public.app_has_permission('production.view') or public.app_has_permission('production.manage')));

drop policy if exists batch_wastage_read on public.production_wastage;
create policy batch_wastage_read on public.production_wastage for select to authenticated
  using ((select public.app_has_permission('production.view') or public.app_has_permission('production.manage')));

-- ---- Exports & finance -------------------------------------------------------
drop policy if exists buyers_read on public.buyers;
create policy buyers_read on public.buyers for select to authenticated
  using ((select public.app_has_permission('buyers.view') or public.app_has_permission('buyers.manage')));

drop policy if exists export_orders_read on public.export_orders;
create policy export_orders_read on public.export_orders for select to authenticated
  using ((select public.app_has_permission('exports.view') or public.app_has_permission('exports.manage')));

drop policy if exists export_order_lines_read on public.export_order_lines;
create policy export_order_lines_read on public.export_order_lines for select to authenticated
  using ((select public.app_has_permission('exports.view') or public.app_has_permission('exports.manage')));

drop policy if exists export_reservations_read on public.export_reservations;
create policy export_reservations_read on public.export_reservations for select to authenticated
  using ((select public.app_has_permission('exports.view') or public.app_has_permission('exports.manage')));

drop policy if exists shipments_read on public.shipments;
create policy shipments_read on public.shipments for select to authenticated
  using ((select public.app_has_permission('exports.view') or public.app_has_permission('exports.manage')));

drop policy if exists shipment_lines_read on public.shipment_lines;
create policy shipment_lines_read on public.shipment_lines for select to authenticated
  using ((select public.app_has_permission('exports.view') or public.app_has_permission('exports.manage')));

drop policy if exists invoices_read on public.export_invoices;
create policy invoices_read on public.export_invoices for select to authenticated
  using ((select public.app_has_permission('exports.view') or public.app_has_permission('finance.view')));

drop policy if exists invoice_lines_read on public.export_invoice_lines;
create policy invoice_lines_read on public.export_invoice_lines for select to authenticated
  using ((select public.app_has_permission('exports.view') or public.app_has_permission('finance.view')));

drop policy if exists bills_read on public.supplier_bills;
create policy bills_read on public.supplier_bills for select to authenticated
  using ((select public.app_has_permission('finance.view')));

drop policy if exists payments_read on public.supplier_payments;
create policy payments_read on public.supplier_payments for select to authenticated
  using ((select public.app_has_permission('finance.view')));

drop policy if exists payment_allocations_read on public.supplier_payment_allocations;
create policy payment_allocations_read on public.supplier_payment_allocations for select to authenticated
  using ((select public.app_has_permission('finance.view')));

drop policy if exists receipts_read on public.buyer_receipts;
create policy receipts_read on public.buyer_receipts for select to authenticated
  using ((select public.app_has_permission('finance.view')));

drop policy if exists receipt_allocations_read on public.buyer_receipt_allocations;
create policy receipt_allocations_read on public.buyer_receipt_allocations for select to authenticated
  using ((select public.app_has_permission('finance.view')));

-- ---- Documents: fold only the row-independent active check -------------------
drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated
  using ((select public.app_is_active()) and public.app_document_read_ok(entity_type));

-- ---- Reservation lookup index ------------------------------------------------
create index if not exists export_reservations_oline_idx
  on public.export_reservations(order_line_id);

commit;
