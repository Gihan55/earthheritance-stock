// Full-system walkthrough: plays one complete business week through the real
// RPC surface (exactly what the web app calls), then verifies every reporting
// view, balance invariant, and permission boundary against the result.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { Role } from "../src/lib/permissions";

const ids: Record<Role, string> = {
  administrator: "22222222-2222-4222-8222-000000000001",
  manager: "22222222-2222-4222-8222-000000000002",
  stores: "22222222-2222-4222-8222-000000000003",
  production: "22222222-2222-4222-8222-000000000004",
  export_sales: "22222222-2222-4222-8222-000000000005",
  finance: "22222222-2222-4222-8222-000000000006",
};
let db: PGlite;

async function actAs(role: Role) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    ids[role],
  ]);
}
type Row = Record<string, string | number | boolean | null>;
async function q(query: string, params: unknown[] = []) {
  return (await db.query(query, params)).rows as Row[];
}
async function first(query: string, params: unknown[] = []) {
  return (await q(query, params))[0];
}
const num = (value: unknown) => Number(value);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
  `);
  for (const migration of [
    "../supabase/migrations/0001_foundation.sql",
    "../supabase/migrations/0002_suppliers_stock.sql",
    "../supabase/migrations/0003_production.sql",
    "../supabase/migrations/0004_exports_finance.sql",
    "../supabase/migrations/0005_reporting.sql",
"../supabase/migrations/0006_performance.sql",
"../supabase/migrations/0007_register_references.sql",
"../supabase/migrations/0008_documents.sql",
  ])
    await db.exec(await readFile(new URL(migration, import.meta.url), "utf8"));
  for (const [role, id] of Object.entries(ids))
    await db.query("insert into auth.users(id, email) values ($1, $2)", [
      id,
      `${role}@example.com`,
    ]);
  await db.query(
    "select public.app_bootstrap_admin($1, 'Initial Administrator')",
    [ids.administrator],
  );
  for (const [role, id] of Object.entries(ids))
    if (role !== "administrator")
      await db.query(
        "insert into public.profiles(id, email, full_name, role) values ($1, $2, $3, $4)",
        [id, `${role}@example.com`, `Test ${role}`, role],
      );
}, 60000);
afterEach(async () => {
  await db.exec("reset role;");
});
afterAll(async () => {
  await db?.close();
});

describe("full system walkthrough", () => {
  it("covers purchasing, production, exports, finance, reports, and RLS", async () => {
    // 1. Stores: supplier, catalogue, PO, and a partial goods receipt.
    await actAs("stores");
    const supplierId = (
      await q(
        "select public.app_create_supplier('Demo Husk Supplier', '', '', '', '', '', '', '', '', '') as id",
      )
    )[0].id as string;
    const rawItemId = (
      await q(
        "select public.app_create_item('Demo coco pith', 'raw_material', 'kg', 0, null, '', '') as id",
      )
    )[0].id as string;
    const finishedItemId = (
      await q(
        "select public.app_create_item('Demo 650g brick', 'finished_product', 'piece', 0, null, '', '') as id",
      )
    )[0].id as string;
    const purchaseId = (
      await q(
        "select public.app_create_purchase($1, 'USD', current_date, null, '', $2::jsonb) as id",
        [
          supplierId,
          JSON.stringify([
            { item_id: rawItemId, quantity: 1000, unit_price: 1 },
          ]),
        ],
      )
    )[0].id as string;
    await q("select public.app_confirm_purchase($1)", [purchaseId]);
    const purchaseLineId = (
      await first(
        "select id from public.purchase_lines where purchase_id = $1",
        [purchaseId],
      )
    ).id as string;
    await q(
      "select public.app_receive_goods($1, current_date, '', '', $2::jsonb)",
      [
        purchaseId,
        JSON.stringify([
          {
            purchase_line_id: purchaseLineId,
            quantity: 800,
            lot_number: "DEMO-SRC-1",
          },
        ]),
      ],
    );
    const purchase = await first(
      "select status from public.purchases where id = $1",
      [purchaseId],
    );
    expect(purchase.status).toBe("partially_received");

    // 2. Production: one batch turns 800 kg of pith into 500 bricks.
    await actAs("production");
    const rawLotId = (
      await first(
        "select id from public.lots where item_id = $1 and lot_number = 'DEMO-SRC-1'",
        [rawItemId],
      )
    ).id as string;
    const batchId = (
      await q(
        "select public.app_create_batch(current_date, '', $1::jsonb, $2::jsonb, $3::jsonb) as id",
        [
          JSON.stringify([
            { item_id: rawItemId, lot_id: rawLotId, quantity: 800 },
          ]),
          JSON.stringify([
            { item_id: finishedItemId, quantity: 500, unit_cost: 2 },
          ]),
          JSON.stringify([
            { item_id: rawItemId, quantity: 250, unit: "kg", reason: "moisture" },
          ]),
        ],
      )
    )[0].id as string;
    await q("select public.app_post_batch($1)", [batchId]);
    const finishedLotId = (
      await first(
        "select id from public.lots where item_id = $1",
        [finishedItemId],
      )
    ).id as string;
    const rawOnHand = await first(
      "select on_hand from public.stock_balances where item_id = $1",
      [rawItemId],
    );
    expect(num(rawOnHand.on_hand)).toBe(0);

    // 3. Stock correction: stores requests, manager approves.
    await actAs("stores");
    const adjustmentId = (
      await q(
        "select public.app_request_adjustment($1, $2, 'increase', 5, 'Physical count correction') as id",
        [finishedItemId, finishedLotId],
      )
    )[0].id as string;
    await actAs("manager");
    await q("select public.app_decide_adjustment($1, true)", [adjustmentId]);
    const finishedOnHand = await first(
      "select on_hand from public.stock_balances where item_id = $1",
      [finishedItemId],
    );
    expect(num(finishedOnHand.on_hand)).toBe(505);

    // 4. Export sales: order, FIFO reservation, partial shipment, dispatch.
    await actAs("export_sales");
    const buyerId = (
      await q(
        "select public.app_create_buyer('Demo Buyer NV', '', '', '', '', '', '', '', '', 'USD', '') as id",
      )
    )[0].id as string;
    const orderId = (
      await q(
        "select public.app_create_export_order($1, 'USD', 'FOB', 'Belgium', current_date, null, '', $2::jsonb) as id",
        [
          buyerId,
          JSON.stringify([
            { item_id: finishedItemId, quantity: 300, unit_price: 2.5 },
          ]),
        ],
      )
    )[0].id as string;
    const orderLineId = (
      await first(
        "select id from public.export_order_lines where order_id = $1",
        [orderId],
      )
    ).id as string;
    await q("select public.app_confirm_export_order($1)", [orderId]);
    const available = await first(
      "select public.app_lot_available($1) as avail",
      [finishedLotId],
    );
    expect(num(available.avail)).toBe(205); // 505 on hand - 300 reserved
    const shipmentId = (
      await q(
        "select public.app_create_shipment($1, 'MSKU-DEMO-1', 'SEAL-1', 'Colombo', 'Antwerp', 'MV Demo', null, null, 0, null, null, 'BL-DEMO-1', '', $2::jsonb) as id",
        [
          orderId,
          JSON.stringify([
            { order_line_id: orderLineId, lot_id: finishedLotId, quantity: 200 },
          ]),
        ],
      )
    )[0].id as string;
    await q("select public.app_mark_shipment_ready($1)", [shipmentId]);
    await q("select public.app_dispatch_shipment($1, current_date)", [
      shipmentId,
    ]);
    const dispatched = await first(
      "select on_hand from public.stock_balances where item_id = $1",
      [finishedItemId],
    );
    expect(num(dispatched.on_hand)).toBe(305);

    // 5. Finance: overdue export invoice, part-payment, and an advance.
    await actAs("export_sales");
    const invoiceId = (
      await q(
        "select public.app_create_invoice($1, current_date - 40, current_date - 10, 'USD', null, 0, 0, '', $2::jsonb) as id",
        [
          shipmentId,
          JSON.stringify([
            { description: "Demo bricks x200", quantity: 200, unit_price: 2.5 },
          ]),
        ],
      )
    )[0].id as string;
    await actAs("finance");
    const advanceReceiptId = (
      await q(
        "select public.app_record_buyer_receipt($1, 'USD', current_date, 150, null, 'Advance for next order', '', '') as id",
        [buyerId],
      )
    )[0].id as string;
    expect(advanceReceiptId).toBeTruthy();
    const receiptId = (
      await q(
        "select public.app_record_buyer_receipt($1, 'USD', current_date, 100, null, 'Wire', 'REF-DEMO-1', '') as id",
        [buyerId],
      )
    )[0].id as string;
    await q("select public.app_allocate_receipt($1, $2, 100)", [
      receiptId,
      invoiceId,
    ]);

    // 6. Finance: supplier bill (overdue), part-payment, and an advance.
    const billId = (
      await q(
        "select public.app_create_bill($1, $2, current_date - 30, current_date - 5, 'USD', null, 800, 'Demo coco pith purchase', '') as id",
        [supplierId, purchaseId],
      )
    )[0].id as string;
    const bill = await first(
      "select code from public.supplier_bills where id = $1",
      [billId],
    );
    expect(bill.code).toMatch(/^BILL-\d{4}$/);
    await q(
      "select public.app_record_supplier_payment($1, 'USD', current_date, 100, null, 'Advance for next delivery', '', '')",
      [supplierId],
    );
    const paymentId = (
      await q(
        "select public.app_record_supplier_payment($1, 'USD', current_date, 500, null, 'Bank transfer', 'PAY-DEMO-1', '') as id",
        [supplierId],
      )
    )[0].id as string;
    await q("select public.app_allocate_payment($1, $2, 500)", [
      paymentId,
      billId,
    ]);

    // 7. Balance invariants that must hold no matter the workflow.
    const conservation = await q(`
      select b.item_id
      from public.stock_balances b
      join (
        select item_id, sum(quantity_delta) as net
        from public.stock_movements group by item_id
      ) m using (item_id)
      where b.on_hand <> m.net
    `);
    expect(conservation).toHaveLength(0);
    const balances = await first(`
      select
        (select coalesce(sum(on_hand), 0) from public.stock_lot_balances) as lots,
        (select coalesce(sum(on_hand), 0) from public.stock_balances) as items
    `);
    expect(num(balances.lots)).toBe(num(balances.items));
    const reservations = await first(`
      select
        (select coalesce(sum(quantity), 0) from public.export_reservations) as reserved,
        (select coalesce(sum(ordered_quantity - shipped_quantity), 0)
           from public.export_order_progress
          where status in ('confirmed', 'partially_shipped')) as open_balance
    `);
    expect(num(reservations.reserved)).toBe(num(reservations.open_balance));

    // 8. Reporting views show the same story the staff lived through.
    await actAs("manager");
    const summary = await first(
      "select * from public.production_summary where batch_code is not null order by produced_on desc limit 1",
    );
    expect(num(summary.output_quantity)).toBe(500);
    const overdue = await q(
      "select document_type, party_name, outstanding from public.overdue_documents order by document_type",
    );
    expect(overdue.map((row) => row.document_type)).toEqual([
      "export_invoice",
      "supplier_bill",
    ]);
    expect(num(overdue[0].outstanding)).toBe(400);
    expect(num(overdue[1].outstanding)).toBe(300);
    const unapplied = await q(
      "select party_name, unapplied from public.unapplied_balances order by unapplied desc",
    );
    expect(num(unapplied[0].unapplied)).toBe(150); // buyer advance
    expect(num(unapplied[1].unapplied)).toBe(100); // supplier advance
    const sales = await first(
      "select line_value, shipped_value from public.export_sales_lines limit 1",
    );
    expect(num(sales.line_value)).toBe(750);
    expect(num(sales.shipped_value)).toBe(500);
    const schedule = await first(
      "select status, planned_quantity from public.shipment_schedule limit 1",
    );
    expect(num(schedule.planned_quantity)).toBe(200);
    expect(["ready", "dispatched", "delivered"]).toContain(schedule.status);
    const buyerLedger = await q(
      "select amount from public.buyer_allocation_ledger",
    );
    expect(buyerLedger).toHaveLength(1);
    const supplierLedger = await q(
      "select amount from public.supplier_allocation_ledger",
    );
    expect(supplierLedger).toHaveLength(1);
    const invoiceState = await first(
      "select outstanding, payment_state from public.export_invoice_balances where id = $1",
      [invoiceId],
    );
    expect(num(invoiceState.outstanding)).toBe(400);
    expect(invoiceState.payment_state).toBe("partially_paid");

    // 9. Audit trail captured the journey.
    const auditCount = await first(
      "select count(*) as total from public.audit_events",
    );
    expect(num(auditCount.total)).toBeGreaterThanOrEqual(15);
    const auditSpread = await first(
      `select count(distinct split_part(action, '.', 1)) as kinds
       from public.audit_events`,
    );
    expect(num(auditSpread.kinds)).toBeGreaterThanOrEqual(5);

    // 10. Permission boundaries after everything is booked.
    await actAs("stores");
    expect(await q("select id from public.buyers")).toHaveLength(0);
    expect(await q("select id from public.supplier_bills")).toHaveLength(0);
    await actAs("export_sales");
    expect(await q("select id from public.supplier_bills")).toHaveLength(0);
    expect(await q("select id from public.export_orders")).toHaveLength(1);
    await actAs("finance");
    expect(await q("select id from public.export_invoice_balances")).toHaveLength(
      1,
    );
    expect(await q("select id from public.supplier_payment_balances")).toHaveLength(
      2,
    );
    // Migration 0007 exposes method/reference on the balances views for filtering.
    const receiptRefs = await q(
      "select reference, method from public.buyer_receipt_balances where id = $1",
      [receiptId],
    );
    expect(receiptRefs[0].reference).toBe("REF-DEMO-1");
    expect(receiptRefs[0].method).toBe("Wire");
    const paymentRefs = await q(
      "select reference, method from public.supplier_payment_balances where id = $1",
      [paymentId],
    );
    expect(paymentRefs[0].reference).toBe("PAY-DEMO-1");
    await actAs("production");
    expect(
      await q("select order_id from public.export_sales_lines"),
    ).toHaveLength(0);
  }, 120000);
});
