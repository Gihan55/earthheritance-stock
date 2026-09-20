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
async function rejects(query: string, params: unknown[], pattern: RegExp) {
  await db.exec("savepoint sp");
  let error: unknown;
  try {
    await db.query(query, params);
  } catch (caught) {
    error = caught;
  }
  await db.exec("rollback to savepoint sp");
  expect(error, "expected the statement to fail").toBeInstanceOf(Error);
  expect((error as Error).message).toMatch(pattern);
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
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback; reset role;");
});
afterAll(async () => {
  await db?.close();
});

// Buy and receive raw material, run a production batch, and return the
// finished-product lot that exports can ship.
async function seededFinishedStock(outputQty: number) {
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
      [supplierId, JSON.stringify([{ item_id: rawItemId, quantity: outputQty, unit_price: 1 }])],
    )
  )[0].id as string;
  await q("select public.app_confirm_purchase($1)", [purchaseId]);
  const purchaseLine = (
    await first("select id from public.purchase_lines where purchase_id = $1", [purchaseId])
  ).id as string;
  await q("select public.app_receive_goods($1, current_date, '', '', $2::jsonb)", [
    purchaseId,
    JSON.stringify([{ purchase_line_id: purchaseLine, quantity: outputQty, lot_number: "SRC-1" }]),
  ]);
  await actAs("production");
  const rawLotId = (
    await first("select id from public.lots where item_id = $1", [rawItemId])
  ).id as string;
  const batchId = (
    await q(
      "select public.app_create_batch(current_date, '', $1::jsonb, $2::jsonb, '[]'::jsonb) as id",
      [
        JSON.stringify([{ item_id: rawItemId, lot_id: rawLotId, quantity: outputQty }]),
        JSON.stringify([{ item_id: finishedItemId, quantity: outputQty, unit_cost: 2.5 }]),
      ],
    )
  )[0].id as string;
  await q("select public.app_post_batch($1)", [batchId]);
  const finishedLotId = (
    await first("select id from public.lots where item_id = $1", [finishedItemId])
  ).id as string;
  return { supplierId, rawItemId, finishedItemId, finishedLotId, batchId };
}

async function makeBuyer(name = "Ocean Greens Trading") {
  await actAs("export_sales");
  return (
    await q(
      "select public.app_create_buyer($1, '', '', '', '', '', '', '', '', 'USD', '') as id",
      [name],
    )
  )[0].id as string;
}

async function makeOrder(
  buyerId: string,
  itemId: string,
  quantity: number,
  currency = "USD",
) {
  await actAs("export_sales");
  const id = (
    await q(
      "select public.app_create_export_order($1, $2, 'FOB', 'Netherlands', current_date, null, '', $3::jsonb) as id",
      [buyerId, currency, JSON.stringify([{ item_id: itemId, quantity, unit_price: 2 }])],
    )
  )[0].id as string;
  const lineId = (
    await first("select id from public.export_order_lines where order_id = $1", [id])
  ).id as string;
  return { id, lineId };
}

async function makeShipment(
  orderId: string,
  lines: { order_line_id: string; lot_id: string; quantity: number }[],
) {
  await actAs("export_sales");
  return (
    await q(
      "select public.app_create_shipment($1, 'MSKU-0001', 'SEAL-9', 'Colombo', 'Rotterdam', 'MV Cocoa', null, null, 0, null, null, 'BL-1', '', $2::jsonb) as id",
      [orderId, JSON.stringify(lines)],
    )
  )[0].id as string;
}

describe("buyers", () => {
  it("creates buyers with BYR codes and deactivates without deleting", async () => {
    const id = await makeBuyer();
    const row = await first(
      "select code, name, preferred_currency, is_active from public.buyers where id = $1",
      [id],
    );
    expect(row.code).toMatch(/^BYR-\d{4}$/);
    expect(row.preferred_currency).toBe("USD");
    expect(row.is_active).toBe(true);
    await actAs("export_sales");
    await q("select public.app_set_buyer_active($1, false)", [id]);
    const kept = await first("select is_active from public.buyers where id = $1", [id]);
    expect(kept.is_active).toBe(false);
  });

  it("rejects buyer writes without buyers.manage", async () => {
    await actAs("stores");
    await rejects(
      "select public.app_create_buyer('Nope', '', '', '', '', '', '', '', '', 'USD', '')",
      [],
      /Not authorized/,
    );
  });
});

describe("export orders and FIFO reservations", () => {
  it("confirms an order and reserves available finished stock", async () => {
    const { finishedItemId, finishedLotId } = await seededFinishedStock(60);
    const buyerId = await makeBuyer();
    const { id } = await makeOrder(buyerId, finishedItemId, 60);
    await actAs("export_sales");
    await q("select public.app_confirm_export_order($1)", [id]);
    const reserved = await first(
      "select coalesce(sum(quantity), 0) as total from public.export_reservations where order_id = $1",
      [id],
    );
    expect(Number(reserved.total)).toBe(60);
    const available = await first(
      "select public.app_lot_available($1) as avail",
      [finishedLotId],
    );
    expect(Number(available.avail)).toBe(0);
    const status = await first("select status from public.export_orders where id = $1", [id]);
    expect(status.status).toBe("confirmed");
  });

  it("records shortages as gaps, never as reservations beyond stock", async () => {
    const { finishedItemId, finishedLotId } = await seededFinishedStock(60);
    const buyerId = await makeBuyer();
    const first1 = await makeOrder(buyerId, finishedItemId, 80);
    await actAs("export_sales");
    await q("select public.app_confirm_export_order($1)", [first1.id]);
    const reserved = await first(
      "select coalesce(sum(quantity), 0) as total from public.export_reservations where order_id = $1",
      [first1.id],
    );
    expect(Number(reserved.total)).toBe(60);
    const second = await makeOrder(buyerId, finishedItemId, 20);
    await q("select public.app_confirm_export_order($1)", [second.id]);
    const nothing = await first(
      "select coalesce(sum(quantity), 0) as total from public.export_reservations where order_id = $1",
      [second.id],
    );
    expect(Number(nothing.total)).toBe(0);
    const available = await first(
      "select public.app_lot_available($1) as avail",
      [finishedLotId],
    );
    expect(Number(available.avail)).toBe(0);
  });

  it("refuses raw materials, inactive buyers, and empty lines", async () => {
    const { rawItemId, finishedItemId } = await seededFinishedStock(60);
    const buyerId = await makeBuyer();
    await actAs("export_sales");
    await rejects(
      "select public.app_create_export_order($1, 'USD', '', '', current_date, null, '', $2::jsonb)",
      [buyerId, JSON.stringify([{ item_id: rawItemId, quantity: 5 }])],
      /finished products/i,
    );
    await rejects(
      "select public.app_create_export_order($1, 'USD', '', '', current_date, null, '', '[]'::jsonb)",
      [buyerId],
      /at least one product line/i,
    );
    await q("select public.app_set_buyer_active($1, false)", [buyerId]);
    await rejects(
      "select public.app_create_export_order($1, 'USD', '', '', current_date, null, '', $2::jsonb)",
      [buyerId, JSON.stringify([{ item_id: finishedItemId, quantity: 5 }])],
      /active buyer/i,
    );
  });

  it("cancelling a confirmed order releases all reservations", async () => {
    const { finishedItemId, finishedLotId } = await seededFinishedStock(60);
    const buyerId = await makeBuyer();
    const { id } = await makeOrder(buyerId, finishedItemId, 60);
    await actAs("export_sales");
    await q("select public.app_confirm_export_order($1)", [id]);
    await q("select public.app_cancel_export_order($1)", [id]);
    const reserved = await first(
      "select coalesce(sum(quantity), 0) as total from public.export_reservations where order_id = $1",
      [id],
    );
    expect(Number(reserved.total)).toBe(0);
    const available = await first(
      "select public.app_lot_available($1) as avail",
      [finishedLotId],
    );
    expect(Number(available.avail)).toBe(60);
  });
});

describe("shipments and dispatch", () => {
  it("cannot plan more than the ordered quantity", async () => {
    const { finishedItemId, finishedLotId } = await seededFinishedStock(60);
    const buyerId = await makeBuyer();
    const { id, lineId } = await makeOrder(buyerId, finishedItemId, 60);
    await actAs("export_sales");
    await q("select public.app_confirm_export_order($1)", [id]);
    await rejects(
      "select public.app_create_shipment($1, '', '', '', '', '', null, null, 0, null, null, '', '', $2::jsonb)",
      [id, JSON.stringify([{ order_line_id: lineId, lot_id: finishedLotId, quantity: 70 }])],
      /Cannot plan more than the ordered quantity/,
    );
  });

  it("partial dispatch consumes reservations and records a dispatch movement", async () => {
    const { finishedItemId, finishedLotId } = await seededFinishedStock(100);
    const buyerId = await makeBuyer();
    const { id, lineId } = await makeOrder(buyerId, finishedItemId, 100);
    await actAs("export_sales");
    await q("select public.app_confirm_export_order($1)", [id]);
    const shipmentId = await makeShipment(id, [
      { order_line_id: lineId, lot_id: finishedLotId, quantity: 40 },
    ]);
    await q("select public.app_mark_shipment_ready($1)", [shipmentId]);
    await rejects(
      "select public.app_mark_shipment_ready($1)",
      [shipmentId],
      /Only a draft shipment/,
    );
    await q("select public.app_dispatch_shipment($1, current_date)", [shipmentId]);
    const onHand = await first(
      "select on_hand from public.stock_balances where item_id = $1",
      [finishedItemId],
    );
    expect(Number(onHand.on_hand)).toBe(60);
    const movement = await first(
      "select coalesce(sum(quantity_delta), 0) as total from public.stock_movements where movement_type = 'dispatch'",
    );
    expect(Number(movement.total)).toBe(-40);
    const reserved = await first(
      "select coalesce(sum(quantity), 0) as total from public.export_reservations where order_id = $1",
      [id],
    );
    expect(Number(reserved.total)).toBe(60);
    const order = await first(
      "select status from public.export_orders where id = $1",
      [id],
    );
    const line = await first(
      "select shipped_quantity from public.export_order_lines where id = $1",
      [lineId],
    );
    expect(Number(line.shipped_quantity)).toBe(40);
    expect(order.status).toBe("partially_shipped");
    const shipment = await first(
      "select status, dispatched_on is not null as dispatched from public.shipments where id = $1",
      [shipmentId],
    );
    expect(shipment.status).toBe("dispatched");
    expect(shipment.dispatched).toBe(true);
  });

  it("full dispatch ships the order, blocks cancellation, and close releases leftovers", async () => {
    const { finishedItemId, finishedLotId } = await seededFinishedStock(60);
    const buyerId = await makeBuyer();
    const { id, lineId } = await makeOrder(buyerId, finishedItemId, 60);
    await actAs("export_sales");
    await q("select public.app_confirm_export_order($1)", [id]);
    const shipmentId = await makeShipment(id, [
      { order_line_id: lineId, lot_id: finishedLotId, quantity: 60 },
    ]);
    await q("select public.app_mark_shipment_ready($1)", [shipmentId]);
    await rejects(
      "select public.app_create_invoice($1, current_date, null, 'USD', null, 0, 0, '', '[]'::jsonb)",
      [shipmentId],
      /only once it has dispatched/i,
    );
    await q("select public.app_dispatch_shipment($1, current_date)", [shipmentId]);
    const shipped = await first("select status from public.export_orders where id = $1", [id]);
    expect(shipped.status).toBe("shipped");
    await rejects(
      "select public.app_cancel_export_order($1)",
      [id],
      /cannot be cancelled/i,
    );
    await q("select public.app_mark_shipment_delivered($1)", [shipmentId]);
    await q("select public.app_close_export_order($1)", [id]);
    const closed = await first("select status from public.export_orders where id = $1", [id]);
    expect(closed.status).toBe("closed");
  });

  it("dispatch requires a ready shipment", async () => {
    const { finishedItemId, finishedLotId } = await seededFinishedStock(60);
    const buyerId = await makeBuyer();
    const { id, lineId } = await makeOrder(buyerId, finishedItemId, 60);
    await actAs("export_sales");
    await q("select public.app_confirm_export_order($1)", [id]);
    const shipmentId = await makeShipment(id, [
      { order_line_id: lineId, lot_id: finishedLotId, quantity: 60 },
    ]);
    await rejects(
      "select public.app_dispatch_shipment($1, current_date)",
      [shipmentId],
      /Mark the shipment ready/,
    );
  });
});

describe("invoices, receipts, bills, and payments", () => {
  async function dispatchedShipment() {
    const stock = await seededFinishedStock(60);
    const buyerId = await makeBuyer();
    const order = await makeOrder(buyerId, stock.finishedItemId, 60);
    await actAs("export_sales");
    await q("select public.app_confirm_export_order($1)", [order.id]);
    const shipmentId = await makeShipment(order.id, [
      { order_line_id: order.lineId, lot_id: stock.finishedLotId, quantity: 60 },
    ]);
    await q("select public.app_mark_shipment_ready($1)", [shipmentId]);
    await q("select public.app_dispatch_shipment($1, current_date)", [shipmentId]);
    return { ...stock, buyerId, orderId: order.id, shipmentId };
  }

  it("computes invoice totals and preserves currency through receipt allocation", async () => {
    const ctx = await dispatchedShipment();
    await actAs("export_sales");
    const invoiceId = (
      await q(
        "select public.app_create_invoice($1, current_date, current_date + 30, 'usd', null, 10, 5, '', $2::jsonb) as id",
        [ctx.shipmentId, JSON.stringify([{ description: "650g bricks", quantity: 60, unit_price: 2 }])],
      )
    )[0].id as string;
    const invoice = await first(
      "select code, currency, subtotal, discount, tax, amount, buyer_id from public.export_invoices where id = $1",
      [invoiceId],
    );
    expect(invoice.code).toMatch(/^INV-\d{4}$/);
    expect(invoice.currency).toBe("USD");
    expect(Number(invoice.subtotal)).toBe(120);
    expect(Number(invoice.amount)).toBe(115);
    expect(invoice.buyer_id).toBe(ctx.buyerId);
    await actAs("finance");
    const lkr = (
      await q(
        "select public.app_record_buyer_receipt($1, 'LKR', current_date, 50, null, '', '', '') as id",
        [ctx.buyerId],
      )
    )[0].id as string;
    await rejects(
      "select public.app_allocate_receipt($1, $2, 50)",
      [lkr, invoiceId],
      /same currency/,
    );
    const receiptId = (
      await q(
        "select public.app_record_buyer_receipt($1, 'USD', current_date, 115, null, 'Wire', 'REF-1', '') as id",
        [ctx.buyerId],
      )
    )[0].id as string;
    await rejects(
      "select public.app_allocate_receipt($1, $2, 116)",
      [receiptId, invoiceId],
      /exceeds the unapplied/,
    );
    await q("select public.app_allocate_receipt($1, $2, 100)", [receiptId, invoiceId]);
    const partial = await first(
      "select outstanding, payment_state from public.export_invoice_balances where id = $1",
      [invoiceId],
    );
    expect(Number(partial.outstanding)).toBe(15);
    expect(partial.payment_state).toBe("partially_paid");
    await q("select public.app_allocate_receipt($1, $2, 15)", [receiptId, invoiceId]);
    const paid = await first(
      "select outstanding, payment_state from public.export_invoice_balances where id = $1",
      [invoiceId],
    );
    expect(Number(paid.outstanding)).toBe(0);
    expect(paid.payment_state).toBe("paid");
  });

  it("bills, payments, allocation guards, and reversal restore balances", async () => {
    const { supplierId } = await seededFinishedStock(60);
    await actAs("stores");
    const otherSupplierId = (
      await q(
        "select public.app_create_supplier('Fiber Co', '', '', '', '', '', '', '', '', '') as id",
      )
    )[0].id as string;
    await actAs("finance");
    const billId = (
      await q(
        "select public.app_create_bill($1, null, current_date, current_date + 15, 'USD', null, 200, 'Cocopeat purchase', '') as id",
        [supplierId],
      )
    )[0].id as string;
    const bill = await first("select code from public.supplier_bills where id = $1", [billId]);
    expect(bill.code).toMatch(/^BILL-\d{4}$/);
    const paymentId = (
      await q(
        "select public.app_record_supplier_payment($1, 'USD', current_date, 100, null, '', '', '') as id",
        [supplierId],
      )
    )[0].id as string;
    await rejects(
      "select public.app_allocate_payment($1, $2, 150)",
      [paymentId, billId],
      /exceeds the unapplied/,
    );
    const otherBillId = (
      await q(
        "select public.app_create_bill($1, null, current_date, null, 'USD', null, 50, '', '') as id",
        [otherSupplierId],
      )
    )[0].id as string;
    await rejects(
      "select public.app_allocate_payment($1, $2, 50)",
      [paymentId, otherBillId],
      /same supplier/,
    );
    await q("select public.app_allocate_payment($1, $2, 100)", [paymentId, billId]);
    const billView = await first(
      "select outstanding, payment_state from public.supplier_bill_balances where id = $1",
      [billId],
    );
    expect(Number(billView.outstanding)).toBe(100);
    expect(billView.payment_state).toBe("partially_paid");
    await q("select public.app_reverse_supplier_payment($1)", [paymentId]);
    const afterReverse = await first(
      "select outstanding, payment_state from public.supplier_bill_balances where id = $1",
      [billId],
    );
    expect(Number(afterReverse.outstanding)).toBe(200);
    const reversedPayment = await first(
      "select status from public.supplier_payments where id = $1",
      [paymentId],
    );
    expect(reversedPayment.status).toBe("reversed");
    await rejects(
      "select public.app_reverse_supplier_payment($1)",
      [paymentId],
      /already been reversed/,
    );
    await rejects(
      "select public.app_allocate_payment($1, $2, 10)",
      [paymentId, billId],
      /reversed payment cannot be allocated/,
    );
  });

  it("gates finance writes to finance.manage and export writes to exports.manage", async () => {
    const { supplierId, finishedItemId } = await seededFinishedStock(60);
    await actAs("finance");
    await rejects(
      "select public.app_create_export_order($1, 'USD', '', '', current_date, null, '', $2::jsonb)",
      ["00000000-0000-0000-0000-000000000000", JSON.stringify([{ item_id: finishedItemId, quantity: 1 }])],
      /Not authorized/,
    );
    await actAs("export_sales");
    await rejects(
      "select public.app_record_supplier_payment($1, 'USD', current_date, 10, null, '', '', '')",
      [supplierId],
      /Not authorized/,
    );
  });
});

describe("row level security", () => {
  it("hides export and finance rows from unrelated staff and shows views accordingly", async () => {
    const { finishedItemId } = await seededFinishedStock(60);
    const buyerId = await makeBuyer();
    await makeOrder(buyerId, finishedItemId, 10);
    await actAs("stores");
    expect(await q("select id from public.buyers")).toHaveLength(0);
    expect(await q("select order_id from public.export_order_progress")).toHaveLength(0);
    expect(await q("select id from public.supplier_bills")).toHaveLength(0);
    await actAs("manager");
    expect(await q("select id from public.buyers")).toHaveLength(1);
    const progress = await first(
      "select ordered_quantity, status from public.export_order_progress limit 1",
    );
    expect(Number(progress.ordered_quantity)).toBe(10);
    await actAs("export_sales");
    expect(await q("select id from public.supplier_bills")).toHaveLength(0);
    await actAs("finance");
    expect(await q("select id from public.export_orders")).toHaveLength(1);
  });
});
