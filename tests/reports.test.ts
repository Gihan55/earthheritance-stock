import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { Role } from "../src/lib/permissions";

const ids: Record<Role, string> = {
  administrator: "11111111-1111-4111-8111-000000000001",
  manager: "11111111-1111-4111-8111-000000000002",
  stores: "11111111-1111-4111-8111-000000000003",
  production: "11111111-1111-4111-8111-000000000004",
  export_sales: "11111111-1111-4111-8111-000000000005",
  finance: "11111111-1111-4111-8111-000000000006",
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

async function seedScenario() {
  // Stock: buy 100 kg raw, convert into 60 finished pieces.
  await actAs("stores");
  const supplierId = (
    await q(
      "select public.app_create_supplier('Husk Co', '', '', '', '', '', '', '', '', '') as id",
    )
  )[0].id as string;
  const rawItemId = (
    await q(
      "select public.app_create_item('Coco pith', 'raw_material', 'kg', 0, null, '', '') as id",
    )
  )[0].id as string;
  const finishedItemId = (
    await q(
      "select public.app_create_item('650g Brick', 'finished_product', 'piece', 0, null, '', '') as id",
    )
  )[0].id as string;
  const purchaseId = (
    await q(
      "select public.app_create_purchase($1, 'USD', current_date, null, '', $2::jsonb) as id",
      [supplierId, JSON.stringify([{ item_id: rawItemId, quantity: 100, unit_price: 1 }])],
    )
  )[0].id as string;
  await q("select public.app_confirm_purchase($1)", [purchaseId]);
  const purchaseLine = (
    await first("select id from public.purchase_lines where purchase_id = $1", [purchaseId])
  ).id as string;
  await q("select public.app_receive_goods($1, current_date, '', '', $2::jsonb)", [
    purchaseId,
    JSON.stringify([{ purchase_line_id: purchaseLine, quantity: 100, lot_number: "SRC-1" }]),
  ]);
  await actAs("production");
  const rawLotId = (
    await first("select id from public.lots where item_id = $1", [rawItemId])
  ).id as string;
  const batchId = (
    await q(
      "select public.app_create_batch(current_date, 'Sun drying', $1::jsonb, $2::jsonb, $3::jsonb) as id",
      [
        JSON.stringify([{ item_id: rawItemId, lot_id: rawLotId, quantity: 100 }]),
        JSON.stringify([{ item_id: finishedItemId, quantity: 60, unit_cost: 2.5 }]),
        JSON.stringify([{ quantity: 5, unit: "kg", reason: "Moisture loss" }]),
      ],
    )
  )[0].id as string;
  await q("select public.app_post_batch($1)", [batchId]);
  const finishedLotId = (
    await first("select id from public.lots where item_id = $1", [finishedItemId])
  ).id as string;
  // Export: order 60, confirm, ship all 60, dispatch yesterday-equivalent (today).
  await actAs("export_sales");
  const buyerId = (
    await q(
      "select public.app_create_buyer('Ocean Greens', '', '', '', '', '', 'Germany', '', '', 'USD', '') as id",
    )
  )[0].id as string;
  const orderId = (
    await q(
      "select public.app_create_export_order($1, 'USD', 'FOB', 'Germany', current_date, null, '', $2::jsonb) as id",
      [buyerId, JSON.stringify([{ item_id: finishedItemId, quantity: 60, unit_price: 3 }])],
    )
  )[0].id as string;
  await q("select public.app_confirm_export_order($1)", [orderId]);
  const orderLineId = (
    await first("select id from public.export_order_lines where order_id = $1", [orderId])
  ).id as string;
  const shipmentId = (
    await q(
      "select public.app_create_shipment($1, 'MSKU-1', '', 'Colombo', 'Hamburg', 'MV Cocoa', current_date, current_date + 20, 0, null, null, '', '', $2::jsonb) as id",
      [orderId, JSON.stringify([{ order_line_id: orderLineId, lot_id: finishedLotId, quantity: 60 }])],
    )
  )[0].id as string;
  await q("select public.app_mark_shipment_ready($1)", [shipmentId]);
  await q("select public.app_dispatch_shipment($1, current_date)", [shipmentId]);
  // Invoice already overdue (issued in the past, due yesterday), plus a bill and
  // a partially allocated payment and receipt.
  const invoiceId = (
    await q(
      "select public.app_create_invoice($1, current_date - 40, current_date - 10, 'USD', null, 0, 0, '', $2::jsonb) as id",
      [shipmentId, JSON.stringify([{ description: "650g bricks", quantity: 60, unit_price: 3 }])],
    )
  )[0].id as string;
  await actAs("finance");
  const billId = (
    await q(
      "select public.app_create_bill($1, null, current_date - 40, current_date - 5, 'USD', null, 100, 'Husk purchase', '') as id",
      [supplierId],
    )
  )[0].id as string;
  const paymentId = (
    await q(
      "select public.app_record_supplier_payment($1, 'USD', current_date, 60, null, '', '', '') as id",
      [supplierId],
    )
  )[0].id as string;
  await q("select public.app_allocate_payment($1, $2, 40)", [paymentId, billId]);
  const receiptId = (
    await q(
      "select public.app_record_buyer_receipt($1, 'USD', current_date, 50, null, '', '', '') as id",
      [buyerId],
    )
  )[0].id as string;
  await q("select public.app_allocate_receipt($1, $2, 50)", [receiptId, invoiceId]);
  return { supplierId, finishedItemId, buyerId, orderId, shipmentId, invoiceId, billId, paymentId, receiptId };
}

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
"../supabase/migrations/0009_staff_password_audit.sql",
    "../supabase/migrations/0010_rls_plan_stability.sql",
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
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback; reset role;");
});
afterAll(async () => {
  await db?.close();
});

describe("reporting views", () => {
  it("production_summary carries output, consumption, and wastage per batch", async () => {
    await seedScenario();
    await actAs("production");
    const row = await first(
      "select batch_code, item_name, output_quantity, input_quantity, wastage_quantity, status from public.production_summary",
    );
    expect(row.batch_code).toMatch(/^PB-\d{4}$/);
    expect(row.item_name).toBe("650g Brick");
    expect(Number(row.output_quantity)).toBe(60);
    expect(Number(row.input_quantity)).toBe(100);
    expect(Number(row.wastage_quantity)).toBe(5);
    expect(row.status).toBe("posted");
  });

  it("export_sales_lines values each line by buyer, product, and country", async () => {
    const ctx = await seedScenario();
    await actAs("export_sales");
    const row = await first(
      "select buyer_name, destination_country, item_name, quantity, shipped_quantity, line_value, shipped_value, currency from public.export_sales_lines where order_id = $1",
      [ctx.orderId],
    );
    expect(row.buyer_name).toBe("Ocean Greens");
    expect(row.destination_country).toBe("Germany");
    expect(Number(row.line_value)).toBe(180);
    expect(Number(row.shipped_value)).toBe(180);
    expect(row.currency).toBe("USD");
  });

  it("shipment_schedule lists the container with ports, dates, and planned quantity", async () => {
    const ctx = await seedScenario();
    await actAs("export_sales");
    const row = await first(
      "select code, status, port_of_loading, port_of_discharge, planned_quantity, buyer_name from public.shipment_schedule where id = $1",
      [ctx.shipmentId],
    );
    expect(row.code).toMatch(/^SHP-\d{4}$/);
    expect(row.status).toBe("dispatched");
    expect(row.port_of_loading).toBe("Colombo");
    expect(row.port_of_discharge).toBe("Hamburg");
    expect(Number(row.planned_quantity)).toBe(60);
  });

  it("overdue_documents surfaces the past-due invoice and bill with outstanding values", async () => {
    await seedScenario();
    await actAs("finance");
    const rows = await q(
      "select document_type, code, party_name, outstanding from public.overdue_documents order by document_type",
    );
    expect(rows).toHaveLength(2);
    const bill = rows.find((r) => r.document_type === "supplier_bill");
    const invoice = rows.find((r) => r.document_type === "export_invoice");
    expect(bill, "supplier bill is overdue").toBeDefined();
    expect(invoice, "buyer invoice is overdue").toBeDefined();
    expect(Number(bill?.outstanding)).toBe(60); // 100 - 40 allocated
    expect(Number(invoice?.outstanding)).toBe(130); // 180 - 50 allocated
    await actAs("stores");
    expect(await q("select id from public.overdue_documents")).toHaveLength(0);
  });

  it("unapplied_balances keeps only the not-fully-allocated entries", async () => {
    await seedScenario();
    await actAs("finance");
    const rows = await q(
      "select entry_type, code, unapplied from public.unapplied_balances",
    );
    // The payment still has 20 unapplied; the receipt is fully allocated.
    expect(rows).toHaveLength(1);
    expect(rows[0].entry_type).toBe("supplier_payment");
    expect(Number(rows[0].unapplied)).toBe(20);
  });

  it("allocation ledgers connect payments to bills and receipts to invoices", async () => {
    const ctx = await seedScenario();
    await actAs("finance");
    const supplierRow = await first(
      "select payment_code, bill_code, amount, supplier_name from public.supplier_allocation_ledger where payment_id = $1",
      [ctx.paymentId],
    );
    expect(Number(supplierRow.amount)).toBe(40);
    expect(supplierRow.supplier_name).toBe("Husk Co");
    const buyerRow = await first(
      "select receipt_code, invoice_code, amount, buyer_name from public.buyer_allocation_ledger where receipt_id = $1",
      [ctx.receiptId],
    );
    expect(Number(buyerRow.amount)).toBe(50);
    expect(buyerRow.buyer_name).toBe("Ocean Greens");
  });

  it("security invoker keeps each role inside its own permissions", async () => {
    await seedScenario();
    await actAs("production");
    expect(await q("select batch_id from public.production_summary")).toHaveLength(1);
    expect(await q("select order_id from public.export_sales_lines")).toHaveLength(0);
    await actAs("manager");
    expect(await q("select id from public.shipment_schedule")).toHaveLength(1);
    expect(await q("select id from public.overdue_documents")).toHaveLength(2);
    await actAs("stores");
    expect(await q("select batch_id from public.production_summary")).toHaveLength(0);
    expect(await q("select id from public.unapplied_balances")).toHaveLength(0);
  });
});
