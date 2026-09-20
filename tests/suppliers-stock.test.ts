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
// Runs as the currently assumed role so row-level security and grants are enforced.
async function q(query: string, params: unknown[] = []) {
  return (await db.query(query, params)).rows as Row[];
}
async function first(query: string, params: unknown[] = []) {
  return (await q(query, params))[0];
}
// Runs a statement expected to fail inside a savepoint so the test transaction survives.
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
  ])
    await db.exec(
      await readFile(new URL(migration, import.meta.url), "utf8"),
    );
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

async function newSupplier(actor: Role = "stores") {
  await actAs(actor);
  const rows = await q(
    "select public.app_create_supplier('Coco Husks Ltd', 'Nimal', '+94', 'sales@coco.lk', 'Colombo', 'Sri Lanka', '', 'Net 30', 'USD', '') as id",
  );
  return (rows[0] as { id: string }).id;
}
async function newItem(
  actor: Role = "stores",
  category = "raw_material",
  name = "Cocopeat fibre",
) {
  await actAs(actor);
  const rows = await q(
    "select public.app_create_item($1, $2::public.item_category, 'kg', 50, null, '', '') as id",
    [name, category],
  );
  return (rows[0] as { id: string }).id;
}
async function newPurchase(supplierId: string, itemId: string, qty: number) {
  await actAs("stores");
  const lines = JSON.stringify([
    { item_id: itemId, quantity: qty, unit_price: 12 },
  ]);
  const rows = await q(
    "select public.app_create_purchase($1, 'USD', current_date, null, '', $2::jsonb) as id",
    [supplierId, lines],
  );
  const id = (rows[0] as { id: string }).id;
  await q("select public.app_confirm_purchase($1)", [id]);
  return id;
}
async function purchaseLine(purchaseId: string) {
  const row = await first(
    "select id from public.purchase_lines where purchase_id = $1",
    [purchaseId],
  );
  return (row as { id: string }).id;
}

describe("suppliers and stock migration", () => {
  it("generates readable, unique supplier and item codes by category", async () => {
    const supplier = await newSupplier();
    const raw = await newItem("stores", "raw_material", "Cocopeat");
    const finished = await newItem("stores", "finished_product", "650g Brick");
    const s = await first("select code from public.suppliers where id = $1", [
      supplier,
    ]);
    const r = await first("select code from public.items where id = $1", [raw]);
    const f = await first("select code from public.items where id = $1", [
      finished,
    ]);
    expect(s.code).toMatch(/^SUP-\d{4}$/);
    expect(r.code).toMatch(/^RM-\d{4}$/);
    expect(f.code).toMatch(/^FP-\d{4}$/);
  });

  it("blocks supplier and item writes for unauthorized roles", async () => {
    await actAs("production");
    await rejects(
      "select public.app_create_supplier('X Co', '', '', '', '', '', '', '', '', '')",
      [],
      /Not authorized/,
    );
    await rejects(
      "select public.app_create_item('Widget', 'raw_material', 'kg', 0, null, '', '')",
      [],
      /Not authorized/,
    );
    await actAs("export_sales");
    await rejects(
      "select public.app_create_supplier('X Co', '', '', '', '', '', '', '', '', '')",
      [],
      /Not authorized/,
    );
  });

  it("records opening stock as an append-only movement and derives the balance", async () => {
    const item = await newItem();
    await actAs("stores");
    await q("select public.app_record_opening_stock($1, 100, 5, 'OP-1')", [
      item,
    ]);
    const balance = await first(
      "select on_hand, available, is_low from public.stock_balances where item_id = $1",
      [item],
    );
    expect(Number(balance.on_hand)).toBe(100);
    expect(Number(balance.available)).toBe(100);
    expect(balance.is_low).toBe(false);
    const types = await q(
      "select movement_type from public.stock_movements where item_id = $1",
      [item],
    );
    expect(types).toEqual([{ movement_type: "opening" }]);
  });

  it("prevents direct edits to the stock ledger", async () => {
    await actAs("administrator");
    await rejects(
      "insert into public.stock_movements(item_id, warehouse_id, movement_type, quantity_delta) values (null, null, 'opening', 5)",
      [],
      /permission denied/i,
    );
  });

  it("receives a full purchase once and increases on-hand stock", async () => {
    const supplier = await newSupplier();
    const item = await newItem();
    const purchase = await newPurchase(supplier, item, 200);
    await actAs("stores");
    const line = await purchaseLine(purchase);
    await q(
      "select public.app_receive_goods($1, current_date, 'DL-9', '', $2::jsonb)",
      [
        purchase,
        JSON.stringify([
          {
            purchase_line_id: line,
            quantity: 200,
            lot_number: "L-1",
            unit_cost: 12,
          },
        ]),
      ],
    );
    const balance = await first(
      "select on_hand from public.stock_balances where item_id = $1",
      [item],
    );
    expect(Number(balance.on_hand)).toBe(200);
    const status = await first(
      "select status from public.purchases where id = $1",
      [purchase],
    );
    expect(status.status).toBe("received");
    const lots = await q(
      "select lot_number from public.stock_lot_balances where item_id = $1",
      [item],
    );
    expect(lots).toHaveLength(1);
  });

  it("supports partial receipts and rejects over-receipt", async () => {
    const supplier = await newSupplier();
    const item = await newItem();
    const purchase = await newPurchase(supplier, item, 100);
    await actAs("stores");
    const line = await purchaseLine(purchase);
    await q("select public.app_receive_goods($1, current_date, '', '', $2::jsonb)", [
      purchase,
      JSON.stringify([{ purchase_line_id: line, quantity: 60, lot_number: "P1" }]),
    ]);
    let status = await first(
      "select status from public.purchases where id = $1",
      [purchase],
    );
    expect(status.status).toBe("partially_received");
    let balance = await first(
      "select on_hand from public.stock_balances where item_id = $1",
      [item],
    );
    expect(Number(balance.on_hand)).toBe(60);
    await rejects(
      "select public.app_receive_goods($1, current_date, '', '', $2::jsonb)",
      [
        purchase,
        JSON.stringify([{ purchase_line_id: line, quantity: 50, lot_number: "P2" }]),
      ],
      /Cannot receive more than the ordered quantity/,
    );
    await q("select public.app_receive_goods($1, current_date, '', '', $2::jsonb)", [
      purchase,
      JSON.stringify([{ purchase_line_id: line, quantity: 40, lot_number: "P2" }]),
    ]);
    status = await first("select status from public.purchases where id = $1", [
      purchase,
    ]);
    expect(status.status).toBe("received");
    balance = await first(
      "select on_hand from public.stock_balances where item_id = $1",
      [item],
    );
    expect(Number(balance.on_hand)).toBe(100);
  });

  it("requires confirmation before receiving and an active supplier", async () => {
    await actAs("stores");
    const supplier = (
      await q(
        "select public.app_create_supplier('Fresh Co', '', '', '', '', '', '', '', '', '') as id",
      )
    )[0] as { id: string };
    const item = await newItem("stores", "raw_material", "Resin");
    const draft = (
      await q(
        "select public.app_create_purchase($1, 'USD', current_date, null, '', $2::jsonb) as id",
        [supplier.id, JSON.stringify([{ item_id: item, quantity: 10 }])],
      )
    )[0] as { id: string };
    await actAs("stores");
    const line = await purchaseLine(draft.id);
    await rejects(
      "select public.app_receive_goods($1, current_date, '', '', $2::jsonb)",
      [draft.id, JSON.stringify([{ purchase_line_id: line, quantity: 5 }])],
      /Confirm the order before receiving goods/,
    );
    await q("select public.app_set_supplier_active($1, false)", [supplier.id]);
    await rejects(
      "select public.app_create_purchase($1, 'USD', current_date, null, '', $2::jsonb)",
      [supplier.id, JSON.stringify([{ item_id: item, quantity: 5 }])],
      /active supplier/,
    );
  });

  it("gates adjustments: request by stores, approve by a manager, no double posting", async () => {
    const item = await newItem();
    await actAs("stores");
    await q("select public.app_record_opening_stock($1, 30, null, 'A-LOT')", [
      item,
    ]);
    const lot = await first("select id from public.lots where item_id = $1", [
      item,
    ]);
    const adjustment = (
      await q(
        "select public.app_request_adjustment($1, $2, 'decrease', 10, 'Damaged in storage') as id",
        [item, lot.id],
      )
    )[0] as { id: string };
    await actAs("stores");
    await rejects(
      "select public.app_decide_adjustment($1, true)",
      [adjustment.id],
      /Not authorized/,
    );
    await actAs("manager");
    await q("select public.app_decide_adjustment($1, true)", [adjustment.id]);
    await rejects(
      "select public.app_decide_adjustment($1, false)",
      [adjustment.id],
      /already been decided/,
    );
    const balance = await first(
      "select on_hand from public.stock_balances where item_id = $1",
      [item],
    );
    expect(Number(balance.on_hand)).toBe(20);
  });

  it("blocks a decrease that exceeds lot stock at request time", async () => {
    const item = await newItem();
    await actAs("stores");
    await q("select public.app_record_opening_stock($1, 5, null, 'LOW')", [
      item,
    ]);
    const lot = await first("select id from public.lots where item_id = $1", [
      item,
    ]);
    await rejects(
      "select public.app_request_adjustment($1, $2, 'decrease', 8, 'Too much removed')",
      [item, lot.id],
      /Insufficient stock/,
    );
  });

  it("keeps supplier bank details invisible without finance access", async () => {
    const supplier = await newSupplier();
    await actAs("finance");
    await q(
      "select public.app_save_supplier_payment_details($1, 'Bank of Ceylon', '123-456', '')",
      [supplier],
    );
    await actAs("stores");
    const visible = await q("select * from public.supplier_payment_details");
    expect(visible).toHaveLength(0);
    await rejects(
      "select public.app_save_supplier_payment_details($1, 'X', 'Y', '')",
      [supplier],
      /Not authorized/,
    );
    await actAs("finance");
    const readable = await q(
      "select bank_name from public.supplier_payment_details where supplier_id = $1",
      [supplier],
    );
    expect(readable).toEqual([{ bank_name: "Bank of Ceylon" }]);
  });

  it("preserves purchase history when a supplier is deactivated", async () => {
    const supplier = await newSupplier();
    const item = await newItem();
    await newPurchase(supplier, item, 10);
    await actAs("stores");
    await q("select public.app_set_supplier_active($1, false)", [supplier]);
    const stillThere = await first(
      "select is_active from public.suppliers where id = $1",
      [supplier],
    );
    expect(stillThere.is_active).toBe(false);
    const purchases = await q(
      "select id from public.purchases where supplier_id = $1",
      [supplier],
    );
    expect(purchases).toHaveLength(1);
  });

  it("audits key stock and purchasing actions", async () => {
    const supplier = await newSupplier();
    const item = await newItem();
    const purchase = await newPurchase(supplier, item, 40);
    await actAs("stores");
    const line = await purchaseLine(purchase);
    await q("select public.app_receive_goods($1, current_date, '', '', $2::jsonb)", [
      purchase,
      JSON.stringify([{ purchase_line_id: line, quantity: 40, lot_number: "AUD" }]),
    ]);
    // Audit rows are only readable with audit.view, so read them as an administrator.
    await actAs("administrator");
    const actions = (
      await q(
        "select distinct action from public.audit_events where action in ('supplier.created','item.created','purchase.created','goods.received') order by action",
      )
    ).map((row) => (row as { action: string }).action);
    expect(actions).toEqual([
      "goods.received",
      "item.created",
      "purchase.created",
      "supplier.created",
    ]);
  });

  it("keeps Phase 1 function grants intact after this migration", async () => {
    await actAs("administrator");
    const allowed = await q(
      "select public.app_has_permission('suppliers.view') as ok",
    );
    expect((allowed[0] as { ok: boolean }).ok).toBe(true);
  });
});
