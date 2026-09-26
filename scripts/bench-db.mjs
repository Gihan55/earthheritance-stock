// Database-layer performance probe for the Earthheritance workspace.
//
// It boots an in-process PGlite copy of the schema (all 9 migrations + a mock
// auth role setup, exactly like the integration tests), seeds a realistic
// production data volume, runs ANALYZE so the planner has statistics, and then
// times the queries the live pages issue on every request.
//
//   node scripts/bench-db.mjs            # default volume
//   node scripts/bench-db.mjs --rows=big # heavier stress
//
// NOTE: PGlite measures pure Postgres execution + planning latency; it does
// NOT include the network round-trip the deployed app pays per Supabase query.
// A page that awaits several of these sequentially therefore costs roughly
// (sum of local latency) + (count x network RTT) on the live site. Read the
// "requests" column: pages that fan out to many queries are the slowness risk.

import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";

const BIG = process.argv.includes("--rows=big");

// Dimension + fact row counts.
const V = BIG
  ? { suppliers: 80, rawItems: 60, finItems: 100, lots: 8000, purchases: 8000,
      poLines: 20000, receipts: 7000, recLines: 18000, movements: 260000,
      buyers: 120, orders: 6000, orderLines: 18000, reservations: 12000,
      shipments: 6000, shipLines: 18000, invoices: 5000, invoiceLines: 14000,
      bills: 6000, payments: 5600, payAlloc: 8000, receiptsLed: 5200,
      recAlloc: 8000, batches: 4000, inputs: 8000, outputs: 4400 }
  : { suppliers: 40, rawItems: 30, finItems: 40, lots: 4000, purchases: 4000,
      poLines: 10000, receipts: 3500, recLines: 9000, movements: 120000,
      buyers: 60, orders: 3000, orderLines: 9000, reservations: 6000,
      shipments: 3000, shipLines: 9000, invoices: 2500, invoiceLines: 7000,
      bills: 3000, payments: 2800, payAlloc: 4000, receiptsLed: 2600,
      recAlloc: 4000, batches: 2000, inputs: 4000, outputs: 2200 };

const adminId = "22222222-2222-4222-8222-000000000001";

async function boot() {
  const db = new PGlite();
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
  const migrations = [
    "0001_foundation", "0002_suppliers_stock", "0003_production",
    "0004_exports_finance", "0005_reporting", "0006_performance",
    "0007_register_references", "0008_documents", "0009_staff_password_audit",
    "0010_rls_plan_stability",
  ];
  for (const m of migrations)
    await db.exec(
      await readFile(new URL(`../supabase/migrations/${m}.sql`, import.meta.url), "utf8"),
    );
  return db;
}

async function seed(db) {
  // Company + warehouse + the six staff identities (administrator drives views).
  await db.exec(`
    insert into auth.users(id, email) values
      ('${adminId}', 'admin@example.com');
    insert into public.profiles(id, email, full_name, role)
      values ('${adminId}', 'admin@example.com', 'Bench Admin', 'administrator');
    insert into public.company_settings(id, name, country, base_currency, warehouse_name)
      values (true, 'Bench Cocopits', 'LK', 'USD', 'Main Store');
    insert into public.warehouses(name) select 'Bay '||g from generate_series(1,4) g;
  `);

  await db.exec(`
    insert into public.suppliers(code, name, preferred_currency)
      select 'SUP-'||lpad(g::text,5,'0'), 'Supplier '||g, 'LKR'
      from generate_series(1, ${V.suppliers}) g;
    insert into public.items(code, name, category, stock_unit, reorder_level)
      select 'RAW-'||lpad(g::text,4,'0'), 'Cocopeat Raw '||g, 'raw_material', 'kg', 500
      from generate_series(1, ${V.rawItems}) g;
    insert into public.items(code, name, category, stock_unit, reorder_level)
      select 'FIN-'||lpad(g::text,4,'0'), 'Block Finished '||g, 'finished_product', 'pcs', 200
      from generate_series(1, ${V.finItems}) g;
    insert into public.buyers(code, name, preferred_currency)
      select 'BUY-'||lpad(g::text,4,'0'), 'Buyer '||g, 'USD'
      from generate_series(1, ${V.buyers}) g;
  `);

  // Lots: every lot belongs to a random item and (for raw) a supplier.
  await db.exec(`
    with it as (select array_agg(id) a from public.items),
         su as (select array_agg(id) a from public.suppliers)
    insert into public.lots(item_id, lot_number, supplier_id, source_type)
    select (select a from it)[1 + g % (select cardinality(a) from it)],
           'LOT-'||lpad(g::text,7,'0'),
           (select a from su)[1 + g % (select cardinality(a) from su)],
           'purchase'
    from generate_series(1, ${V.lots}) g;
  `);

  // Purchases + lines.
  await db.exec(`
    with su as (select array_agg(id) a from public.suppliers)
    insert into public.purchases(code, supplier_id, status, currency, order_date)
    select 'PO-'||lpad(g::text,6,'0'),
           (select a from su)[1 + g % (select cardinality(a) from su)],
           'received', 'LKR', current_date - (g % 720)
    from generate_series(1, ${V.purchases}) g;
  `);
  await db.exec(`
    with po as (select array_agg(id) a from public.purchases),
         raw as (select array_agg(id) a from public.items where category='raw_material')
    insert into public.purchase_lines(purchase_id, item_id, quantity, unit_price, received_quantity)
    select (select a from po)[1 + g % (select cardinality(a) from po)],
           (select a from raw)[1 + g % (select cardinality(a) from raw)],
           100 + (g % 900), 12 + (g % 40)::numeric/4, 100 + (g % 900)
    from generate_series(1, ${V.poLines}) g;
  `);

  // Goods receipts + lines (reference purchase lines).
  await db.exec(`
    with po as (select array_agg(id) a from public.purchases),
         su as (select array_agg(supplier_id) a from public.purchases)
    insert into public.goods_receipts(code, purchase_id, supplier_id, receipt_date)
    select 'GR-'||lpad(g::text,6,'0'),
           (select a from po)[1 + g % (select cardinality(a) from po)],
           (select a from su)[1 + g % (select cardinality(a) from su)],
           current_date - (g % 700)
    from generate_series(1, ${V.receipts}) g;
  `);
  await db.exec(`
    with gr as (select array_agg(id) a from public.goods_receipts),
         pl as (select array_agg(id) a from public.purchase_lines),
         it as (select array_agg(item_id) a from public.purchase_lines),
         lo as (select array_agg(id) a from public.lots)
    insert into public.goods_receipt_lines(receipt_id, purchase_line_id, item_id, lot_id, quantity, unit_cost)
    select (select a from gr)[1 + g % (select cardinality(a) from gr)],
           (select a from pl)[1 + g % (select cardinality(a) from pl)],
           (select a from it)[1 + g % (select cardinality(a) from it)],
           (select a from lo)[1 + g % (select cardinality(a) from lo)],
           50 + (g % 500), 10 + (g % 30)::numeric/4
    from generate_series(1, ${V.recLines}) g;
  `);

  // Stock movements: the single largest hot table.
  await db.exec(`
    with it as (select array_agg(id) a from public.items),
         wh as (select array_agg(id) a from public.warehouses),
         lo as (select array_agg(id) a from public.lots)
    insert into public.stock_movements(item_id, warehouse_id, lot_id, movement_type, quantity_delta, unit_cost, reference, source_type, created_by, created_at)
    select (select a from it)[1 + g % (select cardinality(a) from it)],
           (select a from wh)[1 + g % (select cardinality(a) from wh)],
           (select a from lo)[1 + g % (select cardinality(a) from lo)],
           (array['receipt','production_consumption','production_output','dispatch']::public.movement_type[])[1 + g % 4],
           case when g % 3 = 0 then -(1 + g % 50)::numeric else (1 + g % 60)::numeric end,
           8 + (g % 20)::numeric/4,
           'REF-'||g, 'bench', '${adminId}',
           now() - (g % 720) * interval '1 day'
    from generate_series(1, ${V.movements}) g;
  `);

  // Export orders + lines + reservations.
  await db.exec(`
    with bu as (select array_agg(id) a from public.buyers)
    insert into public.export_orders(code, buyer_id, status, currency, destination_country, order_date)
    select 'EO-'||lpad(g::text,6,'0'),
           (select a from bu)[1 + g % (select cardinality(a) from bu)],
           'shipped', 'USD', 'Germany', current_date - (g % 500)
    from generate_series(1, ${V.orders}) g;
  `);
  await db.exec(`
    with eo as (select array_agg(id) a from public.export_orders),
         fin as (select array_agg(id) a from public.items where category='finished_product')
    insert into public.export_order_lines(order_id, item_id, quantity, unit_price, shipped_quantity)
    select (select a from eo)[1 + g % (select cardinality(a) from eo)],
           (select a from fin)[1 + g % (select cardinality(a) from fin)],
           500 + (g % 5000), 2 + (g % 30)::numeric/10, 500 + (g % 5000)
    from generate_series(1, ${V.orderLines}) g;
  `);
  await db.exec(`
    with ol as (select array_agg(id) a from public.export_order_lines),
         eo as (select array_agg(order_id) a from public.export_order_lines),
         it as (select array_agg(item_id) a from public.export_order_lines),
         lo as (select array_agg(id) a from public.lots)
    insert into public.export_reservations(order_id, order_line_id, item_id, lot_id, quantity)
    select (select a from eo)[1 + g % (select cardinality(a) from eo)],
           (select a from ol)[1 + g % (select cardinality(a) from ol)],
           (select a from it)[1 + g % (select cardinality(a) from it)],
           (select a from lo)[1 + g % (select cardinality(a) from lo)],
           10 + (g % 200)
    from generate_series(1, ${V.reservations}) g;
  `);

  // Shipments + lines.
  await db.exec(`
    with eo as (select array_agg(id) a from public.export_orders),
         bu as (select array_agg(buyer_id) a from public.export_orders)
    insert into public.shipments(code, order_id, buyer_id, status, etd, dispatched_on)
    select 'SH-'||lpad(g::text,6,'0'),
           (select a from eo)[1 + g % (select cardinality(a) from eo)],
           (select a from bu)[1 + g % (select cardinality(a) from bu)],
           'delivered', current_date - (g % 400), current_date - (g % 380)
    from generate_series(1, ${V.shipments}) g;
  `);
  await db.exec(`
    with sh as (select array_agg(id) a from public.shipments),
         ol as (select array_agg(id) a from public.export_order_lines),
         it as (select array_agg(item_id) a from public.export_order_lines),
         lo as (select array_agg(id) a from public.lots)
    insert into public.shipment_lines(shipment_id, order_line_id, item_id, lot_id, quantity)
    select (select a from sh)[1 + g % (select cardinality(a) from sh)],
           (select a from ol)[1 + g % (select cardinality(a) from ol)],
           (select a from it)[1 + g % (select cardinality(a) from it)],
           (select a from lo)[1 + g % (select cardinality(a) from lo)],
           100 + (g % 1000)
    from generate_series(1, ${V.shipLines}) g;
  `);

  // Invoices + lines.
  await db.exec(`
    with eo as (select array_agg(id) a from public.export_orders),
         bu as (select array_agg(buyer_id) a from public.export_orders),
         sh as (select array_agg(id) a from public.shipments)
    insert into public.export_invoices(code, order_id, shipment_id, buyer_id, currency, issue_date, due_date, amount)
    select 'INV-'||lpad(g::text,6,'0'),
           (select a from eo)[1 + g % (select cardinality(a) from eo)],
           (select a from sh)[1 + g % (select cardinality(a) from sh)],
           (select a from bu)[1 + g % (select cardinality(a) from bu)],
           'USD', current_date - (g % 400), current_date - (g % 400) + 45,
           (1000 + (g % 50) * 100)::numeric
    from generate_series(1, ${V.invoices}) g;
  `);
  await db.exec(`
    with iv as (select array_agg(id) a from public.export_invoices)
    insert into public.export_invoice_lines(invoice_id, description, quantity, unit_price, amount)
    select (select a from iv)[1 + g % (select cardinality(a) from iv)],
           'Cocopeat line '||g, 10 + (g % 200), 3 + (g % 20)::numeric/10,
           (30 + (g % 200))::numeric
    from generate_series(1, ${V.invoiceLines}) g;
  `);

  // Supplier bills.
  await db.exec(`
    with su as (select array_agg(id) a from public.suppliers),
         po as (select array_agg(id) a from public.purchases)
    insert into public.supplier_bills(code, supplier_id, purchase_id, currency, issue_date, due_date, amount)
    select 'BILL-'||lpad(g::text,6,'0'),
           (select a from su)[1 + g % (select cardinality(a) from su)],
           (select a from po)[1 + g % (select cardinality(a) from po)],
           'LKR', current_date - (g % 400), current_date - (g % 400) + 30,
           (5000 + (g % 100) * 250)::numeric
    from generate_series(1, ${V.bills}) g;
  `);

  // Supplier payments + allocations.
  await db.exec(`
    with su as (select array_agg(id) a from public.suppliers)
    insert into public.supplier_payments(code, supplier_id, currency, payment_date, amount, method, reference)
    select 'PAY-'||lpad(g::text,6,'0'),
           (select a from su)[1 + g % (select cardinality(a) from su)],
           'LKR', current_date - (g % 400), (5000 + (g % 100) * 250)::numeric, 'bank', 'REF-'||g
    from generate_series(1, ${V.payments}) g;
  `);
  await db.exec(`
    with py as (select array_agg(id) a from public.supplier_payments),
         bl as (select array_agg(id) a from public.supplier_bills)
    insert into public.supplier_payment_allocations(payment_id, bill_id, amount)
    select (select a from py)[1 + g % (select cardinality(a) from py)],
           (select a from bl)[1 + g % (select cardinality(a) from bl)],
           (1000 + (g % 50) * 100)::numeric
    from generate_series(1, ${V.payAlloc}) g;
  `);

  // Buyer receipts + allocations.
  await db.exec(`
    with bu as (select array_agg(id) a from public.buyers)
    insert into public.buyer_receipts(code, buyer_id, currency, receipt_date, amount, method, reference)
    select 'RCP-'||lpad(g::text,6,'0'),
           (select a from bu)[1 + g % (select cardinality(a) from bu)],
           'USD', current_date - (g % 400), (2000 + (g % 60) * 150)::numeric, 'tt', 'REF-'||g
    from generate_series(1, ${V.receiptsLed}) g;
  `);
  await db.exec(`
    with rc as (select array_agg(id) a from public.buyer_receipts),
         iv as (select array_agg(id) a from public.export_invoices)
    insert into public.buyer_receipt_allocations(receipt_id, invoice_id, amount)
    select (select a from rc)[1 + g % (select cardinality(a) from rc)],
           (select a from iv)[1 + g % (select cardinality(a) from iv)],
           (1000 + (g % 40) * 120)::numeric
    from generate_series(1, ${V.recAlloc}) g;
  `);

  // Production batches + inputs + outputs.
  await db.exec(`
    insert into public.production_batches(code, status, produced_on, posted_at)
    select 'BATCH-'||lpad(g::text,6,'0'), 'posted',
           current_date - (g % 500), now() - (g % 500) * interval '1 day'
    from generate_series(1, ${V.batches}) g;
  `);
  await db.exec(`
    with ba as (select array_agg(id) a from public.production_batches),
         raw as (select array_agg(id) a from public.items where category='raw_material'),
         lo as (select array_agg(id) a from public.lots)
    insert into public.production_inputs(batch_id, item_id, lot_id, quantity)
    select (select a from ba)[1 + g % (select cardinality(a) from ba)],
           (select a from raw)[1 + g % (select cardinality(a) from raw)],
           (select a from lo)[1 + g % (select cardinality(a) from lo)],
           50 + (g % 500)
    from generate_series(1, ${V.inputs}) g;
  `);
  await db.exec(`
    with ba as (select array_agg(id) a from public.production_batches),
         fin as (select array_agg(id) a from public.items where category='finished_product'),
         lo as (select array_agg(id) a from public.lots)
    insert into public.production_outputs(batch_id, item_id, lot_id, quantity, unit_cost)
    select (select a from ba)[1 + g % (select cardinality(a) from ba)],
           (select a from fin)[1 + g % (select cardinality(a) from fin)],
           (select a from lo)[1 + g % (select cardinality(a) from lo)],
           40 + (g % 400), 15 + (g % 20)::numeric/4
    from generate_series(1, ${V.outputs}) g;
  `);

  await db.exec("analyze");
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function timeQuery(db, label, requestCost, sql, params = [], iters = 7) {
  // Warm-up (populate plan cache), then timed runs.
  await db.query(sql, params);
  const times = [];
  let rowCount = 0;
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    const res = await db.query(sql, params);
    times.push(performance.now() - t0);
    rowCount = res.rows?.length ?? 0;
  }
  return { label, requestCost, ms: median(times), min: Math.min(...times), rowCount };
}

async function main() {
  console.log(`\nEarthheritance DB probe  (volume=${BIG ? "big" : "default"})`);
  const t0 = performance.now();
  const db = await boot();
  await seed(db);
  console.log(`Seed + analyze: ${((performance.now() - t0) / 1000).toFixed(1)}s\n`);

  // Run timed queries as an authenticated administrator so RLS policies apply
  // exactly as they do on the live server (which uses the user-scoped client).
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [adminId]);

  if (process.argv.includes("--explain")) {
    const plans = {
      "stock_balances (sum movements grouped by item)":
        "explain (analyze, buffers) select i.id, coalesce(sum(m.quantity_delta),0) from public.items i left join public.stock_movements m on m.item_id = i.id group by i.id",
      "stock_lot_balances (sum movements grouped by lot)":
        "explain (analyze, buffers) select l.id, coalesce(sum(m.quantity_delta),0) from public.lots l left join public.stock_movements m on m.lot_id = l.id group by l.id",
      "export_order_progress (order x lines x reservations)":
        "explain (analyze, buffers) select * from public.export_order_progress",
    };
    for (const [label, sql] of Object.entries(plans)) {
      console.log(`\n===== ${label} =====`);
      const res = await db.query(sql);
      console.log(res.rows.map((r) => r["QUERY PLAN"] ?? Object.values(r)[0]).join("\n"));
    }
    await db.close();
    return;
  }

  const results = [];
  const run = async (label, requests, sql, params) =>
    results.push(await timeQuery(db, label, requests, sql, params));

  // Overview page (getStockTotals, getProductionTotals, getExportTotals,
  // getPayablesTotals, getReceivablesTotals + getCompany + getStaff + getAuditEvents).
  await run("Overview · stock_balances (whole-table count)", 1,
    "select item_id,category,on_hand,is_low from public.stock_balances");
  await run("Overview · production_batches (whole-table count)", 1,
    "select id,status from public.production_batches");
  await run("Overview · export_order_progress", 1,
    "select order_id,status from public.export_order_progress");
  await run("Overview · supplier_bill_balances", 1,
    "select id,payment_state,outstanding,currency from public.supplier_bill_balances");
  await run("Overview · export_invoice_balances", 1,
    "select id,payment_state from public.export_invoice_balances");
  await run("Overview · audit_events (limit 30)", 1,
    "select id,action,target,created_at from public.audit_events order by created_at desc limit 30");

  // List / register pages.
  await run("Inventory · lot balances", 1,
    "select * from public.stock_lot_balances order by on_hand desc");
  await run("Purchasing · purchases + line aggregate", 1,
    "select p.id,p.code,p.status,p.currency,p.order_date from public.purchases p order by p.created_at desc limit 100");
  await run("Finance · supplier payments register", 1,
    "select * from public.supplier_payment_balances order by payment_date desc");
  await run("Finance · buyer receipts register", 1,
    "select * from public.buyer_receipt_balances order by receipt_date desc");
  await run("Exports · orders by status", 1,
    "select * from public.export_order_progress order by order_date desc limit 200");

  // Reports page (fan-out of all these in one request).
  await run("Reports · production_summary", 1,
    "select * from public.production_summary");
  await run("Reports · export_sales_lines", 1,
    "select * from public.export_sales_lines");
  await run("Reports · shipment_schedule", 1,
    "select * from public.shipment_schedule");
  await run("Reports · overdue_documents", 1,
    "select * from public.overdue_documents");
  await run("Reports · unapplied_balances", 1,
    "select * from public.unapplied_balances");
  await run("Statement · supplier_allocation_ledger (per supplier)", 1,
    `select * from public.supplier_allocation_ledger where supplier_id =
       (select id from public.suppliers limit 1)`);
  await run("Statement · buyer_allocation_ledger (per buyer)", 1,
    `select * from public.buyer_allocation_ledger where buyer_id =
       (select id from public.buyers limit 1)`);

  // Print report.
  const pad = (s, n) => String(s).padEnd(n);
  const padL = (s, n) => String(s).padStart(n);
  console.log(pad("QUERY", 52) + padL("median ms", 10) + padL("min ms", 9) + padL("rows", 10));
  console.log("-".repeat(81));
  for (const r of results.sort((a, b) => b.ms - a.ms)) {
    const flag = r.ms > 60 ? "  << slow" : "";
    console.log(
      pad(r.label, 52) + padL(r.ms.toFixed(1), 10) +
      padL(r.min.toFixed(1), 9) + padL(r.rowCount, 10) + flag,
    );
  }
  const total = results.reduce((s, r) => s + r.ms, 0);
  console.log("-".repeat(81));
  console.log(`Sum of one-shot latencies (all queries): ${total.toFixed(0)} ms local`);
  console.log(`Overview page: 5 balance queries awaited SEQUENTIALLY in page.tsx.`);
  console.log(`Reports page:  ~12 queries via Promise.all (parallel) -> ~max not sum.`);
  console.log(`Live-site note: each query adds a Supabase network RTT (~20-80ms),`);
  console.log(`so serialized awaits cost (RTT x query count) on top of these times.`);

  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
