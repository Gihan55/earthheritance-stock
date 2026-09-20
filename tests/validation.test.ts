import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accessSchema,
  companySchema,
  inviteSchema,
  passwordSchema,
  rolePermissionsSchema,
} from "../src/lib/validation";
import { can, DEFAULT_PERMISSIONS } from "../src/lib/permissions";
import {
  isLocalPreview,
  isSupabaseConfigured,
} from "../src/lib/supabase/config";

const company = {
  name: "Test Export Company",
  email: "office@example.com",
  phone: "",
  address: "",
  country: "Sri Lanka",
  base_currency: "lkr",
  warehouse_name: "Main warehouse",
};
afterEach(() => vi.unstubAllEnvs());
describe("input validation", () => {
  it("normalizes company currency without choosing a default for the user", () => {
    expect(companySchema.parse(company).base_currency).toBe("LKR");
    expect(
      companySchema.safeParse({ ...company, base_currency: "" }).success,
    ).toBe(false);
    expect(
      companySchema.safeParse({ ...company, base_currency: "ABC" }).success,
    ).toBe(false);
  });
  it("requires company identity and warehouse", () => {
    for (const key of ["name", "country", "warehouse_name"])
      expect(companySchema.safeParse({ ...company, [key]: "" }).success).toBe(
        false,
      );
  });
  it("rejects invalid email addresses", () => {
    expect(
      inviteSchema.safeParse({
        full_name: "Test Staff",
        email: "invalid",
        role: "stores",
      }).success,
    ).toBe(false);
  });
  it("normalizes invitation email addresses", () => {
    expect(
      inviteSchema.parse({
        full_name: " Test Staff ",
        email: " STAFF@EXAMPLE.COM ",
        role: "stores",
      }),
    ).toEqual({
      full_name: "Test Staff",
      email: "staff@example.com",
      role: "stores",
    });
  });
  it("requires long matching passwords", () => {
    expect(
      passwordSchema.safeParse({ password: "short", confirmPassword: "short" })
        .success,
    ).toBe(false);
    expect(
      passwordSchema.safeParse({
        password: "a-long-new-password",
        confirmPassword: "a-different-password",
      }).success,
    ).toBe(false);
    expect(
      passwordSchema.safeParse({
        password: "a-long-new-password",
        confirmPassword: "a-long-new-password",
      }).success,
    ).toBe(true);
  });
  it("rejects unknown access levels and malformed active flags", () => {
    expect(
      inviteSchema.safeParse({
        full_name: "Test Staff",
        email: "staff@example.com",
        role: "superuser",
      }).success,
    ).toBe(false);
    expect(
      accessSchema.safeParse({
        user_id: "11111111-1111-4111-8111-111111111111",
        role: "stores",
        is_active: "yes",
      }).success,
    ).toBe(false);
  });
  it("blocks editing administrator rights and assigning admin-only powers", () => {
    expect(
      rolePermissionsSchema.safeParse({
        role: "administrator",
        permissions: [],
      }).success,
    ).toBe(false);
    expect(
      rolePermissionsSchema.safeParse({
        role: "production",
        permissions: ["users.manage"],
      }).success,
    ).toBe(false);
    expect(
      rolePermissionsSchema.safeParse({
        role: "production",
        permissions: ["finance.view"],
      }).success,
    ).toBe(true);
  });
  it("separates operational access from financial access", () => {
    expect(can(DEFAULT_PERMISSIONS.stores, "finance.view")).toBe(false);
    expect(can(DEFAULT_PERMISSIONS.production, "finance.manage")).toBe(false);
    expect(can(DEFAULT_PERMISSIONS.finance, "inventory.manage")).toBe(false);
  });
});
describe("local preview boundary", () => {
  it("only enables a read-only preview in unconfigured development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(isLocalPreview()).toBe(true);
    expect(isSupabaseConfigured()).toBe(false);
  });
  it("never enables the preview in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(isLocalPreview()).toBe(false);
  });
  it("requires real authentication once a backend is configured", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "test-public-placeholder",
    );
    expect(isSupabaseConfigured()).toBe(true);
    expect(isLocalPreview()).toBe(false);
  });
});
