import "server-only";
import { createServerSupabase } from "./supabase/server";
import { getActor, requirePermission } from "./workspace";
import type { Permission } from "./permissions";

export type Supplier = {
  id: string;
  code: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  country: string;
  preferred_currency: string;
  payment_terms: string;
  is_active: boolean;
  created_at: string;
};
export type SupplierPaymentDetails = {
  bank_name: string;
  bank_account: string;
  payment_notes: string;
};
export type SupplierHistoryRow = {
  id: string;
  code: string;
  order_date: string;
  status: string;
  currency: string;
};
// Per-party aggregates for supplier/buyer profiles. Amounts are never summed
// across currencies; one row per currency keeps the totals honest.
export type PartyCurrencyTotals = {
  currency: string;
  billed: string;
  paid: string;
  unapplied: string;
  outstanding: string;
};
export type PartyItemTotals = {
  item_id: string;
  name: string;
  code: string;
  stock_unit: string;
  ordered_quantity: string;
  delivered_quantity: string;
};
export type SupplierDetail = {
  supplier: Supplier & {
    address: string;
    tax_id: string;
    notes: string;
  };
  paymentDetails: SupplierPaymentDetails | null;
  purchases: SupplierHistoryRow[];
  suppliedItems: { item_id: string; name: string; code: string }[];
  totals: PartyCurrencyTotals[];
  itemTotals: PartyItemTotals[];
};
export type CatalogItem = {
  id: string;
  code: string;
  name: string;
  category: "raw_material" | "finished_product";
  stock_unit: string;
  reorder_level: string;
  net_weight_kg: string | null;
  packaging_spec: string;
  notes: string;
  is_active: boolean;
};
export type StockBalance = {
  item_id: string;
  code: string;
  name: string;
  category: string;
  stock_unit: string;
  reorder_level: string;
  on_hand: string;
  reserved: string;
  available: string;
  is_low: boolean;
  is_active: boolean;
};
export type MovementRow = {
  id: string;
  item_code: string;
  item_name: string;
  stock_unit: string;
  lot_number: string | null;
  movement_type: string;
  quantity_delta: string;
  reference: string;
  created_at: string;
  created_by_name: string | null;
};
export type LotOption = {
  lot_id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  stock_unit: string;
  lot_number: string;
  on_hand: string;
};
export type PurchaseRow = {
  id: string;
  code: string;
  status: string;
  currency: string;
  order_date: string;
  expected_date: string | null;
  supplier: { name: string; code: string } | null;
  lines: { quantity: string; unit_price: string }[];
};
export type PurchaseLineRow = {
  id: string;
  quantity: string;
  unit_price: string;
  received_quantity: string;
  notes: string;
  item: { name: string; code: string; stock_unit: string } | null;
};
export type ReceiptLineRow = {
  quantity: string;
  lot_id: string | null;
  item: { name: string; code: string; stock_unit: string } | null;
};
export type ReceiptRow = {
  id: string;
  code: string;
  receipt_date: string;
  supplier_reference: string;
  goods_receipt_lines: ReceiptLineRow[];
};
export type PurchaseDetail = {
  purchase: {
    id: string;
    code: string;
    status: string;
    currency: string;
    order_date: string;
    expected_date: string | null;
    notes: string;
    supplier: { name: string; code: string; id: string } | null;
  };
  lines: PurchaseLineRow[];
  receipts: ReceiptRow[];
};
export type AdjustmentRow = {
  id: string;
  code: string;
  direction: "increase" | "decrease";
  quantity: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  item: { name: string; code: string; stock_unit: string } | null;
  lot: { lot_number: string } | null;
  requested_by: { full_name: string } | null;
  decided_by: { full_name: string } | null;
};
export type BatchRow = {
  id: string;
  code: string;
  status: "draft" | "posted" | "reversed";
  produced_on: string;
  notes: string;
  created_at: string;
  production_inputs: { id: string }[];
  production_outputs: { id: string }[];
};
export type BatchInputLine = {
  id: string;
  item_id: string;
  lot_id: string;
  quantity: string;
  lot: {
    lot_number: string;
    item: { name: string; code: string; stock_unit: string } | null;
  } | null;
};
export type BatchOutputLine = {
  id: string;
  item_id: string;
  quantity: string;
  unit_cost: string | null;
  lot: { lot_number: string } | null;
  item: { name: string; code: string; stock_unit: string } | null;
};
export type BatchWastageLine = {
  id: string;
  item_id: string | null;
  quantity: string;
  unit: string;
  reason: string;
  item: { name: string } | null;
};
export type BatchDetail = {
  batch: {
    id: string;
    code: string;
    status: "draft" | "posted" | "reversed";
    produced_on: string;
    notes: string;
    posted_by_name: string | null;
    posted_at: string | null;
  };
  inputs: BatchInputLine[];
  outputs: BatchOutputLine[];
  wastage: BatchWastageLine[];
};

async function session() {
  const actor = await getActor();
  if (!actor) return null;
  return { db: await createServerSupabase(), actor };
}
async function guard(permission: Permission) {
  const actor = await requirePermission(permission);
  if (actor.preview) return null;
  return { db: await createServerSupabase(), actor };
}

function sumByCurrency(
  documents: {
    currency: string;
    amount: string | number;
    outstanding: string | number;
  }[],
  payments: {
    currency: string;
    amount: string | number;
    unapplied: string | number;
    status: string;
  }[],
): PartyCurrencyTotals[] {
  const map = new Map<string, PartyCurrencyTotals>();
  const entry = (currency: string) => {
    let row = map.get(currency);
    if (!row) {
      row = {
        currency,
        billed: "0",
        paid: "0",
        unapplied: "0",
        outstanding: "0",
      };
      map.set(currency, row);
    }
    return row;
  };
  for (const doc of documents) {
    const row = entry(doc.currency);
    row.billed = String(Number(row.billed) + Number(doc.amount));
    row.outstanding = String(Number(row.outstanding) + Number(doc.outstanding));
  }
  for (const payment of payments) {
    if (payment.status !== "recorded") continue;
    const row = entry(payment.currency);
    row.paid = String(Number(row.paid) + Number(payment.amount));
    row.unapplied = String(Number(row.unapplied) + Number(payment.unapplied));
  }
  return [...map.values()];
}

function aggregateItemTotals(
  lines: {
    item_id: string;
    ordered: string | number;
    delivered: string | number;
  }[],
  items: { id: string; name: string; code: string; stock_unit: string }[],
): PartyItemTotals[] {
  const map = new Map<string, { ordered: number; delivered: number }>();
  for (const line of lines) {
    const row = map.get(line.item_id) ?? { ordered: 0, delivered: 0 };
    row.ordered += Number(line.ordered);
    row.delivered += Number(line.delivered);
    map.set(line.item_id, row);
  }
  return [...map.entries()]
    .map(([item_id, totals]) => {
      const item = items.find((candidate) => candidate.id === item_id);
      return {
        item_id,
        name: item?.name ?? "Unknown item",
        code: item?.code ?? "",
        stock_unit: item?.stock_unit ?? "",
        ordered_quantity: String(totals.ordered),
        delivered_quantity: String(totals.delivered),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listSuppliers(): Promise<Supplier[]> {
  const ctx = await guard("suppliers.view");
  if (!ctx) return [];
  const { data, error } = await ctx.db
    .from("suppliers")
    .select(
      "id,code,name,contact_person,phone,email,country,preferred_currency,payment_terms,is_active,created_at",
    )
    .order("is_active", { ascending: false })
    .order("name");
  if (error) throw new Error("Suppliers could not be loaded.");
  return data as Supplier[];
}
export async function getSupplierDetail(
  id: string,
): Promise<SupplierDetail | null> {
  const ctx = await guard("suppliers.view");
  if (!ctx) return null;
  const { data: supplier, error } = await ctx.db
    .from("suppliers")
    .select(
      "id,code,name,contact_person,phone,email,address,country,tax_id,payment_terms,preferred_currency,notes,is_active,created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !supplier) return null;
  const [payment, purchases, lots] = await Promise.all([
    ctx.actor.permissions.includes("finance.view")
      ? ctx.db
          .from("supplier_payment_details")
          .select("bank_name,bank_account,payment_notes")
          .eq("supplier_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.db
      .from("purchases")
      .select("id,code,order_date,status,currency")
      .eq("supplier_id", id)
      .order("order_date", { ascending: false })
      .limit(20),
    ctx.db
      .from("lots")
      .select("item_id, item:items(name, code)")
      .eq("supplier_id", id),
  ]);
  const suppliedMap = new Map<
    string,
    { item_id: string; name: string; code: string }
  >();
  const lotRows = (lots.data ?? []) as unknown as {
    item_id: string;
    item:
      { name: string; code: string } | { name: string; code: string }[] | null;
  }[];
  for (const row of lotRows) {
    const item = Array.isArray(row.item) ? row.item[0] : row.item;
    if (item) suppliedMap.set(row.item_id, { item_id: row.item_id, ...item });
  }
  // Quantity totals across every purchase order for this supplier.
  const { data: purchaseIdRows } = await ctx.db
    .from("purchases")
    .select("id")
    .eq("supplier_id", id);
  const purchaseIds = ((purchaseIdRows ?? []) as { id: string }[]).map(
    (row) => row.id,
  );
  let itemTotals: PartyItemTotals[] = [];
  if (purchaseIds.length > 0) {
    const { data: lineRows } = await ctx.db
      .from("purchase_lines")
      .select("item_id,quantity,received_quantity")
      .in("purchase_id", purchaseIds);
    const lines = (lineRows ?? []) as unknown as {
      item_id: string;
      quantity: string;
      received_quantity: string;
    }[];
    const itemIds = [...new Set(lines.map((line) => line.item_id))];
    const { data: itemRows } = await ctx.db
      .from("items")
      .select("id,name,code,stock_unit")
      .in("id", itemIds);
    itemTotals = aggregateItemTotals(
      lines.map((line) => ({
        item_id: line.item_id,
        ordered: line.quantity,
        delivered: line.received_quantity,
      })),
      (itemRows ?? []) as {
        id: string;
        name: string;
        code: string;
        stock_unit: string;
      }[],
    );
  }
  let totals: PartyCurrencyTotals[] = [];
  if (ctx.actor.permissions.includes("finance.view")) {
    const [bills, payments] = await Promise.all([
      ctx.db
        .from("supplier_bill_balances")
        .select("currency,amount,outstanding")
        .eq("supplier_id", id),
      ctx.db
        .from("supplier_payment_balances")
        .select("currency,amount,unapplied,status")
        .eq("supplier_id", id),
    ]);
    totals = sumByCurrency(
      (bills.data ??
        []) as { currency: string; amount: string; outstanding: string }[],
      (payments.data ?? []) as {
        currency: string;
        amount: string;
        unapplied: string;
        status: string;
      }[],
    );
  }
  return {
    supplier: supplier as SupplierDetail["supplier"],
    paymentDetails: (payment.data as SupplierPaymentDetails) ?? null,
    purchases: (purchases.data ?? []) as SupplierHistoryRow[],
    suppliedItems: [...suppliedMap.values()],
    totals,
    itemTotals,
  };
}
export async function activeSupplierOptions() {
  const ctx = await session();
  if (!ctx || !ctx.actor.permissions.includes("purchasing.manage")) return [];
  const { data } = await ctx.db
    .from("suppliers")
    .select("id,code,name,preferred_currency")
    .eq("is_active", true)
    .order("name");
  return (data ?? []) as {
    id: string;
    code: string;
    name: string;
    preferred_currency: string;
  }[];
}

export async function listItemCatalog(): Promise<CatalogItem[]> {
  const ctx = await guard("inventory.view");
  if (!ctx) return [];
  const { data, error } = await ctx.db
    .from("items")
    .select(
      "id,code,name,category,stock_unit,reorder_level,net_weight_kg,packaging_spec,notes,is_active",
    )
    .order("category")
    .order("name");
  if (error) throw new Error("Items could not be loaded.");
  return data as CatalogItem[];
}
export async function activeItemOptions() {
  const ctx = await session();
  if (!ctx) return [];
  const { data } = await ctx.db
    .from("items")
    .select("id,code,name,stock_unit,category")
    .eq("is_active", true)
    .order("name");
  return (data ?? []) as {
    id: string;
    code: string;
    name: string;
    stock_unit: string;
    category: string;
  }[];
}

export async function getInventoryOverview() {
  const ctx = await guard("inventory.view");
  if (!ctx)
    return { balances: [] as StockBalance[], movements: [] as MovementRow[] };
  const [balances, movements] = await Promise.all([
    ctx.db.from("stock_balances").select("*").order("name"),
    ctx.db
      .from("stock_movement_ledger")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);
  return {
    balances: (balances.data ?? []) as StockBalance[],
    movements: (movements.data ?? []) as MovementRow[],
  };
}
export async function getStockTotals() {
  const ctx = await guard("inventory.view");
  if (!ctx) return null;
  const { data } = await ctx.db
    .from("stock_balances")
    .select("item_id,category,on_hand,is_low");
  const rows = (data ?? []) as {
    item_id: string;
    category: string;
    on_hand: string;
    is_low: boolean;
  }[];
  return {
    rawItemCount: rows.filter((r) => r.category === "raw_material").length,
    finishedItemCount: rows.filter((r) => r.category === "finished_product")
      .length,
    lowCount: rows.filter((r) => r.is_low).length,
  };
}

export async function getLotBalances(
  categories: string[] = ["raw_material", "finished_product"],
): Promise<LotOption[]> {
  const ctx = await guard("inventory.view");
  if (!ctx) return [];
  const { data } = await ctx.db
    .from("stock_lot_balances")
    .select("lot_id,item_id,item_code,item_name,stock_unit,lot_number,on_hand")
    .in("source_type", ["opening", "purchase", "production", "adjustment"])
    .order("item_code")
    .order("lot_number");
  const rows = (data ?? []) as LotOption[];
  if (categories.length === 2) return rows;
  // Filter by category using the item catalogue (the view omits a category column).
  const items = await ctx.db.from("items").select("id,category");
  const categoryByItem = new Map(
    ((items.data ?? []) as { id: string; category: string }[]).map((i) => [
      i.id,
      i.category,
    ]),
  );
  return rows.filter((row) =>
    categories.includes(categoryByItem.get(row.item_id) ?? ""),
  );
}

export async function listPurchases(): Promise<PurchaseRow[]> {
  const ctx = await guard("suppliers.view");
  if (!ctx) return [];
  const { data, error } = await ctx.db
    .from("purchases")
    .select(
      "id,code,status,currency,order_date,expected_date, supplier:suppliers(name,code), lines:purchase_lines(quantity,unit_price)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error("Purchase orders could not be loaded.");
  return data as unknown as PurchaseRow[];
}
export async function getPurchaseDetail(
  id: string,
): Promise<PurchaseDetail | null> {
  const ctx = await guard("suppliers.view");
  if (!ctx) return null;
  const { data: purchase, error } = await ctx.db
    .from("purchases")
    .select(
      "id,code,status,currency,order_date,expected_date,notes, supplier:suppliers(name,code,id)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !purchase) return null;
  const [lines, receipts] = await Promise.all([
    ctx.db
      .from("purchase_lines")
      .select(
        "id,quantity,unit_price,received_quantity,notes, item:items(name,code,stock_unit)",
      )
      .eq("purchase_id", id)
      .order("id"),
    ctx.db
      .from("goods_receipts")
      .select(
        "id,code,receipt_date,supplier_reference, goods_receipt_lines(quantity,lot_id, item:items(name,code,stock_unit))",
      )
      .eq("purchase_id", id)
      .order("created_at", { ascending: false }),
  ]);
  return {
    purchase: purchase as unknown as PurchaseDetail["purchase"],
    lines: (lines.data ?? []) as unknown as PurchaseLineRow[],
    receipts: (receipts.data ?? []) as unknown as ReceiptRow[],
  };
}

export async function listAdjustments(): Promise<AdjustmentRow[]> {
  const ctx = await guard("inventory.view");
  if (!ctx) return [];
  const { data, error } = await ctx.db
    .from("stock_adjustments")
    .select(
      "id,code,direction,quantity,reason,status,requested_at, item:items(name,code,stock_unit), lot:lots(lot_number), requested_by:profiles!stock_adjustments_requested_by_fkey(full_name), decided_by:profiles!stock_adjustments_decided_by_fkey(full_name)",
    )
    .order("requested_at", { ascending: false });
  if (error) throw new Error("Adjustments could not be loaded.");
  return data as unknown as AdjustmentRow[];
}

export async function listBatches(): Promise<BatchRow[]> {
  const ctx = await guard("production.view");
  if (!ctx) return [];
  const { data, error } = await ctx.db
    .from("production_batches")
    .select(
      "id,code,status,produced_on,notes,created_at, production_inputs(id), production_outputs(id)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error("Production batches could not be loaded.");
  return data as unknown as BatchRow[];
}

export async function getBatchDetail(id: string): Promise<BatchDetail | null> {
  const ctx = await guard("production.view");
  if (!ctx) return null;
  const { data: head, error } = await ctx.db
    .from("production_batches")
    .select(
      "id,code,status,produced_on,notes,posted_at, posted_by:profiles!production_batches_posted_by_fkey(full_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !head) return null;
  const [inputs, outputs, wastage] = await Promise.all([
    ctx.db
      .from("production_inputs")
      .select(
        "id,item_id,lot_id,quantity, lot:lots(lot_number, item:items(name,code,stock_unit))",
      )
      .eq("batch_id", id)
      .order("id"),
    ctx.db
      .from("production_outputs")
      .select(
        "id,item_id,quantity,unit_cost, lot:lots(lot_number), item:items(name,code,stock_unit)",
      )
      .eq("batch_id", id)
      .order("id"),
    ctx.db
      .from("production_wastage")
      .select("id,item_id,quantity,unit,reason, item:items(name)")
      .eq("batch_id", id)
      .order("id"),
  ]);
  type RelFull = { name: string; code: string; stock_unit: string } | null;
  const inputsTyped = (inputs.data ?? []) as unknown as {
    id: string;
    item_id: string;
    lot_id: string;
    quantity: string;
    lot: { lot_number: string; item: RelFull | RelFull[] | null } | null;
  }[];
  const outputsTyped = (outputs.data ?? []) as unknown as {
    id: string;
    item_id: string;
    quantity: string;
    unit_cost: string | null;
    lot: { lot_number: string } | null;
    item: RelFull | RelFull[] | null;
  }[];
  type RelName = { name: string } | null;
  const wastageTyped = (wastage.data ?? []) as unknown as {
    id: string;
    item_id: string | null;
    quantity: string;
    unit: string;
    reason: string;
    item: RelName | RelName[] | null;
  }[];
  const one = <T>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;
  const headTyped = head as unknown as {
    id: string;
    code: string;
    status: BatchDetail["batch"]["status"];
    produced_on: string;
    notes: string;
    posted_at: string | null;
    posted_by: { full_name: string } | { full_name: string }[] | null;
  };
  return {
    batch: {
      id: headTyped.id,
      code: headTyped.code,
      status: headTyped.status,
      produced_on: headTyped.produced_on,
      notes: headTyped.notes,
      posted_at: headTyped.posted_at,
      posted_by_name: one(headTyped.posted_by)?.full_name ?? null,
    },
    inputs: inputsTyped.map((row) => ({
      id: row.id,
      item_id: row.item_id,
      lot_id: row.lot_id,
      quantity: row.quantity,
      lot: row.lot
        ? { lot_number: row.lot.lot_number, item: one(row.lot.item) }
        : null,
    })),
    outputs: outputsTyped.map((row) => ({
      id: row.id,
      item_id: row.item_id,
      quantity: row.quantity,
      unit_cost: row.unit_cost,
      lot: row.lot,
      item: one(row.item),
    })),
    wastage: wastageTyped.map((row) => ({
      id: row.id,
      item_id: row.item_id,
      quantity: row.quantity,
      unit: row.unit,
      reason: row.reason,
      item: one(row.item),
    })),
  };
}

export async function getProductionTotals() {
  const ctx = await guard("production.view");
  if (!ctx) return null;
  const { data } = await ctx.db.from("production_batches").select("id,status");
  const rows = (data ?? []) as { id: string; status: string }[];
  return {
    draftCount: rows.filter((r) => r.status === "draft").length,
    postedCount: rows.filter((r) => r.status === "posted").length,
    total: rows.length,
  };
}

export type TraceRow = {
  finished_lot_id: string | null;
  finished_lot_number: string | null;
  finished_item_name: string | null;
  finished_item_code: string | null;
  batch_id: string;
  batch_code: string;
  produced_on: string;
  input_lot_id: string | null;
  input_lot_number: string | null;
  input_item_name: string | null;
  supplier_name: string | null;
};

export async function listTraceability(): Promise<TraceRow[]> {
  const ctx = await guard("production.view");
  if (!ctx) return [];
  const { data, error } = await ctx.db
    .from("production_traceability")
    .select(
      "finished_lot_id,finished_lot_number,finished_item_name,finished_item_code,batch_id,batch_code,produced_on,input_lot_id,input_lot_number,input_item_name,supplier_name",
    )
    .not("finished_lot_id", "is", null)
    .order("produced_on", { ascending: false })
    .order("batch_code")
    .limit(100);
  if (error) throw new Error("Traceability could not be loaded.");
  return (data ?? []) as unknown as TraceRow[];
}

export async function getBatchTraceability(
  batchId: string,
): Promise<TraceRow[]> {
  const ctx = await guard("production.view");
  if (!ctx) return [];
  const { data } = await ctx.db
    .from("production_traceability")
    .select(
      "finished_lot_id,finished_lot_number,finished_item_name,finished_item_code,batch_id,batch_code,produced_on,input_lot_id,input_lot_number,input_item_name,supplier_name",
    )
    .eq("batch_id", batchId)
    .order("finished_lot_number")
    .order("input_lot_number");
  return (data ?? []) as unknown as TraceRow[];
}

export async function searchTraceability(query: string): Promise<TraceRow[]> {
  const ctx = await guard("production.view");
  if (!ctx) return [];
  const term = query.trim();
  if (!term) return [];
  const { data } = await ctx.db
    .from("production_traceability")
    .select(
      "finished_lot_id,finished_lot_number,finished_item_name,finished_item_code,batch_id,batch_code,produced_on,input_lot_id,input_lot_number,input_item_name,supplier_name",
    )
    .or(
      `finished_lot_number.eq.${term},batch_code.eq.${term},input_lot_number.eq.${term}`,
    )
    .order("batch_code")
    .limit(100);
  return (data ?? []) as unknown as TraceRow[];
}

// ---- Phase 4: buyers, export orders, shipments, finance ----------------------
export type Buyer = {
  id: string;
  code: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  destination_country: string;
  preferred_currency: string;
  payment_terms: string;
  is_active: boolean;
  created_at: string;
};
export type BuyerOrderRow = {
  id: string;
  code: string;
  order_date: string;
  status: string;
  currency: string;
};
export type ReceivableRow = {
  id: string;
  code: string;
  buyer_id?: string;
  buyer_name?: string;
  currency: string;
  issue_date: string;
  due_date: string | null;
  amount: string;
  outstanding: string;
  payment_state: string;
};
export type BuyerDetail = {
  buyer: Buyer & {
    billing_address: string;
    shipping_address: string;
    tax_id: string;
    notes: string;
  };
  orders: BuyerOrderRow[];
  receivables: ReceivableRow[];
  totals: PartyCurrencyTotals[];
  itemTotals: PartyItemTotals[];
};

export async function listBuyers(): Promise<Buyer[]> {
  const ctx = await guard("buyers.view");
  if (!ctx) return [];
  const { data, error } = await ctx.db
    .from("buyers")
    .select(
      "id,code,name,contact_person,phone,email,destination_country,preferred_currency,payment_terms,is_active,created_at",
    )
    .order("is_active", { ascending: false })
    .order("name");
  if (error) throw new Error("Buyers could not be loaded.");
  return data as Buyer[];
}
export async function getBuyerDetail(id: string): Promise<BuyerDetail | null> {
  const ctx = await guard("buyers.view");
  if (!ctx) return null;
  const { data: buyer, error } = await ctx.db
    .from("buyers")
    .select(
      "id,code,name,contact_person,phone,email,billing_address,shipping_address,destination_country,tax_id,payment_terms,preferred_currency,notes,is_active,created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !buyer) return null;
  const [orders, receivables] = await Promise.all([
    ctx.db
      .from("export_orders")
      .select("id,code,order_date,status,currency")
      .eq("buyer_id", id)
      .order("order_date", { ascending: false })
      .limit(20),
    ctx.actor.permissions.includes("finance.view")
      ? ctx.db
          .from("export_invoice_balances")
          .select(
            "id,code,buyer_id,currency,issue_date,due_date,amount,outstanding,payment_state",
          )
          .eq("buyer_id", id)
          .order("issue_date", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  // Quantity totals across every export order for this buyer.
  const { data: orderRows } = await ctx.db
    .from("export_orders")
    .select("id")
    .eq("buyer_id", id);
  const orderIds = ((orderRows ?? []) as { id: string }[]).map(
    (row) => row.id,
  );
  let itemTotals: PartyItemTotals[] = [];
  if (ctx.actor.permissions.includes("exports.view") && orderIds.length > 0) {
    const { data: lineRows } = await ctx.db
      .from("export_order_lines")
      .select("item_id,quantity,shipped_quantity")
      .in("order_id", orderIds);
    const lines = (lineRows ?? []) as unknown as {
      item_id: string;
      quantity: string;
      shipped_quantity: string;
    }[];
    const itemIds = [...new Set(lines.map((line) => line.item_id))];
    const { data: itemRows } = await ctx.db
      .from("items")
      .select("id,name,code,stock_unit")
      .in("id", itemIds);
    itemTotals = aggregateItemTotals(
      lines.map((line) => ({
        item_id: line.item_id,
        ordered: line.quantity,
        delivered: line.shipped_quantity,
      })),
      (itemRows ?? []) as {
        id: string;
        name: string;
        code: string;
        stock_unit: string;
      }[],
    );
  }
  let totals: PartyCurrencyTotals[] = [];
  if (ctx.actor.permissions.includes("finance.view")) {
    const { data: receiptRows } = await ctx.db
      .from("buyer_receipt_balances")
      .select("currency,amount,unapplied,status")
      .eq("buyer_id", id);
    totals = sumByCurrency(
      (receivables.data ??
        []) as { currency: string; amount: string; outstanding: string }[],
      (receiptRows ?? []) as {
        currency: string;
        amount: string;
        unapplied: string;
        status: string;
      }[],
    );
  }
  return {
    buyer: buyer as BuyerDetail["buyer"],
    orders: (orders.data ?? []) as BuyerOrderRow[],
    receivables: (receivables.data ?? []) as ReceivableRow[],
    totals,
    itemTotals,
  };
}
export async function activeBuyerOptions() {
  const ctx = await session();
  if (!ctx || !ctx.actor.permissions.includes("exports.manage")) return [];
  const { data } = await ctx.db
    .from("buyers")
    .select("id,code,name,preferred_currency,destination_country")
    .eq("is_active", true)
    .order("name");
  return (data ?? []) as {
    id: string;
    code: string;
    name: string;
    preferred_currency: string;
    destination_country: string;
  }[];
}

export type ExportOrderRow = {
  order_id: string;
  code: string;
  buyer_name: string;
  status: string;
  currency: string;
  order_date: string;
  requested_ship_date: string | null;
  ordered_quantity: string;
  shipped_quantity: string;
  reserved_quantity: string;
};
export type ExportOrderLineRow = {
  id: string;
  quantity: string;
  unit_price: string;
  shipped_quantity: string;
  item: { name: string; code: string; stock_unit: string } | null;
};
export type ShipmentLineRow = {
  id: string;
  quantity: string;
  order_line_id: string;
  item: { name: string; code: string; stock_unit: string } | null;
  lot: { lot_number: string } | null;
};
export type ShipmentRow = {
  id: string;
  code: string;
  status: string;
  container_number: string;
  port_of_loading: string;
  port_of_discharge: string;
  vessel: string;
  etd: string | null;
  eta: string | null;
  dispatched_on: string | null;
  package_count: number | null;
  net_weight_kg: string | null;
  gross_weight_kg: string | null;
  bl_reference: string;
  notes: string;
  shipment_lines: ShipmentLineRow[];
};
export type ExportOrderDetail = {
  order: {
    id: string;
    code: string;
    status: string;
    currency: string;
    incoterms: string;
    destination_country: string;
    order_date: string;
    requested_ship_date: string | null;
    notes: string;
    confirmed_at: string | null;
    buyer: { id: string; name: string; code: string } | null;
  };
  lines: ExportOrderLineRow[];
  reservedByLine: Record<string, string>;
  shipments: ShipmentRow[];
  invoices: ReceivableRow[];
};

export async function listExportOrders(): Promise<ExportOrderRow[]> {
  const ctx = await guard("exports.view");
  if (!ctx) return [];
  const { data, error } = await ctx.db
    .from("export_order_progress")
    .select("*")
    .order("order_date", { ascending: false });
  if (error) throw new Error("Export orders could not be loaded.");
  return (data ?? []) as unknown as ExportOrderRow[];
}
export async function getExportOrder(
  id: string,
): Promise<ExportOrderDetail | null> {
  const ctx = await guard("exports.view");
  if (!ctx) return null;
  const { data: head, error } = await ctx.db
    .from("export_orders")
    .select(
      "id,code,status,currency,incoterms,destination_country,order_date,requested_ship_date,notes,confirmed_at, buyer:buyers(id,name,code)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !head) return null;
  const [lines, reservations, shipments, invoices] = await Promise.all([
    ctx.db
      .from("export_order_lines")
      .select(
        "id,quantity,unit_price,shipped_quantity, item:items(name,code,stock_unit)",
      )
      .eq("order_id", id)
      .order("id"),
    ctx.db
      .from("export_reservations")
      .select("order_line_id,quantity")
      .eq("order_id", id),
    ctx.db
      .from("shipments")
      .select(
        "id,code,status,container_number,port_of_loading,port_of_discharge,vessel,etd,eta,dispatched_on,package_count,net_weight_kg,gross_weight_kg,bl_reference,notes, shipment_lines(id,quantity,order_line_id, item:items(name,code,stock_unit), lot:lots(lot_number))",
      )
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
    ctx.actor.permissions.includes("finance.view") ||
      ctx.actor.permissions.includes("exports.manage")
      ? ctx.db
          .from("export_invoice_balances")
          .select(
            "id,code,currency,issue_date,due_date,amount,outstanding,payment_state",
          )
          .eq("order_id", id)
          .order("issue_date", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const one = <T>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;
  const reservedByLine: Record<string, string> = {};
  for (const row of (reservations.data ?? []) as unknown as {
    order_line_id: string;
    quantity: string;
  }[]) {
    reservedByLine[row.order_line_id] = String(
      Number(reservedByLine[row.order_line_id] ?? 0) + Number(row.quantity),
    );
  }
  const headTyped = head as unknown as {
    id: string;
    code: string;
    status: string;
    currency: string;
    incoterms: string;
    destination_country: string;
    order_date: string;
    requested_ship_date: string | null;
    notes: string;
    confirmed_at: string | null;
    buyer: { id: string; name: string; code: string } | { id: string; name: string; code: string }[] | null;
  };
  const linesTyped = (lines.data ?? []) as unknown as {
    id: string;
    quantity: string;
    unit_price: string;
    shipped_quantity: string;
    item: { name: string; code: string; stock_unit: string } | { name: string; code: string; stock_unit: string }[] | null;
  }[];
  const shipmentsTyped = (shipments.data ?? []) as unknown as (Omit<
    ShipmentRow,
    "shipment_lines"
  > & {
    shipment_lines: {
      id: string;
      quantity: string;
      order_line_id: string;
      item:
        | { name: string; code: string; stock_unit: string }
        | { name: string; code: string; stock_unit: string }[]
        | null;
      lot: { lot_number: string } | { lot_number: string }[] | null;
    }[];
  })[];
  return {
    order: {
      id: headTyped.id,
      code: headTyped.code,
      status: headTyped.status,
      currency: headTyped.currency,
      incoterms: headTyped.incoterms,
      destination_country: headTyped.destination_country,
      order_date: headTyped.order_date,
      requested_ship_date: headTyped.requested_ship_date,
      notes: headTyped.notes,
      confirmed_at: headTyped.confirmed_at,
      buyer: one(headTyped.buyer),
    },
    lines: linesTyped.map((row) => ({
      id: row.id,
      quantity: row.quantity,
      unit_price: row.unit_price,
      shipped_quantity: row.shipped_quantity,
      item: one(row.item),
    })),
    reservedByLine,
    shipments: shipmentsTyped.map((shipment) => ({
      ...shipment,
      shipment_lines: shipment.shipment_lines.map((line) => ({
        id: line.id,
        quantity: line.quantity,
        order_line_id: line.order_line_id,
        item: one(line.item),
        lot: one(line.lot),
      })),
    })),
    invoices: (invoices.data ?? []) as unknown as ReceivableRow[],
  };
}
export async function getExportTotals() {
  const ctx = await guard("exports.view");
  if (!ctx) return null;
  const { data } = await ctx.db
    .from("export_order_progress")
    .select("order_id,status");
  const rows = (data ?? []) as { order_id: string; status: string }[];
  return {
    activeCount: rows.filter((r) =>
      ["confirmed", "partially_shipped", "shipped"].includes(r.status),
    ).length,
    total: rows.length,
  };
}

export type BillRow = {
  id: string;
  code: string;
  supplier_id: string;
  supplier_name: string;
  currency: string;
  issue_date: string;
  due_date: string | null;
  amount: string;
  allocated: string;
  outstanding: string;
  payment_state: string;
};
export type PaymentRow = {
  id: string;
  code: string;
  supplier_id: string;
  supplier_name: string;
  currency: string;
  payment_date: string;
  amount: string;
  allocated: string;
  unapplied: string;
  status: string;
  method: string;
  reference: string;
};
export type BuyerReceiptRow = {
  id: string;
  code: string;
  buyer_id: string;
  buyer_name: string;
  currency: string;
  receipt_date: string;
  amount: string;
  allocated: string;
  unapplied: string;
  status: string;
  method: string;
  reference: string;
};

export async function listSupplierBills(
  filters?: RegisterFilters,
): Promise<BillRow[]> {
  const ctx = await guard("finance.view");
  if (!ctx) return [];
  const query = applyRegisterFilters(
    ctx.db.from("supplier_bill_balances").select("*"),
    filters,
    { partyColumn: "supplier_id", dateColumn: "issue_date", stateKind: "document" },
  );
  const { data, error } = await query
    .order("due_date", { ascending: true })
    .order("issue_date", { ascending: false });
  if (error) throw new Error("Supplier bills could not be loaded.");
  return (data ?? []) as unknown as BillRow[];
}
export async function listSupplierPayments(
  filters?: RegisterFilters,
): Promise<PaymentRow[]> {
  const ctx = await guard("finance.view");
  if (!ctx) return [];
  const query = applyRegisterFilters(
    ctx.db.from("supplier_payment_balances").select("*"),
    filters,
    {
      partyColumn: "supplier_id",
      dateColumn: "payment_date",
      referenceColumns: ["reference", "code"],
      stateKind: "payment",
    },
  );
  const { data, error } = await query.order("payment_date", {
    ascending: false,
  });
  if (error) throw new Error("Supplier payments could not be loaded.");
  return (data ?? []) as unknown as PaymentRow[];
}
export async function listBuyerReceipts(
  filters?: RegisterFilters,
): Promise<BuyerReceiptRow[]> {
  const ctx = await guard("finance.view");
  if (!ctx) return [];
  const query = applyRegisterFilters(
    ctx.db.from("buyer_receipt_balances").select("*"),
    filters,
    {
      partyColumn: "buyer_id",
      dateColumn: "receipt_date",
      referenceColumns: ["reference", "code"],
      stateKind: "payment",
    },
  );
  const { data, error } = await query.order("receipt_date", {
    ascending: false,
  });
  if (error) throw new Error("Buyer receipts could not be loaded.");
  return (data ?? []) as unknown as BuyerReceiptRow[];
}
export async function listBuyerInvoices(
  filters?: RegisterFilters,
): Promise<ReceivableRow[]> {
  const ctx = await guard("finance.view");
  if (!ctx) return [];
  const query = applyRegisterFilters(
    ctx.db
      .from("export_invoice_balances")
      .select(
        "id,code,buyer_id,buyer_name,currency,issue_date,due_date,amount,allocated,outstanding,payment_state",
      ),
    filters,
    { partyColumn: "buyer_id", dateColumn: "issue_date", stateKind: "document" },
  );
  const { data, error } = await query
    .order("due_date", { ascending: true })
    .order("issue_date", { ascending: false });
  if (error) throw new Error("Buyer invoices could not be loaded.");
  return (data ?? []) as unknown as ReceivableRow[];
}
export async function openBillsForParty(supplierId: string, currency: string) {
  const ctx = await guard("finance.view");
  if (!ctx) return [];
  const { data } = await ctx.db
    .from("supplier_bill_balances")
    .select("id,code,amount,outstanding,currency")
    .eq("supplier_id", supplierId)
    .eq("currency", currency)
    .neq("payment_state", "paid")
    .order("due_date", { ascending: true });
  return (data ?? []) as unknown as {
    id: string;
    code: string;
    amount: string;
    outstanding: string;
    currency: string;
  }[];
}
export async function openInvoicesForParty(buyerId: string, currency: string) {
  const ctx = await guard("finance.view");
  if (!ctx) return [];
  const { data } = await ctx.db
    .from("export_invoice_balances")
    .select("id,code,amount,outstanding,currency")
    .eq("buyer_id", buyerId)
    .eq("currency", currency)
    .neq("payment_state", "paid")
    .order("due_date", { ascending: true });
  return (data ?? []) as unknown as {
    id: string;
    code: string;
    amount: string;
    outstanding: string;
    currency: string;
  }[];
}
export async function financeSupplierOptions() {
  const ctx = await session();
  if (!ctx || !ctx.actor.permissions.includes("finance.view")) return [];
  const { data } = await ctx.db
    .from("suppliers")
    .select("id,code,name,preferred_currency")
    .order("name");
  return (data ?? []) as {
    id: string;
    code: string;
    name: string;
    preferred_currency: string;
  }[];
}
export async function financeBuyerOptions() {
  const ctx = await session();
  if (!ctx || !ctx.actor.permissions.includes("finance.view")) return [];
  const { data } = await ctx.db
    .from("buyers")
    .select("id,code,name,preferred_currency")
    .order("name");
  return (data ?? []) as {
    id: string;
    code: string;
    name: string;
    preferred_currency: string;
  }[];
}
export async function purchaseReferenceOptions() {
  const ctx = await session();
  if (!ctx || !ctx.actor.permissions.includes("finance.view")) return [];
  const { data } = await ctx.db
    .from("purchases")
    .select("id,code,supplier_id, supplier:suppliers(name)")
    .order("order_date", { ascending: false })
    .limit(200);
  const one = <T>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;
  return ((data ?? []) as unknown as {
    id: string;
    code: string;
    supplier_id: string;
    supplier: { name: string } | { name: string }[] | null;
  }[]).map((row) => ({
    id: row.id,
    code: row.code,
    supplier_id: row.supplier_id,
    supplier_name: one(row.supplier)?.name ?? "",
  }));
}
export async function getPayablesTotals() {
  const ctx = await guard("finance.view");
  if (!ctx) return null;
  const { data } = await ctx.db
    .from("supplier_bill_balances")
    .select("id,payment_state,outstanding,currency");
  const rows = (data ?? []) as {
    id: string;
    payment_state: string;
    outstanding: string;
    currency: string;
  }[];
  return {
    openCount: rows.filter((r) => r.payment_state !== "paid").length,
    total: rows.length,
  };
}
export async function getReceivablesTotals() {
  const ctx = await guard("finance.view");
  if (!ctx) return null;
  const { data } = await ctx.db
    .from("export_invoice_balances")
    .select("id,payment_state");
  const rows = (data ?? []) as { id: string; payment_state: string }[];
  return {
    openCount: rows.filter((r) => r.payment_state !== "paid").length,
    total: rows.length,
  };
}

// ===== Phase 5: reports and statements =====
export type ReportFilters = {
  from?: string;
  to?: string;
  itemId?: string;
  partyId?: string;
  status?: string;
  lowOnly?: boolean;
};

export async function stockReport(filters: ReportFilters): Promise<StockBalance[]> {
  const ctx = await guard("inventory.view");
  if (!ctx) return [];
  let query = ctx.db.from("stock_balances").select("*").order("name");
  if (filters.itemId) query = query.eq("item_id", filters.itemId);
  if (filters.lowOnly) query = query.eq("is_low", true);
  const { data } = await query;
  return (data ?? []) as StockBalance[];
}

export async function movementReport(filters: ReportFilters): Promise<MovementRow[]> {
  const ctx = await guard("inventory.view");
  if (!ctx) return [];
  let query = ctx.db
    .from("stock_movement_ledger")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (filters.itemId) query = query.eq("item_id", filters.itemId);
  if (filters.status) query = query.eq("movement_type", filters.status);
  const { data } = await query;
  const rows = (data ?? []) as MovementRow[];
  // Date filters compare the local calendar day of each movement.
  if (!filters.from && !filters.to) return rows;
  return rows.filter((row) => {
    const day = new Date(row.created_at).toISOString().slice(0, 10);
    return (
      (!filters.from || day >= filters.from) && (!filters.to || day <= filters.to)
    );
  });
}

export type ProductionSummaryRow = {
  batch_id: string;
  batch_code: string;
  produced_on: string;
  status: string;
  produced_by_name: string | null;
  item_id: string | null;
  item_code: string | null;
  item_name: string | null;
  stock_unit: string | null;
  output_quantity: string | null;
  unit_cost: string | null;
  input_quantity: string;
  wastage_quantity: string;
};
export async function productionReport(
  filters: ReportFilters,
): Promise<ProductionSummaryRow[]> {
  const ctx = await guard("production.view");
  if (!ctx) return [];
  let query = ctx.db
    .from("production_summary")
    .select("*")
    .order("produced_on", { ascending: false })
    .order("batch_code");
  if (filters.from) query = query.gte("produced_on", filters.from);
  if (filters.to) query = query.lte("produced_on", filters.to);
  if (filters.itemId) query = query.eq("item_id", filters.itemId);
  if (filters.status) query = query.eq("status", filters.status);
  const { data } = await query;
  return (data ?? []) as ProductionSummaryRow[];
}

export type ExportSalesRow = {
  order_id: string;
  order_code: string;
  order_date: string;
  status: string;
  currency: string;
  destination_country: string;
  buyer_id: string;
  buyer_code: string;
  buyer_name: string;
  order_line_id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  stock_unit: string;
  quantity: string;
  shipped_quantity: string;
  unit_price: string;
  line_value: string;
  shipped_value: string;
};
export async function exportSalesReport(
  filters: ReportFilters,
): Promise<ExportSalesRow[]> {
  const ctx = await guard("exports.view");
  if (!ctx) return [];
  let query = ctx.db
    .from("export_sales_lines")
    .select("*")
    .order("order_date", { ascending: false })
    .order("order_code");
  if (filters.from) query = query.gte("order_date", filters.from);
  if (filters.to) query = query.lte("order_date", filters.to);
  if (filters.itemId) query = query.eq("item_id", filters.itemId);
  if (filters.partyId) query = query.eq("buyer_id", filters.partyId);
  if (filters.status) query = query.eq("status", filters.status);
  const { data } = await query;
  return (data ?? []) as ExportSalesRow[];
}

export type ShipmentScheduleRow = {
  id: string;
  code: string;
  status: string;
  container_number: string;
  port_of_loading: string;
  port_of_discharge: string;
  vessel: string;
  etd: string | null;
  eta: string | null;
  dispatched_on: string | null;
  delivered_at: string | null;
  package_count: number | null;
  net_weight_kg: string | null;
  gross_weight_kg: string | null;
  bl_reference: string;
  order_code: string;
  buyer_name: string;
  destination_country: string;
  planned_quantity: string;
};
export async function shipmentScheduleReport(
  filters: ReportFilters,
): Promise<ShipmentScheduleRow[]> {
  const ctx = await guard("exports.view");
  if (!ctx) return [];
  let query = ctx.db
    .from("shipment_schedule")
    .select("*")
    .order("etd", { ascending: true })
    .order("code");
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.partyId) {
    const shipments = await ctx.db
      .from("shipments")
      .select("id")
      .eq("buyer_id", filters.partyId);
    query = query.in(
      "id",
      ((shipments.data ?? []) as { id: string }[]).map((row) => row.id),
    );
  }
  const { data } = await query;
  return (data ?? []) as ShipmentScheduleRow[];
}

export type OverdueDocRow = {
  document_type: string;
  id: string;
  code: string;
  party_id: string;
  party_name: string;
  currency: string;
  issue_date: string;
  due_date: string;
  amount: string;
  outstanding: string;
};
export async function overdueDocuments(): Promise<OverdueDocRow[]> {
  const ctx = await guard("finance.view");
  if (!ctx) return [];
  const { data } = await ctx.db
    .from("overdue_documents")
    .select("*")
    .order("due_date");
  return (data ?? []) as OverdueDocRow[];
}

export type UnappliedRow = {
  entry_type: string;
  id: string;
  code: string;
  party_id: string;
  party_name: string;
  currency: string;
  entry_date: string;
  amount: string;
  allocated: string;
  unapplied: string;
};
export async function unappliedBalances(): Promise<UnappliedRow[]> {
  const ctx = await guard("finance.view");
  if (!ctx) return [];
  const { data } = await ctx.db
    .from("unapplied_balances")
    .select("*")
    .order("entry_date");
  return (data ?? []) as UnappliedRow[];
}

export type SupplierStatement = {
  supplier: { id: string; code: string; name: string } | null;
  bills: BillRow[];
  payments: PaymentRow[];
  allocations: {
    payment_code: string;
    payment_date: string;
    bill_code: string;
    bill_due_date: string | null;
    amount: string;
    currency: string;
  }[];
};
export async function supplierStatement(id: string): Promise<SupplierStatement | null> {
  const ctx = await guard("finance.view");
  if (!ctx) return null;
  const supplier = await ctx.db
    .from("suppliers")
    .select("id,code,name")
    .eq("id", id)
    .maybeSingle();
  if (!supplier.data) return null;
  const [bills, payments, allocations] = await Promise.all([
    ctx.db
      .from("supplier_bill_balances")
      .select("*")
      .eq("supplier_id", id)
      .order("issue_date", { ascending: false }),
    ctx.db
      .from("supplier_payment_balances")
      .select("*")
      .eq("supplier_id", id)
      .order("payment_date", { ascending: false }),
    ctx.db
      .from("supplier_allocation_ledger")
      .select("payment_code,payment_date,bill_code,bill_due_date,amount,currency")
      .eq("supplier_id", id)
      .order("payment_date", { ascending: false }),
  ]);
  return {
    supplier: supplier.data as { id: string; code: string; name: string },
    bills: (bills.data ?? []) as unknown as BillRow[],
    payments: (payments.data ?? []) as unknown as PaymentRow[],
    allocations: (allocations.data ?? []) as SupplierStatement["allocations"],
  };
}

export type BuyerStatement = {
  buyer: { id: string; code: string; name: string } | null;
  invoices: ReceivableRow[];
  receipts: BuyerReceiptRow[];
  allocations: {
    receipt_code: string;
    receipt_date: string;
    invoice_code: string;
    invoice_due_date: string | null;
    amount: string;
    currency: string;
  }[];
};
export async function buyerStatement(id: string): Promise<BuyerStatement | null> {
  const ctx = await guard("finance.view");
  if (!ctx) return null;
  const buyer = await ctx.db
    .from("buyers")
    .select("id,code,name")
    .eq("id", id)
    .maybeSingle();
  if (!buyer.data) return null;
  const [invoices, receipts, allocations] = await Promise.all([
    ctx.db
      .from("export_invoice_balances")
      .select("*")
      .eq("buyer_id", id)
      .order("issue_date", { ascending: false }),
    ctx.db
      .from("buyer_receipt_balances")
      .select("*")
      .eq("buyer_id", id)
      .order("receipt_date", { ascending: false }),
    ctx.db
      .from("buyer_allocation_ledger")
      .select("receipt_code,receipt_date,invoice_code,invoice_due_date,amount,currency")
      .eq("buyer_id", id)
      .order("receipt_date", { ascending: false }),
  ]);
  return {
    buyer: buyer.data as { id: string; code: string; name: string },
    invoices: (invoices.data ?? []) as unknown as ReceivableRow[],
    receipts: (receipts.data ?? []) as unknown as BuyerReceiptRow[],
    allocations: (allocations.data ?? []) as BuyerStatement["allocations"],
  };
}

// ===== Commercial documents and register filters=====

export type RegisterFilters = {
  partyId?: string;
  from?: string;
  to?: string;
  currency?: string;
  reference?: string;
  allocation?: string;
};

// Minimal shape of the chainable PostgREST filter builder, so one helper can
// apply register filters to every ledger view. The generic keeps the real
// builder type at call sites so ordering and awaiting stay fully typed.
type RegisterFilterChain = {
  eq(column: string, value: string): RegisterFilterChain;
  neq(column: string, value: string): RegisterFilterChain;
  gt(column: string, value: string): RegisterFilterChain;
  gte(column: string, value: string): RegisterFilterChain;
  lte(column: string, value: string): RegisterFilterChain;
  ilike(column: string, pattern: string): RegisterFilterChain;
  or(filters: string): RegisterFilterChain;
};

function applyRegisterFilters<T extends object>(
  query: T,
  filters: RegisterFilters | undefined,
  options: {
    partyColumn: string;
    dateColumn: string;
    referenceColumns?: string[];
    stateKind: "document" | "payment";
  },
): T {
  if (!filters) return query;
  let chain = query as unknown as RegisterFilterChain;
  if (filters.partyId) chain = chain.eq(options.partyColumn, filters.partyId);
  if (filters.currency) chain = chain.eq("currency", filters.currency);
  if (filters.from) chain = chain.gte(options.dateColumn, filters.from);
  if (filters.to) chain = chain.lte(options.dateColumn, filters.to);
  if (filters.reference) {
    // Strip PostgREST logical-operator characters so user text stays a literal.
    const needle = `%${filters.reference.replace(/[,()]/g, " ")}%`;
    const columns = options.referenceColumns ?? ["code"];
    chain =
      columns.length === 1
        ? chain.ilike(columns[0], needle)
        : chain.or(columns.map((column) => `${column}.ilike.${needle}`).join(","));
  }
  if (filters.allocation === "open") {
    chain =
      options.stateKind === "document"
        ? chain.neq("payment_state", "paid")
        : chain.eq("allocated", "0");
  } else if (filters.allocation === "partial") {
    chain =
      options.stateKind === "document"
        ? chain.eq("payment_state", "partially_paid")
        : chain.gt("allocated", "0").gt("unapplied", "0");
  } else if (filters.allocation === "settled") {
    chain =
      options.stateKind === "document"
        ? chain.eq("payment_state", "paid")
        : chain.lte("unapplied", "0");
  }
  return chain as unknown as T;
}

const ALLOCATION_STATES = ["open", "partial", "settled"];

export function readRegisterFilters(
  searchParams: Record<string, string | string[] | undefined>,
): RegisterFilters {
  const value = (key: string) => {
    const raw = searchParams[key];
    const text = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    return text ? text : undefined;
  };
  const date = (text?: string) =>
    text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
  const party = value("party");
  const currency = value("currency");
  const allocation = value("allocation");
  return {
    partyId: party && /^[0-9a-f-]{36}$/i.test(party) ? party : undefined,
    from: date(value("from")),
    to: date(value("to")),
    currency: currency && /^[A-Za-z]{3}$/.test(currency)
      ? currency.toUpperCase()
      : undefined,
    reference: value("reference")?.slice(0, 120),
    allocation:
      allocation && ALLOCATION_STATES.includes(allocation)
        ? allocation
        : undefined,
  };
}

function oneValue<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type CompanyLetterhead = {
  name: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  base_currency: string;
  warehouse_name: string;
};

async function getCompanyLetterhead(): Promise<CompanyLetterhead | null> {
  const ctx = await session();
  if (!ctx) return null;
  const { data } = await ctx.db
    .from("company_settings")
    .select("name,email,phone,address,country,base_currency,warehouse_name")
    .eq("id", true)
    .maybeSingle();
  return (data ?? null) as CompanyLetterhead | null;
}

export type InvoiceDocument = {
  invoice: {
    id: string;
    code: string;
    order_id: string;
    shipment_id: string | null;
    currency: string;
    exchange_rate: string;
    issue_date: string;
    due_date: string | null;
    subtotal: string;
    discount: string;
    tax: string;
    amount: string;
    notes: string;
  };
  buyer: {
    name: string;
    code: string;
    contact_person: string;
    email: string;
    phone: string;
    billing_address: string;
    tax_id: string;
  } | null;
  shipment: {
    id: string;
    code: string;
    container_number: string;
    bl_reference: string;
    port_of_loading: string;
    port_of_discharge: string;
    vessel: string;
    dispatched_on: string | null;
  } | null;
  order: { code: string; incoterms: string; destination_country: string } | null;
  lines: {
    description: string;
    quantity: string;
    unit_price: string;
    amount: string;
  }[];
  company: CompanyLetterhead | null;
};

export async function getInvoiceDocument(
  id: string,
): Promise<InvoiceDocument | null> {
  const ctx = await guard("exports.view");
  if (!ctx) return null;
  const [head, lines, company] = await Promise.all([
    ctx.db
      .from("export_invoices")
      .select(
        `id,code,order_id,shipment_id,currency,exchange_rate,issue_date,due_date,subtotal,discount,tax,amount,notes,
        buyer:buyers(name,code,contact_person,email,phone,billing_address,tax_id),
        shipment:shipments(id,code,container_number,bl_reference,port_of_loading,port_of_discharge,vessel,dispatched_on),
        order:export_orders(code,incoterms,destination_country)`,
      )
      .eq("id", id)
      .maybeSingle(),
    ctx.db
      .from("export_invoice_lines")
      .select("description,quantity,unit_price,amount")
      .eq("invoice_id", id)
      .order("id"),
    getCompanyLetterhead(),
  ]);
  if (!head) return null;
  const row = head as unknown as Record<string, unknown>;
  return {
    invoice: {
      id: row.id as string,
      code: row.code as string,
      order_id: row.order_id as string,
      shipment_id: (row.shipment_id as string | null) ?? null,
      currency: row.currency as string,
      exchange_rate: String(row.exchange_rate ?? 1),
      issue_date: row.issue_date as string,
      due_date: (row.due_date as string | null) ?? null,
      subtotal: String(row.subtotal ?? 0),
      discount: String(row.discount ?? 0),
      tax: String(row.tax ?? 0),
      amount: String(row.amount ?? 0),
      notes: (row.notes as string) ?? "",
    },
    buyer: oneValue(row.buyer as InvoiceDocument["buyer"] | InvoiceDocument["buyer"][] | null),
    shipment: oneValue(
      row.shipment as InvoiceDocument["shipment"] | InvoiceDocument["shipment"][] | null,
    ),
    order: oneValue(
      row.order as InvoiceDocument["order"] | InvoiceDocument["order"][] | null,
    ),
    lines: (lines.data ?? []) as unknown as InvoiceDocument["lines"],
    company,
  };
}

export type PackingListDocument = {
  shipment: {
    id: string;
    code: string;
    order_id: string;
    status: string;
    container_number: string;
    seal_number: string;
    port_of_loading: string;
    port_of_discharge: string;
    vessel: string;
    etd: string | null;
    eta: string | null;
    dispatched_on: string | null;
    package_count: number | null;
    net_weight_kg: string | null;
    gross_weight_kg: string | null;
    bl_reference: string;
    notes: string;
  };
  buyer: {
    name: string;
    code: string;
    contact_person: string;
    email: string;
    phone: string;
    shipping_address: string;
    destination_country: string;
  } | null;
  order: { code: string; incoterms: string; destination_country: string } | null;
  lines: {
    quantity: string;
    stock_unit: string;
    item_name: string;
    item_code: string;
    lot_number: string;
  }[];
  company: CompanyLetterhead | null;
};

export async function getPackingList(
  id: string,
): Promise<PackingListDocument | null> {
  const ctx = await guard("exports.view");
  if (!ctx) return null;
  const [head, company] = await Promise.all([
    ctx.db
      .from("shipments")
      .select(
        `id,code,order_id,status,container_number,seal_number,port_of_loading,port_of_discharge,vessel,etd,eta,dispatched_on,package_count,net_weight_kg,gross_weight_kg,bl_reference,notes,
        buyer:buyers(name,code,contact_person,email,phone,shipping_address,destination_country),
        order:export_orders(code,incoterms,destination_country),
        shipment_lines(quantity, item:items(name,code,stock_unit), lot:lots(lot_number))`,
      )
      .eq("id", id)
      .maybeSingle(),
    getCompanyLetterhead(),
  ]);
  if (!head) return null;
  const row = head as unknown as Record<string, unknown>;
  const rawLines = (row.shipment_lines ?? []) as unknown as {
    quantity: string;
    item: { name: string; code: string; stock_unit: string } | null;
    lot: { lot_number: string } | null;
  }[];
  return {
    shipment: {
      id: row.id as string,
      code: row.code as string,
      order_id: row.order_id as string,
      status: row.status as string,
      container_number: (row.container_number as string) ?? "",
      seal_number: (row.seal_number as string) ?? "",
      port_of_loading: (row.port_of_loading as string) ?? "",
      port_of_discharge: (row.port_of_discharge as string) ?? "",
      vessel: (row.vessel as string) ?? "",
      etd: (row.etd as string | null) ?? null,
      eta: (row.eta as string | null) ?? null,
      dispatched_on: (row.dispatched_on as string | null) ?? null,
      package_count:
        row.package_count === null || row.package_count === undefined
          ? null
          : Number(row.package_count),
      net_weight_kg:
        row.net_weight_kg === null || row.net_weight_kg === undefined
          ? null
          : String(row.net_weight_kg),
      gross_weight_kg:
        row.gross_weight_kg === null || row.gross_weight_kg === undefined
          ? null
          : String(row.gross_weight_kg),
      bl_reference: (row.bl_reference as string) ?? "",
      notes: (row.notes as string) ?? "",
    },
    buyer: oneValue(
      row.buyer as PackingListDocument["buyer"] | PackingListDocument["buyer"][] | null,
    ),
    order: oneValue(
      row.order as PackingListDocument["order"] | PackingListDocument["order"][] | null,
    ),
    lines: rawLines
      .map((line) => ({
        quantity: String(line.quantity),
        stock_unit: line.item?.stock_unit ?? "",
        item_name: line.item?.name ?? "Unknown item",
        item_code: line.item?.code ?? "",
        lot_number: line.lot?.lot_number ?? "",
      }))
      .sort(
        (a, b) =>
          a.item_name.localeCompare(b.item_name) ||
          a.lot_number.localeCompare(b.lot_number),
      ),
    company,
  };
}

