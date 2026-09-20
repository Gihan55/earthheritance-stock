import { z } from "zod";
import { ADMIN_PERMISSIONS, PERMISSIONS, ROLES } from "./permissions";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid email address."));

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(1024),
});
export const passwordSchema = z
  .object({
    password: z.string().min(12, "Use at least 12 characters.").max(128),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
export const inviteSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "Enter the staff member’s full name.")
    .max(100),
  email: emailSchema,
  role: z.enum(ROLES),
});
export const accessSchema = z.object({
  user_id: z.uuid(),
  role: z.enum(ROLES),
  is_active: z.enum(["true", "false"]).transform((value) => value === "true"),
});
export const companySchema = z.object({
  name: z.string().trim().min(2, "Enter your company name.").max(160),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.union([z.email(), z.literal("")])),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(500),
  country: z.string().trim().min(2, "Enter your country.").max(80),
  base_currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z]{3}$/,
      "Use a three-letter currency code, such as USD or LKR.",
    )
    .refine(
      (value) => Intl.supportedValuesOf("currency").includes(value),
      "Choose a recognized currency code.",
    ),
  warehouse_name: z
    .string()
    .trim()
    .min(2, "Enter your warehouse name.")
    .max(100),
});
export const rolePermissionsSchema = z.object({
  role: z
    .enum(ROLES)
    .refine(
      (role) => role !== "administrator",
      "Administrator permissions are protected.",
    ),
  permissions: z
    .array(
      z.enum(
        Object.keys(PERMISSIONS) as [
          keyof typeof PERMISSIONS,
          ...(keyof typeof PERMISSIONS)[],
        ],
      ),
    )
    .refine(
      (permissions) =>
        !permissions.some((permission) =>
          ADMIN_PERMISSIONS.includes(permission),
        ),
      "Administration permissions are reserved for administrators.",
    ),
});
export type ActionState = { success: boolean; message: string };
export const INITIAL_STATE: ActionState = { success: false, message: "" };

// ---- Phase 2: suppliers, items, purchasing, receipts, adjustments ----------------
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.union([z.email("Enter a valid email address."), z.literal("")]));
const optionalText = (max: number) => z.string().trim().max(max);
const currency3 = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a three-letter currency code, such as USD.");
const numberField = z.preprocess(
  (value) =>
    value === "" || value == null || Number.isNaN(Number(value))
      ? undefined
      : Number(value),
  z.number().optional(),
);
const positiveNumber = (label: string) =>
  numberField.refine(
    (value): value is number => value !== undefined && value > 0,
    `${label} must be greater than zero.`,
  );
const nonNegativeNumber = numberField.refine(
  (value): value is number => value !== undefined && value >= 0,
  "Enter a number of zero or more.",
);
const dateField = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.");

export const supplierSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Enter the supplier name.").max(160),
  contact_person: optionalText(120),
  phone: optionalText(40),
  email: optionalEmail,
  address: optionalText(500),
  country: optionalText(80),
  tax_id: optionalText(60),
  payment_terms: optionalText(160),
  preferred_currency: optionalText(3),
  notes: optionalText(2000),
});
export const supplierIdSchema = z.object({
  id: z.uuid(),
  is_active: z.enum(["true", "false"]).transform((v) => v === "true"),
});
export const supplierPaymentSchema = z.object({
  supplier_id: z.uuid(),
  bank_name: optionalText(160),
  bank_account: optionalText(120),
  payment_notes: optionalText(1000),
});

export const itemSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Enter the item name.").max(160),
  category: z.enum(["raw_material", "finished_product"]),
  stock_unit: z
    .string()
    .trim()
    .min(1, "Enter a stock unit, such as kg or bag.")
    .max(20),
  reorder_level: nonNegativeNumber,
  net_weight_kg: numberField,
  packaging_spec: optionalText(200),
  notes: optionalText(2000),
});
export const itemIdSchema = z.object({
  id: z.uuid(),
  is_active: z.enum(["true", "false"]).transform((v) => v === "true"),
});
export const openingStockSchema = z.object({
  item_id: z.uuid(),
  quantity: positiveNumber("Quantity"),
  unit_cost: numberField,
  lot_number: optionalText(60),
});

const purchaseLineSchema = z.object({
  item_id: z.uuid(),
  quantity: positiveNumber("Quantity"),
  unit_price: nonNegativeNumber,
});
export const purchaseSchema = z.object({
  supplier_id: z.uuid(),
  currency: currency3,
  order_date: dateField,
  expected_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
    .or(z.literal("")),
  notes: optionalText(2000),
  lines: z.array(purchaseLineSchema).min(1, "Add at least one item line."),
});
const receiptLineSchema = z.object({
  purchase_line_id: z.uuid(),
  quantity: positiveNumber("Quantity"),
  lot_number: optionalText(60),
  unit_cost: numberField,
});
export const receiveSchema = z.object({
  purchase_id: z.uuid(),
  receipt_date: dateField,
  supplier_reference: optionalText(120),
  notes: optionalText(2000),
  lines: z.array(receiptLineSchema).min(1, "Add at least one received line."),
});
export const purchaseIdSchema = z.object({ id: z.uuid() });

export const adjustmentSchema = z.object({
  item_id: z.uuid(),
  lot_id: z.uuid(),
  direction: z.enum(["increase", "decrease"]),
  quantity: positiveNumber("Quantity"),
  reason: z
    .string()
    .trim()
    .min(3, "Give a short reason (at least 3 characters).")
    .max(500),
});
export const adjustmentDecisionSchema = z.object({
  id: z.uuid(),
  decision: z.enum(["approve", "reject"]),
});

// ---- Phase 3: production batches ----------------------------------------------
const batchInputLine = z.object({
  item_id: z.uuid(),
  lot_id: z.uuid(),
  quantity: positiveNumber("Input quantity"),
});
const batchOutputLine = z.object({
  item_id: z.uuid(),
  quantity: positiveNumber("Output quantity"),
  unit_cost: numberField,
});
const batchWastageLine = z.object({
  item_id: z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.uuid().optional(),
  ),
  quantity: positiveNumber("Wastage quantity"),
  unit: optionalText(20),
  reason: optionalText(200),
});
export const batchSchema = z.object({
  id: z.uuid().optional(),
  produced_on: dateField,
  notes: optionalText(2000),
  inputs: z.array(batchInputLine).min(1, "Add at least one input material."),
  outputs: z.array(batchOutputLine).min(1, "Add at least one output product."),
  wastage: z.array(batchWastageLine),
});
export const batchIdSchema = z.object({ id: z.uuid() });

// ---- Phase 4: buyers, exports, dispatch, finance -------------------------------
const optionalDate = dateField.or(z.literal(""));
const optionalUuid = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  z.uuid().optional(),
);

export const buyerSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Enter the buyer name.").max(160),
  contact_person: optionalText(120),
  phone: optionalText(40),
  email: optionalEmail,
  billing_address: optionalText(500),
  shipping_address: optionalText(500),
  destination_country: optionalText(80),
  tax_id: optionalText(60),
  payment_terms: optionalText(160),
  preferred_currency: optionalText(3),
  notes: optionalText(2000),
});
export const buyerIdSchema = z.object({
  id: z.uuid(),
  is_active: z.enum(["true", "false"]).transform((v) => v === "true"),
});

const exportOrderLineSchema = z.object({
  item_id: z.uuid(),
  quantity: positiveNumber("Quantity"),
  unit_price: nonNegativeNumber,
});
export const exportOrderSchema = z.object({
  buyer_id: z.uuid(),
  currency: currency3,
  incoterms: optionalText(40),
  destination_country: optionalText(80),
  order_date: dateField,
  requested_ship_date: optionalDate,
  notes: optionalText(2000),
  lines: z.array(exportOrderLineSchema).min(1, "Add at least one product line."),
});
export const exportOrderIdSchema = z.object({ id: z.uuid() });

const shipmentLineSchema = z.object({
  order_line_id: z.uuid(),
  lot_id: z.uuid(),
  quantity: positiveNumber("Shipment quantity"),
});
export const shipmentSchema = z.object({
  order_id: z.uuid(),
  container_number: optionalText(60),
  seal_number: optionalText(60),
  port_of_loading: optionalText(120),
  port_of_discharge: optionalText(120),
  vessel: optionalText(120),
  etd: optionalDate,
  eta: optionalDate,
  package_count: numberField,
  net_weight_kg: numberField,
  gross_weight_kg: numberField,
  bl_reference: optionalText(120),
  notes: optionalText(2000),
  lines: z.array(shipmentLineSchema).min(1, "Add at least one shipment line."),
});
export const shipmentIdSchema = z.object({ id: z.uuid() });
export const dispatchSchema = z.object({
  id: z.uuid(),
  dispatched_on: optionalDate,
});

const invoiceLineSchema = z.object({
  item_id: optionalUuid,
  description: z.string().trim().min(1, "Each invoice line needs a description.").max(200),
  quantity: positiveNumber("Invoice quantity"),
  unit_price: nonNegativeNumber,
});
export const invoiceSchema = z.object({
  shipment_id: z.uuid(),
  issue_date: dateField,
  due_date: optionalDate,
  currency: currency3,
  exchange_rate: numberField,
  discount: numberField,
  tax: numberField,
  notes: optionalText(2000),
  lines: z.array(invoiceLineSchema).min(1, "Add at least one invoice line."),
});

export const billSchema = z.object({
  supplier_id: z.uuid(),
  purchase_id: optionalUuid,
  issue_date: dateField,
  due_date: optionalDate,
  currency: currency3,
  exchange_rate: numberField,
  amount: positiveNumber("Bill amount"),
  description: optionalText(500),
  notes: optionalText(2000),
});

export const supplierPaymentRecordSchema = z.object({
  supplier_id: z.uuid(),
  currency: currency3,
  payment_date: dateField,
  amount: positiveNumber("Payment amount"),
  exchange_rate: numberField,
  method: optionalText(60),
  reference: optionalText(120),
  notes: optionalText(2000),
});
export const allocatePaymentSchema = z.object({
  payment_id: z.uuid(),
  bill_id: z.uuid(),
  amount: positiveNumber("Allocation amount"),
});
export const ledgerIdSchema = z.object({ id: z.uuid() });

export const buyerReceiptSchema = z.object({
  buyer_id: z.uuid(),
  currency: currency3,
  receipt_date: dateField,
  amount: positiveNumber("Receipt amount"),
  exchange_rate: numberField,
  method: optionalText(60),
  reference: optionalText(120),
  notes: optionalText(2000),
});
export const allocateReceiptSchema = z.object({
  receipt_id: z.uuid(),
  invoice_id: z.uuid(),
  amount: positiveNumber("Allocation amount"),
});
