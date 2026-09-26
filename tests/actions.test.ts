import { beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_STATE } from "../src/lib/validation";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  actor: vi.fn(),
  rpc: vi.fn(),
  adminClient: vi.fn(),
  serverClient: vi.fn(),
  revalidate: vi.fn(),
  passwordUpdate: vi.fn(),
  createUser: vi.fn(),
}));
vi.mock("@/lib/supabase/config", () => ({
  isSupabaseConfigured: mocks.configured,
}));
vi.mock("@/lib/workspace", () => ({ getActor: mocks.actor }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: mocks.serverClient,
  createAdminSupabase: mocks.adminClient,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import {
  addStaffMember,
  cancelInvitation,
  changePassword,
  inviteStaff,
  saveCompany,
  saveRolePermissions,
  signIn,
  updateStaffAccess,
} from "../src/app/actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.actor.mockResolvedValue(null);
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.serverClient.mockResolvedValue({
    rpc: mocks.rpc,
    auth: { updateUser: mocks.passwordUpdate },
  });
  mocks.createUser.mockResolvedValue({ error: null });
  mocks.adminClient.mockReturnValue({
    auth: { admin: { createUser: mocks.createUser } },
  });
});
const data = (values: Record<string, string>) => {
  const form = new FormData();
  Object.entries(values).forEach(([key, value]) => form.set(key, value));
  return form;
};
describe("server action boundaries", () => {
  it.each([
    saveCompany,
    inviteStaff,
    addStaffMember,
    saveRolePermissions,
    updateStaffAccess,
    cancelInvitation,
    changePassword,
    signIn,
  ])("rejects unconfigured preview writes: %s", async (action) => {
    mocks.configured.mockReturnValue(false);
    const result = await action(INITIAL_STATE, new FormData());
    expect(result.success).toBe(false);
    expect(mocks.serverClient).not.toHaveBeenCalled();
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });
  it.each([
    saveCompany,
    inviteStaff,
    addStaffMember,
    saveRolePermissions,
    updateStaffAccess,
    cancelInvitation,
  ])("requires a live active actor: %s", async (action) => {
    const result = await action(INITIAL_STATE, new FormData());
    expect(result.success).toBe(false);
    expect(mocks.serverClient).not.toHaveBeenCalled();
  });
  it("does not trust roles supplied in form data", async () => {
    mocks.actor.mockResolvedValue({
      permissions: ["inventory.view"],
      profile: { role: "production" },
    });
    const result = await inviteStaff(
      INITIAL_STATE,
      data({
        role: "administrator",
        email: "test@example.com",
        full_name: "Test Staff",
      }),
    );
    expect(result.success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });
  it("adds a member without email by confirming the created auth user", async () => {
    process.env.SUPABASE_SECRET_KEY = "test-secret-key";
    mocks.actor.mockResolvedValue({ permissions: ["users.manage"] });
    const result = await addStaffMember(
      INITIAL_STATE,
      data({
        full_name: "Direct Member",
        email: "direct@example.com",
        role: "stores",
        password: "a-long-shared-password",
        confirmPassword: "a-long-shared-password",
      }),
    );
    expect(result.success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("app_prepare_invitation", {
      staff_email: "direct@example.com",
      staff_name: "Direct Member",
      staff_role: "stores",
    });
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: "direct@example.com",
      password: "a-long-shared-password",
      email_confirm: true,
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "app_cancel_invitation",
      expect.anything(),
    );
  });
  it("cancels the invitation record when direct account creation fails", async () => {
    process.env.SUPABASE_SECRET_KEY = "test-secret-key";
    mocks.actor.mockResolvedValue({ permissions: ["users.manage"] });
    mocks.createUser.mockResolvedValue({
      error: { message: "User already registered" },
    });
    const result = await addStaffMember(
      INITIAL_STATE,
      data({
        full_name: "Direct Member",
        email: "direct@example.com",
        role: "stores",
        password: "a-long-shared-password",
        confirmPassword: "a-long-shared-password",
      }),
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("could not be created");
    expect(mocks.rpc).toHaveBeenCalledWith("app_cancel_invitation", {
      staff_email: "direct@example.com",
    });
  });
  it("requires the shared password to be confirmed before writing anything", async () => {
    mocks.actor.mockResolvedValue({ permissions: ["users.manage"] });
    const result = await addStaffMember(
      INITIAL_STATE,
      data({
        full_name: "Direct Member",
        email: "direct@example.com",
        role: "stores",
        password: "a-long-shared-password",
        confirmPassword: "a-different-password",
      }),
    );
    expect(result.success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.adminClient).not.toHaveBeenCalled();
  });
  it("validates settings before invoking a database mutation", async () => {
    mocks.actor.mockResolvedValue({ permissions: ["settings.manage"] });
    const result = await saveCompany(INITIAL_STATE, new FormData());
    expect(result.success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("saves validated company settings through the authorized RPC", async () => {
    mocks.actor.mockResolvedValue({ permissions: ["settings.manage"] });
    const result = await saveCompany(
      INITIAL_STATE,
      data({
        name: "Test Company",
        email: "",
        phone: "",
        address: "",
        country: "Sri Lanka",
        base_currency: "lkr",
        warehouse_name: "Factory",
      }),
    );
    expect(result.success).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("app_save_company", {
      company_name: "Test Company",
      company_email: "",
      company_phone: "",
      company_address: "",
      company_country: "Sri Lanka",
      currency: "LKR",
      warehouse: "Factory",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
  });
  it("shows the protected-last-administrator error without claiming success", async () => {
    mocks.actor.mockResolvedValue({ permissions: ["users.manage"] });
    mocks.rpc.mockResolvedValue({
      error: { message: "Keep at least one active administrator" },
    });
    const result = await updateStaffAccess(
      INITIAL_STATE,
      data({
        user_id: "11111111-1111-4111-8111-111111111111",
        role: "manager",
        is_active: "false",
      }),
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("at least one active administrator");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not leak unexpected database errors", async () => {
    mocks.actor.mockResolvedValue({ permissions: ["users.manage"] });
    mocks.rpc.mockResolvedValue({
      error: { message: "internal database diagnostic" },
    });
    const result = await cancelInvitation(
      INITIAL_STATE,
      data({ email: "staff@example.com" }),
    );
    expect(result.success).toBe(false);
    expect(result.message).not.toContain("internal database diagnostic");
  });
  it("blocks password updates for inactive or missing staff", async () => {
    const result = await changePassword(
      INITIAL_STATE,
      data({
        password: "a-long-new-password",
        confirmPassword: "a-long-new-password",
      }),
    );
    expect(result.success).toBe(false);
    expect(mocks.passwordUpdate).not.toHaveBeenCalled();
  });
});
