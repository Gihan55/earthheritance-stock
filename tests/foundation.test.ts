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
import {
  DEFAULT_PERMISSIONS,
  PERMISSIONS,
  ROLES,
  type Role,
} from "../src/lib/permissions";

const ids = Object.fromEntries(
  ROLES.map((role, i) => [
    role,
    `11111111-1111-4111-8111-${String(i + 1).padStart(12, "0")}`,
  ]),
) as Record<Role, string>;
let db: PGlite;
async function actAs(role: Role) {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    ids[role],
  ]);
}
async function permission(key: string) {
  const result = await db.query<{ allowed: boolean }>(
    "select public.app_has_permission($1) as allowed",
    [key],
  );
  return result.rows[0].allowed;
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
  const migration = await readFile(
    new URL("../supabase/migrations/0001_foundation.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);
  for (const role of ROLES)
    await db.query("insert into auth.users(id, email) values ($1, $2)", [
      ids[role],
      `${role}@example.com`,
    ]);
  await db.query(
    "select public.app_bootstrap_admin($1, 'Initial Administrator')",
    [ids.administrator],
  );
  for (const role of ROLES.filter((r) => r !== "administrator")) {
    await db.query(
      "insert into public.profiles(id, email, full_name, role) values ($1, $2, $3, $4)",
      [ids[role], `${role}@example.com`, `Test ${role}`, role],
    );
  }
}, 30000);
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback; reset role;");
});
afterAll(async () => {
  await db?.close();
});

describe("foundation migration and authorization", () => {
  it("keeps database role defaults and the UI permission catalog identical", async () => {
    const catalog = await db.query<{ key: string }>(
      "select key from public.permission_catalog",
    );
    expect(catalog.rows.map((row) => row.key).sort()).toEqual(
      Object.keys(PERMISSIONS).sort(),
    );
    for (const role of ROLES) {
      const { rows } = await db.query<{ permission: string }>(
        "select permission from public.role_permissions where role = $1",
        [role],
      );
      expect(rows.map((row) => row.permission).sort()).toEqual(
        [...DEFAULT_PERMISSIONS[role]].sort(),
      );
    }
  });
  it.each(ROLES)(
    "enforces every default permission for the %s role",
    async (role) => {
      await actAs(role);
      for (const key of Object.keys(PERMISSIONS))
        expect(await permission(key)).toBe(
          DEFAULT_PERMISSIONS[role].includes(key as keyof typeof PERMISSIONS),
        );
    },
  );
  it("only lets non-administrators read their own staff profile", async () => {
    await actAs("production");
    const { rows } = await db.query<{ id: string }>(
      "select id from public.profiles",
    );
    expect(rows).toEqual([{ id: ids.production }]);
    expect(
      (await db.query("select * from public.audit_events")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.staff_invitations")).rows,
    ).toHaveLength(0);
  });
  it("blocks direct profile edits and self-promotion", async () => {
    await actAs("production");
    await expect(
      db.query(
        "update public.profiles set role = 'administrator' where id = $1",
        [ids.production],
      ),
    ).rejects.toThrow(/permission denied/i);
  });
  it("blocks direct role-permission writes even for an administrator", async () => {
    await actAs("administrator");
    await expect(
      db.exec("delete from public.role_permissions where role = 'production'"),
    ).rejects.toThrow(/permission denied/i);
  });
  it("blocks unauthorized company RPCs, not just the UI", async () => {
    await actAs("production");
    await expect(
      db.exec(
        "select public.app_save_company('Company', '', '', '', 'Sri Lanka', 'LKR', 'Main warehouse')",
      ),
    ).rejects.toThrow(/Not authorized/);
  });
  it("blocks unauthorized role management", async () => {
    await actAs("finance");
    await expect(
      db.exec(
        "select public.app_set_role_permissions('finance', array['users.manage'])",
      ),
    ).rejects.toThrow(/Not authorized/);
  });
  it("blocks anonymous reads and function execution", async () => {
    await db.exec("set role anon");
    await expect(db.exec("select public.app_is_active()")).rejects.toThrow(
      /permission denied/i,
    );
  });
  it("keeps bootstrap inaccessible to signed-in staff", async () => {
    await actAs("administrator");
    await expect(
      db.query("select public.app_bootstrap_admin($1, 'Another Admin')", [
        ids.production,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });
  it("refuses to initialize twice", async () => {
    await expect(
      db.query("select public.app_bootstrap_admin($1, 'Another Admin')", [
        ids.production,
      ]),
    ).rejects.toThrow(/Already initialized/);
  });
  it("prevents removal of the last active administrator", async () => {
    await actAs("administrator");
    await expect(
      db.query("select public.app_set_staff_access($1, 'manager', false)", [
        ids.administrator,
      ]),
    ).rejects.toThrow(/at least one active administrator/);
  });
  it("allows a demotion when another active administrator remains", async () => {
    await actAs("administrator");
    await db.query(
      "select public.app_set_staff_access($1, 'administrator', true)",
      [ids.manager],
    );
    await db.query("select public.app_set_staff_access($1, 'manager', true)", [
      ids.administrator,
    ]);
    expect(await permission("users.manage")).toBe(false);
    expect(await permission("finance.view")).toBe(true);
  });
  it("deactivation immediately removes permissions even with an existing auth identity", async () => {
    await actAs("administrator");
    await db.query("select public.app_set_staff_access($1, 'finance', false)", [
      ids.finance,
    ]);
    await actAs("finance");
    expect(await permission("finance.view")).toBe(false);
    expect(
      (await db.query("select * from public.role_permissions")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.company_settings")).rows,
    ).toHaveLength(0);
  });
  it("allows operational customization and invalidates affected profiles", async () => {
    await actAs("administrator");
    await db.exec(
      "select public.app_set_role_permissions('production', array['inventory.view', 'reports.view'])",
    );
    const revisions = await db.query<{ security_revision: number }>(
      "select security_revision from public.profiles where role = 'production'",
    );
    expect(revisions.rows[0].security_revision).toBe(1);
    expect(
      (
        await db.query(
          "select * from public.audit_events where action = 'role.permissions_updated'",
        )
      ).rows,
    ).toHaveLength(1);
    await actAs("production");
    expect(await permission("production.manage")).toBe(false);
    expect(await permission("reports.view")).toBe(true);
  });
  it("rejects administrator-only permissions in another role", async () => {
    await actAs("administrator");
    await expect(
      db.exec(
        "select public.app_set_role_permissions('production', array['users.manage'])",
      ),
    ).rejects.toThrow(/Invalid or protected permission/);
  });
  it("keeps administrator permissions immutable", async () => {
    await actAs("administrator");
    await expect(
      db.exec(
        "select public.app_set_role_permissions('administrator', array[]::text[])",
      ),
    ).rejects.toThrow(/Administrator permissions are protected/);
  });
  it("saves a single company record with an audit event", async () => {
    await actAs("administrator");
    await db.exec(
      "select public.app_save_company('Test Company', 'office@example.com', '', '', 'Sri Lanka', 'lkr', 'Main warehouse')",
    );
    await db.exec(
      "select public.app_save_company('Updated Company', '', '', '', 'Sri Lanka', 'LKR', 'Factory')",
    );
    expect(
      (
        await db.query(
          "select name, base_currency from public.company_settings",
        )
      ).rows,
    ).toEqual([{ name: "Updated Company", base_currency: "LKR" }]);
    expect(
      (
        await db.query(
          "select * from public.audit_events where action = 'company.updated'",
        )
      ).rows,
    ).toHaveLength(2);
  });
  it("rejects invalid company currency at the database boundary", async () => {
    await actAs("administrator");
    await expect(
      db.exec(
        "select public.app_save_company('Company', '', '', '', 'Sri Lanka', 'bad-code', 'Warehouse')",
      ),
    ).rejects.toThrow(/check constraint/);
  });
  it("enrolls invited staff from trusted invitation records, never editable metadata", async () => {
    const newId = "22222222-2222-4222-8222-222222222222";
    await actAs("administrator");
    await db.exec(
      "select public.app_prepare_invitation('new@example.com', 'New Staff', 'stores')",
    );
    await db.exec("reset role");
    await db.query(
      "insert into auth.users(id, email, raw_user_meta_data) values ($1, 'new@example.com', '{\"role\":\"administrator\"}')",
      [newId],
    );
    expect(
      (
        await db.query("select role from public.profiles where id = $1", [
          newId,
        ])
      ).rows,
    ).toEqual([{ role: "stores" }]);
    expect(
      (await db.query("select * from public.staff_invitations")).rows,
    ).toHaveLength(0);
  });
  it("enrolls directly created members the same as invited staff", async () => {
    const newId = "22222222-2222-4222-8222-222222222222";
    await actAs("administrator");
    await db.exec(
      "select public.app_prepare_invitation('direct@example.com', 'Direct Member', 'finance')",
    );
    await db.exec("reset role");
    // The admin createUser(email_confirm: true) call inserts a fully registered
    // auth user, which the same enrollment trigger picks up by email.
    await db.query(
      "insert into auth.users(id, email) values ($1, 'direct@example.com')",
      [newId],
    );
    expect(
      (
        await db.query(
          "select role, email from public.profiles where id = $1",
          [newId],
        )
      ).rows,
    ).toEqual([{ role: "finance", email: "direct@example.com" }]);
    expect(
      (await db.query("select * from public.staff_invitations")).rows,
    ).toHaveLength(0);
  });
  it("does not grant access to uninvited auth users", async () => {
    const newId = "22222222-2222-4222-8222-222222222222";
    await db.query(
      "insert into auth.users(id, email, raw_user_meta_data) values ($1, 'stranger@example.com', '{\"role\":\"administrator\"}')",
      [newId],
    );
    expect(
      (await db.query("select * from public.profiles where id = $1", [newId]))
        .rows,
    ).toHaveLength(0);
  });
  it("does not enroll a canceled invitation", async () => {
    await actAs("administrator");
    await db.exec(
      "select public.app_prepare_invitation('new@example.com', 'New Staff', 'stores'); select public.app_cancel_invitation('new@example.com'); reset role;",
    );
    await db.exec(
      "insert into auth.users(id, email) values ('22222222-2222-4222-8222-222222222222', 'new@example.com')",
    );
    expect(
      (
        await db.query(
          "select * from public.profiles where email = 'new@example.com'",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("does not enroll an expired invitation", async () => {
    await actAs("administrator");
    await db.exec(
      "select public.app_prepare_invitation('new@example.com', 'New Staff', 'stores'); reset role;",
    );
    await db.exec(
      "update public.staff_invitations set created_at = now() - interval '2 days'; insert into auth.users(id, email) values ('22222222-2222-4222-8222-222222222222', 'new@example.com')",
    );
    expect(
      (
        await db.query(
          "select * from public.profiles where email = 'new@example.com'",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("preserves audit events against direct deletion", async () => {
    await actAs("administrator");
    await expect(db.exec("delete from public.audit_events")).rejects.toThrow(
      /permission denied/i,
    );
  });
});
