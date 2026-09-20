// Earthheritance demo data seeder.
//
// Creates a small, clearly-labelled DEMO dataset that exercises the whole
// system: supplier -> purchase -> partial receipt -> production batch ->
// export order (FIFO reservation) -> shipment -> dispatch -> invoice ->
// buyer receipts (incl. an unapplied advance) -> supplier bill -> payments
// (incl. an unapplied advance). Every row is written through the same
// SECURITY DEFINER RPCs the web app uses, so the data respects all guards.
//
// Usage (PowerShell), from the repository root:
//   $env:SUPABASE_URL = "https:<project-ref>.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<service_role secret>"   # Dashboard > Settings > API
//   node scripts/seed-demo.mjs
//
// Options via environment:
//   DEMO_EMAIL     sign-in email for the demo administrator (default demo-admin@earthheritance.local)
//   DEMO_PASSWORD  password for that account (auto-generated and printed if omitted)
//
// Undo everything later (wipes ALL business rows but keeps staff accounts,
// roles, company settings, and warehouses):
//   $env:CONFIRM = "WIPE"
//   node scripts/seed-demo.mjs --cleanup
//
// NOTE: intended for demonstrations and trials. Do not run it against a
// project that already holds real company transactions.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.",
  );
  process.exit(1);
}
const email = process.env.DEMO_EMAIL ?? "demo-admin@earthheritance.local";
const password =
  process.env.DEMO_PASSWORD ??
  `Demo!${Math.random().toString(36).slice(2, 10)}#a1`;
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const isoDate = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

async function rpc(fn, args) {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  return data;
}
async function onlyId(table, column, value) {
  const { data, error } = await admin
    .from(table)
    .select("id")
    .eq(column, value)
    .limit(1);
  if (error || !data?.length)
    throw new Error(`Could not find a row in ${table} where ${column}=${value}`);
  return data[0].id;
}

// ---- cleanup mode -------------------------------------------------------------
if (process.argv.includes("--cleanup")) {
  if (process.env.CONFIRM !== "WIPE") {
    console.error(
      "Cleanup deletes every business record (except staff, settings, and warehouses).",
    );
    console.error("Re-run with CONFIRM=WIPE to proceed.");
    process.exit(1);
  }
  const tables = [
    "buyer_receipt_allocations",
    "supplier_payment_allocations",
    "buyer_receipts",
    "supplier_payments",
    "export_invoices",
    "supplier_bills",
    "shipment_lines",
    "shipments",
    "export_reservations",
    "export_order_lines",
    "export_orders",
    "buyers",
    "production_wastage",
    "production_outputs",
    "production_inputs",
    "production_batches",
    "goods_receipt_lines",
    "goods_receipts",
    "stock_adjustments",
    "stock_movements",
    "lots",
    "purchase_lines",
    "purchases",
    "supplier_payment_details",
    "suppliers",
    "items",
  ];
  for (const table of tables) {
    const { error } = await admin
      .from(table)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) console.error(`  ! ${table}: ${error.message}`);
    else console.log(`  cleared ${table}`);
  }
  console.log("Cleanup complete. Staff accounts and settings were kept.");
  process.exit(0);
}

// ---- seed mode ----------------------------------------------------------------
console.log("1/8 Preparing a demo administrator...");
let userId;
const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const existing = listed?.users?.find((u) => u.email === email);
if (existing) {
  userId = existing.id;
} else {
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Demo Administrator" },
  });
  if (error) throw new Error(`Could not create the demo user: ${error.message}`);
  userId = created.user.id;
}
// Guarantee the known password (covers re-runs against an existing demo user).
const { error: passwordError } = await admin.auth.admin.updateUserById(userId, {
  password,
  email_confirm: true,
});
if (passwordError)
  throw new Error(`Could not set the demo password: ${passwordError.message}`);
// The RPC guards read auth.uid(), so the writes below run under the demo
// user's own JWT (which maps to the authenticated database role). Bootstrap
// or elevation, however, must happen first, while we are still service_role.
const {
  data: existingProfiles,
  error: probeError,
} = await admin.from("profiles").select("id").limit(1);
if (probeError)
  throw new Error(`Could not inspect the project: ${probeError.message}`);
if ((existingProfiles ?? []).length === 0) {
  // Fresh project: use the audited one-time bootstrap RPC.
  const { error: bootstrapError } = await admin.rpc("app_bootstrap_admin", {
    user_id: userId,
    admin_name: "Demo Administrator",
  });
  if (bootstrapError)
    throw new Error(`Bootstrap failed: ${bootstrapError.message}`);
} else {
  // Already initialised: elevate the demo account directly (service role).
  const { error: upsertError } = await admin.from("profiles").upsert(
    { id: userId, email, full_name: "Demo Administrator", role: "administrator" },
    { onConflict: "id" },
  );
  if (upsertError)
    throw new Error(`Could not grant admin access: ${upsertError.message}`);
  console.log("   (project was already initialised; demo account elevated)");
}
const { error: signInError } = await admin.auth.signInWithPassword({
  email,
  password,
});
if (signInError)
  throw new Error(`Demo sign-in failed: ${signInError.message}`);

console.log("2/8 Supplier, catalogue, and a purchase order...");
const supplierId = await rpc("app_create_supplier", {
  p_name: "DEMO Husk Suppliers",
  p_contact_person: "Perera",
  p_phone: "+94 70 000 0000",
  p_email: "demo@example.com",
  p_address: "Colombo",
  p_country: "Sri Lanka",
  p_tax_id: "",
  p_payment_terms: "Net 30",
  p_preferred_currency: "USD",
  p_notes: "Demo record created by scripts/seed-demo.mjs",
});
const rawItemId = await rpc("app_create_item", {
  p_name: "DEMO coco pith",
  p_category: "raw_material",
  p_stock_unit: "kg",
  p_reorder_level: 500,
  p_net_weight_kg: null,
  p_packaging_spec: "",
  p_notes: "Demo record",
});
const finishedItemId = await rpc("app_create_item", {
  p_name: "DEMO cocopeat brick 650g",
  p_category: "finished_product",
  p_stock_unit: "piece",
  p_reorder_level: 0,
  p_net_weight_kg: 0.65,
  p_packaging_spec: "1000 pcs per pallet",
  p_notes: "Demo record",
});
const purchaseId = await rpc("app_create_purchase", {
  p_supplier_id: supplierId,
  p_currency: "USD",
  p_order_date: isoDate(-35),
  p_expected_date: null,
  p_notes: "Demo purchase of 1,000 kg raw pith",
  p_lines: [{ item_id: rawItemId, quantity: 1000, unit_price: 1 }],
});
await rpc("app_confirm_purchase", { p_id: purchaseId });

console.log("3/8 Goods receipt (partial: 800 of 1,000 kg)...");
const purchaseLineId = await onlyId("purchase_lines", "purchase_id", purchaseId);
await rpc("app_receive_goods", {
  p_purchase_id: purchaseId,
  p_receipt_date: isoDate(-30),
  p_supplier_reference: "DEMO-GRN-1",
  p_notes: "Demo receipt",
  p_lines: [
    { purchase_line_id: purchaseLineId, quantity: 800, lot_number: "DEMO-SRC-1" },
  ],
});

console.log("4/8 Production batch: 800 kg -> 500 bricks...");
const rawLotId = await onlyId("lots", "item_id", rawItemId);
const batchId = await rpc("app_create_batch", {
  p_produced_on: isoDate(-28),
  p_notes: "Demo batch",
  p_inputs: [{ item_id: rawItemId, lot_id: rawLotId, quantity: 800 }],
  p_outputs: [{ item_id: finishedItemId, quantity: 500, unit_cost: 2 }],
  p_wastage: [{ item_id: rawItemId, quantity: 250, unit: "kg", reason: "moisture loss (demo)" }],
});
await rpc("app_post_batch", { p_id: batchId });
const finishedLotId = await onlyId("lots", "item_id", finishedItemId);

console.log("5/8 Buyer, export order, and FIFO reservation...");
const buyerId = await rpc("app_create_buyer", {
  p_name: "DEMO Green Pot Trading BV",
  p_contact_person: "Jansen",
  p_phone: "+31 20 000 0000",
  p_email: "demo@example.com",
  p_billing_address: "Amsterdam, Netherlands",
  p_shipping_address: "Port of Antwerp",
  p_destination_country: "Netherlands",
  p_tax_id: "DEMO-VAT-001",
  p_payment_terms: "Net 30",
  p_preferred_currency: "USD",
  p_notes: "Demo record created by scripts/seed-demo.mjs",
});
const orderId = await rpc("app_create_export_order", {
  p_buyer_id: buyerId,
  p_currency: "USD",
  p_incoterms: "FOB",
  p_destination_country: "Netherlands",
  p_order_date: isoDate(-25),
  p_requested_ship_date: isoDate(-10),
  p_notes: "Demo order: 300 bricks @ 2.50",
  p_lines: [{ item_id: finishedItemId, quantity: 300, unit_price: 2.5 }],
});
await rpc("app_confirm_export_order", { p_id: orderId });

console.log("6/8 Shipment of 200 pcs, ready and dispatched...");
const orderLineId = await onlyId("export_order_lines", "order_id", orderId);
const shipmentId = await rpc("app_create_shipment", {
  p_order_id: orderId,
  p_container_number: "DEMOU1234567",
  p_seal_number: "DEMO-SEAL-1",
  p_port_of_loading: "Colombo",
  p_port_of_discharge: "Antwerp",
  p_vessel: "MV Demo Carrier",
  p_etd: null,
  p_eta: null,
  p_package_count: 200,
  p_net_weight_kg: 130,
  p_gross_weight_kg: 145,
  p_bl_reference: "DEMO-BL-1",
  p_notes: "Demo shipment",
  p_lines: [{ order_line_id: orderLineId, lot_id: finishedLotId, quantity: 200 }],
});
await rpc("app_mark_shipment_ready", { p_id: shipmentId });
await rpc("app_dispatch_shipment", { p_id: shipmentId, p_dispatched_on: isoDate(-21) });

console.log("7/8 Invoice, buyer receipts (incl. an advance)...");
const invoiceId = await rpc("app_create_invoice", {
  p_shipment_id: shipmentId,
  p_issue_date: isoDate(-20),
  p_due_date: isoDate(-2),
  p_currency: "USD",
  p_exchange_rate: null,
  p_discount: 0,
  p_tax: 0,
  p_notes: "Demo invoice for 200 dispatched bricks",
  p_lines: [{ description: "Cocopeat bricks 650g x200", quantity: 200, unit_price: 2.5 }],
});
await rpc("app_record_buyer_receipt", {
  p_buyer_id: buyerId,
  p_currency: "USD",
  p_receipt_date: isoDate(-5),
  p_amount: 150,
  p_exchange_rate: null,
  p_method: "Bank transfer",
  p_reference: "DEMO-ADV-IN",
  p_notes: "Demo advance, not yet allocated",
});
const receiptId = await rpc("app_record_buyer_receipt", {
  p_buyer_id: buyerId,
  p_currency: "USD",
  p_receipt_date: isoDate(-4),
  p_amount: 100,
  p_exchange_rate: null,
  p_method: "Bank transfer",
  p_reference: "DEMO-RCPT-1",
  p_notes: "Demo part-payment on the invoice",
});
await rpc("app_allocate_receipt", {
  p_receipt_id: receiptId,
  p_invoice_id: invoiceId,
  p_amount: 100,
});

console.log("8/8 Supplier bill, payments (incl. an advance)...");
const billId = await rpc("app_create_bill", {
  p_supplier_id: supplierId,
  p_purchase_id: purchaseId,
  p_issue_date: isoDate(-15),
  p_due_date: isoDate(30),
  p_currency: "USD",
  p_exchange_rate: null,
  p_amount: 800,
  p_description: "Demo bill for 800 kg delivered pith",
  p_notes: "Demo record",
});
await rpc("app_record_supplier_payment", {
  p_supplier_id: supplierId,
  p_currency: "USD",
  p_payment_date: isoDate(-3),
  p_amount: 100,
  p_exchange_rate: null,
  p_method: "Bank transfer",
  p_reference: "DEMO-ADV-OUT",
  p_notes: "Demo advance to supplier, not yet allocated",
});
const paymentId = await rpc("app_record_supplier_payment", {
  p_supplier_id: supplierId,
  p_currency: "USD",
  p_payment_date: isoDate(-2),
  p_amount: 500,
  p_exchange_rate: null,
  p_method: "Bank transfer",
  p_reference: "DEMO-PAY-1",
  p_notes: "Demo payment against the bill",
});
await rpc("app_allocate_payment", {
  p_payment_id: paymentId,
  p_bill_id: billId,
  p_amount: 500,
});

console.log("\nDemo data is ready. Sign in to the app with:");
console.log(`  email:    ${email}`);
console.log(`  password: ${password}`);
console.log("\nYou should now see stock, an overdue partially-paid invoice,");
console.log("unapplied advances on both sides, and populated reports.");
console.log("Remove everything later with: CONFIRM=WIPE node scripts/seed-demo.mjs --cleanup");
