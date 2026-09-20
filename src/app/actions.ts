"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import {
  createAdminSupabase,
  createServerSupabase,
} from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getActor } from "@/lib/workspace";
import type { Permission } from "@/lib/permissions";
import {
  accessSchema,
  adjustmentDecisionSchema,
  adjustmentSchema,
  allocatePaymentSchema,
  allocateReceiptSchema,
  batchIdSchema,
  batchSchema,
  billSchema,
  buyerIdSchema,
  buyerReceiptSchema,
  buyerSchema,
  companySchema,
  dispatchSchema,
  documentRegisterSchema,
  documentRemoveSchema,
  exportOrderIdSchema,
  exportOrderSchema,
  inviteSchema,
  invoiceSchema,
  itemIdSchema,
  itemSchema,
  ledgerIdSchema,
  openingStockSchema,
  passwordSchema,
  purchaseIdSchema,
  purchaseSchema,
  receiveSchema,
  rolePermissionsSchema,
  shipmentIdSchema,
  shipmentSchema,
  signInSchema,
  staffPasswordResetSchema,
  supplierIdSchema,
  supplierPaymentRecordSchema,
  supplierPaymentSchema,
  supplierSchema,
  type ActionState,
} from "@/lib/validation";
import { DOCUMENT_ENTITIES, isDocumentEntity } from "@/lib/records";

class ActionError extends Error {}
const fail = (message: string): ActionState => ({ success: false, message });
const ok = (message: string): ActionState => ({ success: true, message });
function rpcError(error: { message: string } | null) {
  if (!error) return;
  const safeMessages = [
    "Keep at least one active administrator",
    "Not authorized",
    "Staff member not found",
    "Administrator permissions are protected",
    "Invalid or protected permission",
    "This email already has an account. Manage its access or resend its invitation from Supabase Auth.",
    "Supplier not found",
    "Supplier name is required",
    "Item not found",
    "Item name is required",
    "A stock unit is required",
    "No active warehouse is configured",
    "Opening quantity must be greater than zero",
    "A valid currency is required",
    "Add at least one item line",
    "Every line needs a valid item",
    "Line quantity must be greater than zero",
    "Choose an active supplier",
    "Purchase order not found",
    "Only a draft order can be confirmed",
    "This order cannot be cancelled",
    "An order with received stock cannot be cancelled",
    "Confirm the order before receiving goods",
    "Add at least one received line",
    "Received line does not match this order",
    "Cannot receive more than the ordered quantity",
    "Adjustment not found",
    "Adjustment quantity must be greater than zero",
    "A reason is required",
    "Lot not found for this item",
    "This adjustment has already been decided",
    "Batch not found",
    "Only a draft batch can be posted",
    "Only a draft batch can be edited",
    "Only a posted batch can be reversed",
    "Add at least one input material",
    "Add at least one output product",
    "Production inputs must be raw materials",
    "Production outputs must be finished products",
    "Every input line needs a valid item",
    "Every input line needs a valid raw material",
    "Every output line needs a valid finished product",
    "Input lot not found for this item",
    "Input lot no longer exists",
    "Input quantity must be greater than zero",
    "Output quantity must be greater than zero",
    "Wastage quantity must be greater than zero",
    "Produced stock has already been used; reverse those records first",
    "Buyer name is required",
    "Buyer not found",
    "Choose an active buyer",
    "Export order not found",
    "Every line needs a valid product",
    "Export orders ship finished products",
    "Add at least one product line",
    "An order with shipped stock cannot be cancelled",
    "Only a shipped order can be closed",
    "Confirm the order before adding a shipment",
    "Add at least one shipment line",
    "Shipment line does not match this order",
    "Shipment lot does not match the ordered product",
    "Cannot plan more than the ordered quantity",
    "Shipment not found",
    "Only a draft shipment can be marked ready",
    "Mark the shipment ready before dispatching",
    "Shipment lot no longer exists",
    "Cannot dispatch more than the ordered quantity",
    "Only a dispatched shipment can be marked delivered",
    "Invoice a shipment only once it has dispatched",
    "Add at least one invoice line",
    "Every invoice line needs a description",
    "Invoice line quantity must be greater than zero",
    "Invoice not found",
    "Receipts can only be allocated to the same buyer",
    "Receipts can only be allocated within the same currency",
    "Allocation exceeds the unapplied receipt balance",
    "Allocation exceeds the outstanding invoice balance",
    "Receipt not found",
    "A reversed receipt cannot be allocated",
    "This receipt has already been reversed",
    "Receipt amount must be greater than zero",
    "Bill amount must be greater than zero",
    "Payment not found",
    "A reversed payment cannot be allocated",
    "Payments can only be allocated to the same supplier",
    "Payments can only be allocated within the same currency",
    "Allocation exceeds the unapplied payment balance",
    "Allocation exceeds the outstanding bill balance",
    "Allocation amount must be greater than zero",
    "This payment has already been reversed",
    "Payment amount must be greater than zero",
    "Not authorized for this document type",
    "File path must match the record it is attached to",
    "Documents must be between 1 byte and 10 MB",
    "Unsupported file type",
    "Record not found",
    "Document not found",
  ];
  throw new ActionError(
    safeMessages.includes(error.message) ||
      error.message.startsWith("Insufficient stock")
      ? error.message
      : "The change could not be saved. Check your database setup and try again.",
  );
}
async function perform(
  permission: Permission,
  task: (
    db: Awaited<ReturnType<typeof createServerSupabase>>,
  ) => Promise<string>,
): Promise<ActionState> {
  if (!isSupabaseConfigured())
    return fail(
      "Connect Supabase first. This local preview cannot save changes.",
    );
  try {
    const actor = await getActor();
    if (!actor || !actor.permissions.includes(permission))
      return fail(
        "You do not have permission to perform this action. Refresh the page or contact your administrator.",
      );
    const message = await task(await createServerSupabase());
    revalidatePath("/", "layout");
    return ok(message);
  } catch (error) {
    if (error instanceof ZodError)
      return fail(error.issues[0]?.message ?? "Check the form fields.");
    if (error instanceof ActionError) return fail(error.message);
    return fail(
      "The request could not be completed. Check the connection and try again.",
    );
  }
}
export async function signIn(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!isSupabaseConfigured())
    return fail("Sign-in is available after Supabase is connected.");
  const input = signInSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return fail(input.error.issues[0].message);
  try {
    const db = await createServerSupabase();
    const { data, error } = await db.auth.signInWithPassword(input.data);
    if (error || !data.user)
      return fail(
        "Unable to sign in. Check your email and password and try again.",
      );
    const { data: profile } = await db
      .from("profiles")
      .select("is_active")
      .eq("id", data.user.id)
      .single();
    if (!profile?.is_active) {
      await db.auth.signOut();
      return fail(
        "Your staff access is not active. Contact your administrator.",
      );
    }
  } catch {
    return fail("Sign-in is temporarily unavailable. Please try again.");
  }
  redirect("/");
}
export async function signOut() {
  if (isSupabaseConfigured())
    await (await createServerSupabase()).auth.signOut();
  redirect("/login");
}
export async function changePassword(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!isSupabaseConfigured())
    return fail("Connect Supabase before setting a password.");
  const input = passwordSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return fail(input.error.issues[0].message);
  try {
    const actor = await getActor();
    if (!actor)
      return fail(
        "Your invitation or session has expired, or access has been disabled. Contact your administrator.",
      );
    const db = await createServerSupabase();
    const { error } = await db.auth.updateUser({
      password: input.data.password,
    });
    if (error)
      return fail(
        "Unable to update your password. Try a new password or ask your administrator for a fresh invitation.",
      );
    // Revoke other refresh sessions after a password change; this session remains signed in.
    await db.auth.signOut({ scope: "others" });
    return ok("Your password has been saved. You can now open your workspace.");
  } catch {
    return fail("Unable to update your password. Please try again.");
  }
}
export async function saveCompany(_previous: ActionState, form: FormData) {
  return perform("settings.manage", async (db) => {
    const input = companySchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_save_company", {
      company_name: input.name,
      company_email: input.email,
      company_phone: input.phone,
      company_address: input.address,
      company_country: input.country,
      currency: input.base_currency,
      warehouse: input.warehouse_name,
    });
    rpcError(error);
    return "Company settings saved.";
  });
}
export async function inviteStaff(_previous: ActionState, form: FormData) {
  return perform("users.manage", async (db) => {
    const input = inviteSchema.parse(Object.fromEntries(form));
    if (!process.env.SUPABASE_SECRET_KEY)
      throw new ActionError(
        "Set the server-side Supabase secret key to enable invitations.",
      );
    const origin = process.env.NEXT_PUBLIC_SITE_URL;
    if (!origin)
      throw new ActionError("Set NEXT_PUBLIC_SITE_URL before inviting staff.");
    const url = new URL(origin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    )
      throw new ActionError("Configure a valid HTTPS site URL for production.");
    const { error: prepareError } = await db.rpc("app_prepare_invitation", {
      staff_email: input.email,
      staff_name: input.full_name,
      staff_role: input.role,
    });
    rpcError(prepareError);
    try {
      const { error } =
        await createAdminSupabase().auth.admin.inviteUserByEmail(input.email, {
          redirectTo: `${url.origin}/auth/callback`,
        });
      if (error)
        throw new ActionError(
          "The invitation could not be sent. Check Supabase email delivery and existing accounts before retrying.",
        );
    } catch (error) {
      await db.rpc("app_cancel_invitation", { staff_email: input.email });
      throw error;
    }
    return `Invitation sent to ${input.email}.`;
  });
}
export async function updateStaffAccess(
  _previous: ActionState,
  form: FormData,
) {
  return perform("users.manage", async (db) => {
    const input = accessSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_set_staff_access", {
      target_user: input.user_id,
      new_role: input.role,
      active: input.is_active,
    });
    rpcError(error);
    return "Staff access updated.";
  });
}
export async function resetStaffPassword(
  _previous: ActionState,
  form: FormData,
) {
  return perform("users.manage", async (db) => {
    const input = staffPasswordResetSchema.parse(Object.fromEntries(form));
    if (!process.env.SUPABASE_SECRET_KEY)
      throw new ActionError(
        "Set the server-side Supabase secret key to reset staff passwords.",
      );
    // The target must be an enrolled profile, not an arbitrary auth user.
    const { data: target, error: lookupError } = await db
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", input.user_id)
      .maybeSingle();
    if (lookupError) rpcError(lookupError);
    if (!target)
      throw new ActionError(
        "Staff member not found. Reset a password after their invitation is accepted.",
      );
    // Never let a password reset lock out the last active administrator.
    if (target.role === "administrator" && target.is_active) {
      const { count, error: countError } = await db
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "administrator")
        .eq("is_active", true);
      if (countError) rpcError(countError);
      if ((count ?? 0) <= 1)
        throw new ActionError(
          "The last active administrator must change their own password from Account security.",
        );
    }
    const { error } = await createAdminSupabase().auth.admin.updateUserById(
      input.user_id,
      { password: input.password },
    );
    if (error)
      throw new ActionError(
        "The password could not be reset. Check that the account still exists in Supabase Auth.",
      );
    // Supabase invalidates the staff member's sessions when the password changes.
    const { error: auditError } = await db.rpc("app_log_audit", {
      p_action: "staff.password_reset",
      p_target: input.user_id,
      p_details: { name: target.full_name },
    });
    if (auditError) rpcError(auditError);
    return `Password updated for ${target.full_name}. They must sign in again.`;
  });
}
export async function saveRolePermissions(
  _previous: ActionState,
  form: FormData,
) {
  return perform("roles.manage", async (db) => {
    const input = rolePermissionsSchema.parse({
      role: form.get("role"),
      permissions: form.getAll("permissions"),
    });
    const { error } = await db.rpc("app_set_role_permissions", {
      target_role: input.role,
      selected_permissions: input.permissions,
    });
    rpcError(error);
    return "Role permissions saved. They apply to all staff with this role.";
  });
}
export async function cancelInvitation(_previous: ActionState, form: FormData) {
  return perform("users.manage", async (db) => {
    const email = z.email().parse(form.get("email"));
    const { error } = await db.rpc("app_cancel_invitation", {
      staff_email: email,
    });
    rpcError(error);
    return "Pending invitation canceled.";
  });
}

// ---- Phase 2 actions -------------------------------------------------------------
function formValues(form: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of form.entries())
    if (key !== "lines") values[key] = value;
  if (values.id === "") delete values.id;
  return values;
}
function jsonLines(form: FormData): unknown[] {
  try {
    const parsed = JSON.parse(String(form.get("lines") ?? "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function jsonArray(form: FormData, field: string): unknown[] {
  try {
    const parsed = JSON.parse(String(form.get(field) ?? "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveSupplier(_previous: ActionState, form: FormData) {
  return perform("suppliers.manage", async (db) => {
    const input = supplierSchema.parse(formValues(form));
    const fields = {
      p_name: input.name,
      p_contact_person: input.contact_person,
      p_phone: input.phone,
      p_email: input.email,
      p_address: input.address,
      p_country: input.country,
      p_tax_id: input.tax_id,
      p_payment_terms: input.payment_terms,
      p_preferred_currency: input.preferred_currency.toUpperCase(),
      p_notes: input.notes,
    };
    if (input.id) {
      const { error } = await db.rpc("app_update_supplier", {
        p_id: input.id,
        ...fields,
      });
      rpcError(error);
      return "Supplier details updated.";
    }
    const { error } = await db.rpc("app_create_supplier", fields);
    rpcError(error);
    return "Supplier added to your directory.";
  });
}
export async function setSupplierActive(
  _previous: ActionState,
  form: FormData,
) {
  return perform("suppliers.manage", async (db) => {
    const input = supplierIdSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_set_supplier_active", {
      p_id: input.id,
      p_active: input.is_active,
    });
    rpcError(error);
    return input.is_active
      ? "Supplier reactivated."
      : "Supplier deactivated. Their history is preserved.";
  });
}
export async function saveSupplierPaymentDetails(
  _previous: ActionState,
  form: FormData,
) {
  return perform("finance.manage", async (db) => {
    const input = supplierPaymentSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_save_supplier_payment_details", {
      p_supplier_id: input.supplier_id,
      p_bank_name: input.bank_name,
      p_bank_account: input.bank_account,
      p_payment_notes: input.payment_notes,
    });
    rpcError(error);
    return "Supplier payment details saved.";
  });
}

export async function saveItem(_previous: ActionState, form: FormData) {
  return perform("inventory.manage", async (db) => {
    const input = itemSchema.parse(formValues(form));
    if (input.id) {
      const { error } = await db.rpc("app_update_item", {
        p_id: input.id,
        p_name: input.name,
        p_stock_unit: input.stock_unit,
        p_reorder_level: input.reorder_level,
        p_net_weight_kg: input.net_weight_kg ?? null,
        p_packaging_spec: input.packaging_spec,
        p_notes: input.notes,
      });
      rpcError(error);
      return "Item updated.";
    }
    const { error } = await db.rpc("app_create_item", {
      p_name: input.name,
      p_category: input.category,
      p_stock_unit: input.stock_unit,
      p_reorder_level: input.reorder_level,
      p_net_weight_kg: input.net_weight_kg ?? null,
      p_packaging_spec: input.packaging_spec,
      p_notes: input.notes,
    });
    rpcError(error);
    return "Item added to your catalogue.";
  });
}
export async function setItemActive(_previous: ActionState, form: FormData) {
  return perform("inventory.manage", async (db) => {
    const input = itemIdSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_set_item_active", {
      p_id: input.id,
      p_active: input.is_active,
    });
    rpcError(error);
    return input.is_active ? "Item reactivated." : "Item deactivated.";
  });
}
export async function recordOpeningStock(
  _previous: ActionState,
  form: FormData,
) {
  return perform("inventory.manage", async (db) => {
    const input = openingStockSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_record_opening_stock", {
      p_item_id: input.item_id,
      p_quantity: input.quantity,
      p_unit_cost: input.unit_cost ?? null,
      p_lot_number: input.lot_number,
    });
    rpcError(error);
    return "Opening stock recorded.";
  });
}

export async function createPurchase(_previous: ActionState, form: FormData) {
  return perform("purchasing.manage", async (db) => {
    const input = purchaseSchema.parse({
      ...formValues(form),
      lines: jsonLines(form),
    });
    const { error } = await db.rpc("app_create_purchase", {
      p_supplier_id: input.supplier_id,
      p_currency: input.currency,
      p_order_date: input.order_date,
      p_expected_date: input.expected_date || null,
      p_notes: input.notes,
      p_lines: input.lines,
    });
    rpcError(error);
    return "Purchase order created as a draft.";
  });
}
export async function confirmPurchase(_previous: ActionState, form: FormData) {
  return perform("purchasing.manage", async (db) => {
    const input = purchaseIdSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_confirm_purchase", { p_id: input.id });
    rpcError(error);
    return "Purchase order confirmed.";
  });
}
export async function cancelPurchase(_previous: ActionState, form: FormData) {
  return perform("purchasing.manage", async (db) => {
    const input = purchaseIdSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_cancel_purchase", { p_id: input.id });
    rpcError(error);
    return "Purchase order cancelled.";
  });
}
export async function receiveGoods(_previous: ActionState, form: FormData) {
  return perform("purchasing.manage", async (db) => {
    const input = receiveSchema.parse({
      ...formValues(form),
      lines: jsonLines(form),
    });
    const { error } = await db.rpc("app_receive_goods", {
      p_purchase_id: input.purchase_id,
      p_receipt_date: input.receipt_date,
      p_supplier_reference: input.supplier_reference,
      p_notes: input.notes,
      p_lines: input.lines,
    });
    rpcError(error);
    return "Goods receipt recorded and stock updated.";
  });
}

export async function requestAdjustment(
  _previous: ActionState,
  form: FormData,
) {
  return perform("inventory.manage", async (db) => {
    const input = adjustmentSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_request_adjustment", {
      p_item_id: input.item_id,
      p_lot_id: input.lot_id,
      p_direction: input.direction,
      p_quantity: input.quantity,
      p_reason: input.reason,
    });
    rpcError(error);
    return "Stock adjustment submitted for approval.";
  });
}
export async function decideAdjustment(_previous: ActionState, form: FormData) {
  return perform("inventory.approve", async (db) => {
    const input = adjustmentDecisionSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_decide_adjustment", {
      p_id: input.id,
      p_approve: input.decision === "approve",
    });
    rpcError(error);
    return input.decision === "approve"
      ? "Adjustment approved and posted to stock."
      : "Adjustment rejected.";
  });
}

// ---- Phase 3 actions -------------------------------------------------------------
export async function createBatch(_previous: ActionState, form: FormData) {
  return perform("production.manage", async (db) => {
    const input = batchSchema.parse({
      produced_on: form.get("produced_on"),
      notes: form.get("notes"),
      inputs: jsonArray(form, "inputs"),
      outputs: jsonArray(form, "outputs"),
      wastage: jsonArray(form, "wastage"),
    });
    const { error } = await db.rpc("app_create_batch", {
      p_produced_on: input.produced_on,
      p_notes: input.notes,
      p_inputs: input.inputs,
      p_outputs: input.outputs,
      p_wastage: input.wastage,
    });
    rpcError(error);
    return "Draft production batch created.";
  });
}
export async function updateBatch(_previous: ActionState, form: FormData) {
  return perform("production.manage", async (db) => {
    const input = batchSchema.parse({
      id: form.get("id"),
      produced_on: form.get("produced_on"),
      notes: form.get("notes"),
      inputs: jsonArray(form, "inputs"),
      outputs: jsonArray(form, "outputs"),
      wastage: jsonArray(form, "wastage"),
    });
    const { error } = await db.rpc("app_replace_batch_lines", {
      p_id: input.id,
      p_inputs: input.inputs,
      p_outputs: input.outputs,
      p_wastage: input.wastage,
    });
    rpcError(error);
    return "Draft batch updated.";
  });
}
export async function postBatch(_previous: ActionState, form: FormData) {
  return perform("production.manage", async (db) => {
    const input = batchIdSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_post_batch", { p_id: input.id });
    rpcError(error);
    return "Batch posted. Inputs consumed and finished stock created.";
  });
}
export async function reverseBatch(_previous: ActionState, form: FormData) {
  return perform("production.manage", async (db) => {
    const input = batchIdSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_reverse_batch", { p_id: input.id });
    rpcError(error);
    return "Batch reversed and stock restored.";
  });
}

// ---- Phase 4 actions -------------------------------------------------------------
export async function saveBuyer(_previous: ActionState, form: FormData) {
  return perform("buyers.manage", async (db) => {
    const input = buyerSchema.parse(formValues(form));
    const fields = {
      p_name: input.name,
      p_contact_person: input.contact_person,
      p_phone: input.phone,
      p_email: input.email,
      p_billing_address: input.billing_address,
      p_shipping_address: input.shipping_address,
      p_destination_country: input.destination_country,
      p_tax_id: input.tax_id,
      p_payment_terms: input.payment_terms,
      p_preferred_currency: input.preferred_currency.toUpperCase(),
      p_notes: input.notes,
    };
    if (input.id) {
      const { error } = await db.rpc("app_update_buyer", {
        p_id: input.id,
        ...fields,
      });
      rpcError(error);
      return "Buyer details updated.";
    }
    const { error } = await db.rpc("app_create_buyer", fields);
    rpcError(error);
    return "Buyer added to your directory.";
  });
}
export async function setBuyerActive(_previous: ActionState, form: FormData) {
  return perform("buyers.manage", async (db) => {
    const input = buyerIdSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_set_buyer_active", {
      p_id: input.id,
      p_active: input.is_active,
    });
    rpcError(error);
    return input.is_active
      ? "Buyer reactivated."
      : "Buyer deactivated. Their history is preserved.";
  });
}

export async function createExportOrder(
  _previous: ActionState,
  form: FormData,
) {
  return perform("exports.manage", async (db) => {
    const input = exportOrderSchema.parse({
      ...formValues(form),
      lines: jsonLines(form),
    });
    const { error } = await db.rpc("app_create_export_order", {
      p_buyer_id: input.buyer_id,
      p_currency: input.currency,
      p_incoterms: input.incoterms,
      p_destination_country: input.destination_country,
      p_order_date: input.order_date,
      p_requested_ship_date: input.requested_ship_date || null,
      p_notes: input.notes,
      p_lines: input.lines,
    });
    rpcError(error);
    return "Export order created as a draft.";
  });
}
async function orderTransition(
  form: FormData,
  fn: string,
  message: string,
) {
  return perform("exports.manage", async (db) => {
    const input = exportOrderIdSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc(fn, { p_id: input.id });
    rpcError(error);
    return message;
  });
}
export async function confirmExportOrder(_previous: ActionState, form: FormData) {
  return orderTransition(form, "app_confirm_export_order", "Export order confirmed and stock reserved.");
}
export async function cancelExportOrder(_previous: ActionState, form: FormData) {
  return orderTransition(form, "app_cancel_export_order", "Export order cancelled and reservations released.");
}
export async function closeExportOrder(_previous: ActionState, form: FormData) {
  return orderTransition(form, "app_close_export_order", "Export order closed.");
}

export async function createShipment(_previous: ActionState, form: FormData) {
  return perform("exports.manage", async (db) => {
    const input = shipmentSchema.parse({
      ...formValues(form),
      lines: jsonLines(form),
    });
    const { error } = await db.rpc("app_create_shipment", {
      p_order_id: input.order_id,
      p_container_number: input.container_number,
      p_seal_number: input.seal_number,
      p_port_of_loading: input.port_of_loading,
      p_port_of_discharge: input.port_of_discharge,
      p_vessel: input.vessel,
      p_etd: input.etd || null,
      p_eta: input.eta || null,
      p_package_count: input.package_count ?? null,
      p_net_weight_kg: input.net_weight_kg ?? null,
      p_gross_weight_kg: input.gross_weight_kg ?? null,
      p_bl_reference: input.bl_reference,
      p_notes: input.notes,
      p_lines: input.lines,
    });
    rpcError(error);
    return "Shipment planned as a draft.";
  });
}
export async function markShipmentReady(
  _previous: ActionState,
  form: FormData,
) {
  return perform("exports.manage", async (db) => {
    const input = shipmentIdSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_mark_shipment_ready", {
      p_id: input.id,
    });
    rpcError(error);
    return "Shipment marked ready for dispatch.";
  });
}
export async function dispatchShipment(
  _previous: ActionState,
  form: FormData,
) {
  return perform("exports.manage", async (db) => {
    const input = dispatchSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_dispatch_shipment", {
      p_id: input.id,
      p_dispatched_on: input.dispatched_on || null,
    });
    rpcError(error);
    return "Shipment dispatched and stock deducted.";
  });
}
export async function markShipmentDelivered(
  _previous: ActionState,
  form: FormData,
) {
  return perform("exports.manage", async (db) => {
    const input = shipmentIdSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_mark_shipment_delivered", {
      p_id: input.id,
    });
    rpcError(error);
    return "Shipment marked delivered.";
  });
}

export async function createInvoice(_previous: ActionState, form: FormData) {
  return perform("exports.manage", async (db) => {
    const input = invoiceSchema.parse({
      ...formValues(form),
      lines: jsonLines(form),
    });
    const { error } = await db.rpc("app_create_invoice", {
      p_shipment_id: input.shipment_id,
      p_issue_date: input.issue_date,
      p_due_date: input.due_date || null,
      p_currency: input.currency,
      p_exchange_rate: input.exchange_rate ?? null,
      p_discount: input.discount ?? null,
      p_tax: input.tax ?? null,
      p_notes: input.notes,
      p_lines: input.lines,
    });
    rpcError(error);
    return "Commercial invoice issued.";
  });
}

export async function createBill(_previous: ActionState, form: FormData) {
  return perform("finance.manage", async (db) => {
    const input = billSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_create_bill", {
      p_supplier_id: input.supplier_id,
      p_purchase_id: input.purchase_id ?? null,
      p_issue_date: input.issue_date,
      p_due_date: input.due_date || null,
      p_currency: input.currency,
      p_exchange_rate: input.exchange_rate ?? null,
      p_amount: input.amount,
      p_description: input.description,
      p_notes: input.notes,
    });
    rpcError(error);
    return "Supplier bill recorded.";
  });
}

export async function recordSupplierPayment(
  _previous: ActionState,
  form: FormData,
) {
  return perform("finance.manage", async (db) => {
    const input = supplierPaymentRecordSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_record_supplier_payment", {
      p_supplier_id: input.supplier_id,
      p_currency: input.currency,
      p_payment_date: input.payment_date,
      p_amount: input.amount,
      p_exchange_rate: input.exchange_rate ?? null,
      p_method: input.method,
      p_reference: input.reference,
      p_notes: input.notes,
    });
    rpcError(error);
    return "Supplier payment recorded.";
  });
}
export async function allocatePayment(
  _previous: ActionState,
  form: FormData,
) {
  return perform("finance.manage", async (db) => {
    const input = allocatePaymentSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_allocate_payment", {
      p_payment_id: input.payment_id,
      p_bill_id: input.bill_id,
      p_amount: input.amount,
    });
    rpcError(error);
    return "Payment allocated to bill.";
  });
}
export async function reverseSupplierPayment(
  _previous: ActionState,
  form: FormData,
) {
  return perform("finance.manage", async (db) => {
    const input = ledgerIdSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_reverse_supplier_payment", {
      p_id: input.id,
    });
    rpcError(error);
    return "Payment reversed and allocations released.";
  });
}

export async function recordBuyerReceipt(
  _previous: ActionState,
  form: FormData,
) {
  return perform("finance.manage", async (db) => {
    const input = buyerReceiptSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_record_buyer_receipt", {
      p_buyer_id: input.buyer_id,
      p_currency: input.currency,
      p_receipt_date: input.receipt_date,
      p_amount: input.amount,
      p_exchange_rate: input.exchange_rate ?? null,
      p_method: input.method,
      p_reference: input.reference,
      p_notes: input.notes,
    });
    rpcError(error);
    return "Buyer receipt recorded.";
  });
}
export async function allocateReceipt(
  _previous: ActionState,
  form: FormData,
) {
  return perform("finance.manage", async (db) => {
    const input = allocateReceiptSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_allocate_receipt", {
      p_receipt_id: input.receipt_id,
      p_invoice_id: input.invoice_id,
      p_amount: input.amount,
    });
    rpcError(error);
    return "Receipt allocated to invoice.";
  });
}
export async function reverseBuyerReceipt(
  _previous: ActionState,
  form: FormData,
) {
  return perform("finance.manage", async (db) => {
    const input = ledgerIdSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_reverse_buyer_receipt", {
      p_id: input.id,
    });
    rpcError(error);
    return "Receipt reversed and allocations released.";
  });
}

function documentPermission(form: FormData): Permission | null {
  const entity = String(form.get("entity_type") ?? "");
  return isDocumentEntity(entity) ? DOCUMENT_ENTITIES[entity].manage : null;
}
export async function attachDocument(
  _previous: ActionState,
  form: FormData,
) {
  const permission = documentPermission(form);
  if (!permission) return fail("Unknown document record.");
  return perform(permission, async (db) => {
    const input = documentRegisterSchema.parse(Object.fromEntries(form));
    if (!process.env.SUPABASE_SECRET_KEY)
      throw new ActionError(
        "Document storage requires the server-side Supabase secret key.",
      );
    // Confirm the browser really uploaded this object to the private bucket.
    const folder = `${input.entity_type}/${input.entity_id}/`;
    if (!input.file_path.startsWith(folder))
      throw new ActionError("The uploaded file does not match this record.");
    const objectName = input.file_path.slice(folder.length);
    const { data: listing, error: listError } =
      await createAdminSupabase().storage
        .from("attachments")
        .list(folder, { limit: 1000 });
    if (listError || !listing?.some((file) => file.name === objectName))
      throw new ActionError(
        "The uploaded file was not found. Check your connection and upload it again.",
      );
    const { error } = await db.rpc("app_register_document", {
      p_entity_type: input.entity_type,
      p_entity_id: input.entity_id,
      p_title: input.title,
      p_category: input.category,
      p_file_path: input.file_path,
      p_file_name: input.file_name,
      p_file_size_bytes: input.file_size_bytes,
      p_mime_type: input.mime_type,
    });
    rpcError(error);
    return "Document attached.";
  });
}
export async function removeDocument(
  _previous: ActionState,
  form: FormData,
) {
  const permission = documentPermission(form);
  if (!permission) return fail("Unknown document record.");
  return perform(permission, async (db) => {
    const input = documentRemoveSchema.parse(Object.fromEntries(form));
    const { error } = await db.rpc("app_remove_document", { p_id: input.id });
    rpcError(error);
    return "Document removed.";
  });
}

