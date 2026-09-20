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

// Seed a supplier-sourced raw-material lot by buying and receiving it, so the lot
// carries a supplier linkage for traceability.
async function seededRawLot(quantity: number) {
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
      [
        supplierId,
        JSON.stringify([
          { item_id: rawItemId, quantity, unit_price: 1 },
        ]),
      ],
    )
  )[0].id as string;
  await q("select public.app_confirm_purchase($1)", [purchaseId]);
  const purchaseLine = (
    await first("select id from public.purchase_lines where purchase_id = $1", [
      purchaseId,
    ])
  ).id as string;
  await q(
    "select public.app_receive_goods($1, current_date, '', '', $2::jsonb)",
    [
      purchaseId,
      JSON.stringify([
        { purchase_line_id: purchaseLine, quantity, lot_number: "SRC-1" },
      ]),
    ],
  );
  const lot = await first("select id from public.lots where item_id = $1", [
    rawItemId,
  ]);
  return {
    supplierId,
    rawItemId,
    finishedItemId,
    lotId: (lot as { id: string }).id,
  };
}

async function newBatch(
  rawItemId: string,
  lotId: string,
  inputQty: number,
  finishedItemId: string,
  outputQty = 60,
) {
  await actAs("production");
  const batchId = (
    await q(
      "select public.app_create_batch(current_date, 'Shift A', $1::jsonb, $2::jsonb, $3::jsonb) as id",
      [
        JSON.stringify([
          { item_id: rawItemId, lot_id: lotId, quantity: inputQty },
        ]),
        JSON.stringify([
          { item_id: finishedItemId, quantity: outputQty, unit_cost: 2.5 },
        ]),
        JSON.stringify([{ quantity: 3, unit: "kg", reason: "Fines removed" }]),
      ],
    )
  )[0].id as string;
  return { id: batchId, finishedItemId };
}

describe("production migration", () => {
  it("creates a draft batch with PB code and records wastage", async () => {
    const { rawItemId, lotId, finishedItemId } = await seededRawLot(100);
    const { id } = await newBatch(rawItemId, lotId, 80, finishedItemId);
    const batch = await first(
      "select code, status from public.production_batches where id = $1",
      [id],
    );
    expect(batch.code).toMatch(/^PB-\d{4}$/);
    expect(batch.status).toBe("draft");
    const wastage = await first(
      "select quantity, reason from public.production_wastage where batch_id = $1",
      [id],
    );
    expect(Number(wastage.quantity)).toBe(3);
    expect(wastage.reason).toBe("Fines removed");
  });

  it("rejects inputs that are not raw materials and zero quantities", async () => {
    const { rawItemId, lotId, finishedItemId } = await seededRawLot(100);
    await actAs("production");
    await rejects(
      "select public.app_create_batch(current_date, '', $1::jsonb, '[]'::jsonb, '[]'::jsonb)",
      [
        JSON.stringify([
          { item_id: rawItemId, lot_id: lotId, quantity: 10 },
          { item_id: rawItemId, lot_id: lotId, quantity: 0 },
        ]),
      ],
      /quantity must be greater than zero/i,
    );
    // Using a finished item as an input must fail.
    await rejects(
      "select public.app_create_batch(current_date, '', $1::jsonb, '[]'::jsonb, '[]'::jsonb)",
      [
        JSON.stringify([
          { item_id: finishedItemId, lot_id: lotId, quantity: 5 },
        ]),
      ],
      /raw material/i,
    );
    // A raw item that is not a finished product must be refused as an output.
    await rejects(
      "select public.app_create_batch(current_date, '', '[]'::jsonb, $1::jsonb, '[]'::jsonb)",
      [JSON.stringify([{ item_id: rawItemId, quantity: 5 }])],
      /finished product/i,
    );
  });

  it("posts a batch: consumes inputs, creates a finished lot, and moves stock atomically", async () => {
    const { rawItemId, lotId, finishedItemId } = await seededRawLot(100);
    const { id } = await newBatch(rawItemId, lotId, 80, finishedItemId, 60);
    await actAs("production");
    await q("select public.app_post_batch($1)", [id]);
    const rawBalance = await first(
      "select on_hand from public.stock_balances where item_id = $1",
      [rawItemId],
    );
    const finishedBalance = await first(
      "select on_hand from public.stock_balances where item_id = $1",
      [finishedItemId],
    );
    expect(Number(rawBalance.on_hand)).toBe(20);
    expect(Number(finishedBalance.on_hand)).toBe(60);
    const status = await first(
      "select status, posted_at is not null as posted from public.production_batches where id = $1",
      [id],
    );
    expect(status.status).toBe("posted");
    expect(status.posted).toBe(true);
    const lot = await first(
      "select lot_number, produced_batch_id from public.lots where item_id = $1",
      [finishedItemId],
    );
    expect(lot.lot_number).toMatch(/^PB-\d{4}-\d{5}$/);
    expect(lot.produced_batch_id).toBe(id);
  });

  it("refuses to post when a source lot lacks enough stock", async () => {
    const { rawItemId, lotId, finishedItemId } = await seededRawLot(50);
    const { id } = await newBatch(rawItemId, lotId, 80, finishedItemId);
    await actAs("production");
    await rejects(
      "select public.app_post_batch($1)",
      [id],
      /Insufficient stock/,
    );
  });

  it("locks the lifecycle: no line edits after posting and no double post", async () => {
    const { rawItemId, lotId, finishedItemId } = await seededRawLot(100);
    const { id } = await newBatch(rawItemId, lotId, 40, finishedItemId);
    await actAs("production");
    await q("select public.app_post_batch($1)", [id]);
    await rejects(
      "select public.app_post_batch($1)",
      [id],
      /Only a draft batch can be posted/,
    );
    await rejects(
      "select public.app_replace_batch_lines($1, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)",
      [id],
      /Only a draft batch can be edited/,
    );
  });

  it("reverses an untouched batch and restores stock, then blocks a second reversal", async () => {
    const { rawItemId, lotId, finishedItemId } = await seededRawLot(100);
    const { id } = await newBatch(rawItemId, lotId, 80, finishedItemId, 60);
    await actAs("production");
    await q("select public.app_post_batch($1)", [id]);
    await q("select public.app_reverse_batch($1)", [id]);
    const rawBalance = await first(
      "select on_hand from public.stock_balances where item_id = $1",
      [rawItemId],
    );
    const finishedBalance = await first(
      "select on_hand from public.stock_balances where item_id = $1",
      [finishedItemId],
    );
    expect(Number(rawBalance.on_hand)).toBe(100);
    expect(Number(finishedBalance.on_hand)).toBe(0);
    await rejects(
      "select public.app_reverse_batch($1)",
      [id],
      /Only a posted batch can be reversed/,
    );
  });

  it("refuses reversal once a produced lot has been consumed elsewhere", async () => {
    const { rawItemId, lotId, finishedItemId } = await seededRawLot(100);
    const { id } = await newBatch(rawItemId, lotId, 80, finishedItemId, 60);
    await actAs("production");
    await q("select public.app_post_batch($1)", [id]);
    const producedLot = (
      await first("select id from public.lots where item_id = $1", [
        finishedItemId,
      ])
    ).id as string;
    // A manager-approved stock decrease leaves a non-production movement on the lot.
    await actAs("stores");
    const adjustmentId = (
      await q(
        "select public.app_request_adjustment($1, $2, 'decrease', 10, 'Sampled by buyer') as id",
        [finishedItemId, producedLot],
      )
    )[0].id as string;
    await actAs("manager");
    await q("select public.app_decide_adjustment($1, true)", [adjustmentId]);
    await actAs("production");
    await rejects(
      "select public.app_reverse_batch($1)",
      [id],
      /already been used/,
    );
  });

  it("gates batch writes to production.manage and reads to the right roles", async () => {
    const { rawItemId, lotId, finishedItemId } = await seededRawLot(100);
    const { id } = await newBatch(rawItemId, lotId, 80, finishedItemId, 60);
    await actAs("export_sales");
    await rejects(
      "select public.app_create_batch(current_date, '', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)",
      [],
      /Not authorized/,
    );
    // SELECT is granted but the row-level policy hides everything without production.view.
    const hidden = await q("select id from public.production_batches");
    expect(hidden).toHaveLength(0);
    await actAs("manager");
    const visible = await q("select id from public.production_batches");
    expect(visible.map((row) => row.id)).toContain(id);
  });

  it("links finished lots back to their supplier through traceability", async () => {
    const { rawItemId, lotId, finishedItemId } = await seededRawLot(100);
    const { id } = await newBatch(rawItemId, lotId, 80, finishedItemId, 60);
    await actAs("production");
    await q("select public.app_post_batch($1)", [id]);
    // Read the joined supplier through the view as a role that may see suppliers.
    await actAs("administrator");
    const trace = await first(
      "select finished_lot_number, input_lot_number, supplier_name from public.production_traceability where batch_id = $1",
      [id],
    );
    expect(trace.input_lot_number).toBe("SRC-1");
    expect(trace.supplier_name).toBe("Husk Co");
    expect(trace.finished_lot_number).toMatch(/^PB-\d{4}-\d{5}$/);
  });
});
