-- 0006: Performance indexes for hot query paths.
-- Validated against a PGlite benchmark (~110k rows: 60k stock movements, 4k purchases,
-- 3k export orders, 2k shipments, 1.5k invoices/bills/payments/receipts) covering the 22
-- queries the app issues most (ledgers, profiles, statement views, traceability, RPCs).
-- Result: up to -50% latency on ledger/sales-line queries, no regressions.
begin;

-- Lots are looked up per item (item pages, lot pickers) and per supplier (supplier profile).
create index if not exists lots_item_idx on public.lots(item_id);
create index if not exists lots_supplier_idx on public.lots(supplier_id);

-- Receiving: lines are fetched by receipt and re-checked per purchase line on each receipt.
create index if not exists goods_receipt_lines_receipt_idx on public.goods_receipt_lines(receipt_id);
create index if not exists goods_receipt_lines_pline_idx on public.goods_receipt_lines(purchase_line_id);

-- Exports: shipments by buyer (buyer profile), lines by lot (traceability),
-- order lines by item (buyer item totals), invoices by shipment (statement/receivables joins).
create index if not exists shipments_buyer_idx on public.shipments(buyer_id);
create index if not exists shipment_lines_lot_idx on public.shipment_lines(lot_id);
create index if not exists export_order_lines_item_idx on public.export_order_lines(item_id);
create index if not exists export_invoices_shipment_idx on public.export_invoices(shipment_id);

-- Finance: bills are looked up per purchase; production consumption per lot.
create index if not exists supplier_bills_purchase_idx on public.supplier_bills(purchase_id);
create index if not exists production_inputs_lot_idx on public.production_inputs(lot_id);

commit;
