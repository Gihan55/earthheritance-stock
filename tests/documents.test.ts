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

// Create a supplier through the RPC, then seed a bill directly as the test
// owner so the document tests do not depend on the finance RPCs.
async function seedBill() {
  await actAs("stores");
  const supplierId = (
    await q(
      "select public.app_create_supplier('Husk Co', '', '', '', '', '', '', '', '', '') as id",
    )
  )[0].id as string;
  await db.exec("reset role");
  const billId = (
    await q(
      "insert into public.supplier_bills(supplier_id, code, currency, amount) values ($1, 'BILL-DOC-1', 'USD', 100) returning id",
      [supplierId],
    )
  )[0].id as string;
  return billId;
}
function documentPath(billId: string) {
  return `supplier_bill/${billId}/e3a1f0a4-0000-4000-8000-0000000000aa-slip.pdf`;
}
async function registerBillDocument(billId: string, size = 20480) {
  return (
    await q(
      "select public.app_register_document('supplier_bill', $1::uuid, 'Bank transfer slip', 'payment_evidence', $2, 'slip.pdf', $3::bigint, 'application/pdf') as id",
      [billId, documentPath(billId), size],
    )
  )[0].id as string;
}

describe("private supporting documents", () => {
  it("lets finance attach and remove a payment evidence document", async () => {
    const billId = await seedBill();
    await actAs("finance");
    const documentId = await registerBillDocument(billId);
    const row = (
      await q(
        "select title, category, entity_type, uploaded_by from public.documents where id = $1",
        [documentId],
      )
    )[0];
    expect(row.title).toBe("Bank transfer slip");
    expect(row.category).toBe("payment_evidence");
    expect(row.entity_type).toBe("supplier_bill");
    expect(row.uploaded_by).toBe(ids.finance);
    await db.exec("reset role");
    const audit = await q(
      "select action from public.audit_events where target = $1 order by created_at",
      [documentId],
    );
    expect(audit.map((entry) => entry.action)).toContain("document.added");
    await actAs("finance");
    await q("select public.app_remove_document($1::uuid)", [documentId]);
    expect(
      await q("select id from public.documents where id = $1", [documentId]),
    ).toHaveLength(0);
    await db.exec("reset role");
    const removed = await q(
      "select action from public.audit_events where target = $1",
      [documentId],
    );
    expect(removed.map((entry) => entry.action)).toContain("document.removed");
  });

  it("blocks roles without the managing permission for that record", async () => {
    const billId = await seedBill();
    await actAs("stores");
    await rejects(
      "select public.app_register_document('supplier_bill', $1::uuid, 'Slip', 'payment_evidence', $2, 'slip.pdf', 20480::bigint, 'application/pdf')",
      [billId, documentPath(billId)],
      /Not authorized for this document type/,
    );
  });

  it("requires the storage path to point at the attached record", async () => {
    const billId = await seedBill();
    await actAs("finance");
    await rejects(
      "select public.app_register_document('supplier_bill', $1::uuid, 'Slip', 'other', $2, 'slip.pdf', 20480::bigint, 'application/pdf')",
      [
        billId,
        "supplier_bill/99999999-9999-4999-8999-000000000099-slip.pdf",
      ],
      /File path must match the record/,
    );
  });

  it("validates file type and size", async () => {
    const billId = await seedBill();
    await actAs("finance");
    await rejects(
      "select public.app_register_document('supplier_bill', $1::uuid, 'Slip', 'other', $2, 'slip.txt', 20480::bigint, 'text/plain')",
      [billId, documentPath(billId)],
      /Unsupported file type/,
    );
    await rejects(
      "select public.app_register_document('supplier_bill', $1::uuid, 'Slip', 'other', $2, 'big.pdf', 11534336::bigint, 'application/pdf')",
      [billId, documentPath(billId)],
      /10 MB/,
    );
  });

  it("rejects documents attached to records that do not exist", async () => {
    await actAs("finance");
    await rejects(
      "select public.app_register_document('supplier_bill', $1::uuid, 'Slip', 'other', $2, 'slip.pdf', 20480::bigint, 'application/pdf')",
      [
        "99999999-9999-4999-8999-000000000099",
        "supplier_bill/99999999-9999-4999-8999-000000000099/slip.pdf",
      ],
      /Record not found/,
    );
  });

  it("scopes document visibility with row level security", async () => {
    const billId = await seedBill();
    await actAs("finance");
    await registerBillDocument(billId);
    await actAs("stores");
    expect(
      await q("select id from public.documents where entity_id = $1", [billId]),
    ).toHaveLength(0);
    await actAs("administrator");
    expect(
      await q("select id from public.documents where entity_id = $1", [billId]),
    ).toHaveLength(1);
  });

  it("only lets the managing permission remove a document", async () => {
    const billId = await seedBill();
    await actAs("finance");
    const documentId = await registerBillDocument(billId);
    await actAs("stores");
    await rejects(
      "select public.app_remove_document($1::uuid)",
      [documentId],
      /Not authorized for this document type/,
    );
    await actAs("finance");
    await rejects(
      "select public.app_remove_document($1::uuid)",
      ["99999999-9999-4999-8999-000000000099"],
      /Document not found/,
    );
  });
});
