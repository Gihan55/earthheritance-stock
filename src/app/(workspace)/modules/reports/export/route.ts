import {
  buyerStatement,
  exportSalesReport,
  movementReport,
  overdueDocuments,
  productionReport,
  shipmentScheduleReport,
  stockReport,
  supplierStatement,
  unappliedBalances,
} from "@/lib/records";
import type { ReportFilters } from "@/lib/records";
import { toCsv } from "@/lib/csv";
import type { CsvColumn } from "@/lib/csv";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("report") ?? "";
  const filters: ReportFilters = {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    itemId: url.searchParams.get("item") ?? undefined,
    partyId: url.searchParams.get("party") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    lowOnly: url.searchParams.get("low") === "1",
  };
  const statementId = url.searchParams.get("id") ?? "";
  let name = key || "report";
  let columns: CsvColumn<Record<string, unknown>>[] | null = null;
  let rows: Record<string, unknown>[] = [];
  if (key === "stock") {
    columns = [
      { header: "Code", value: (r) => r.code },
      { header: "Item", value: (r) => r.name },
      { header: "Category", value: (r) => r.category },
      { header: "Unit", value: (r) => r.stock_unit },
      { header: "On hand", value: (r) => r.on_hand },
      { header: "Reorder level", value: (r) => r.reorder_level },
      { header: "Low stock", value: (r) => (r.is_low ? "yes" : "no") },
    ];
    rows = (await stockReport(filters)) as unknown as Record<string, unknown>[];
  } else if (key === "movements") {
    columns = [
      { header: "Date", value: (r) => r.created_at },
      { header: "Item", value: (r) => `${r.item_code} ${r.item_name}` },
      { header: "Lot", value: (r) => r.lot_number },
      { header: "Type", value: (r) => r.movement_type },
      { header: "Quantity", value: (r) => r.quantity_delta },
      { header: "Unit", value: (r) => r.stock_unit },
      { header: "Reference", value: (r) => r.reference },
      { header: "Recorded by", value: (r) => r.created_by_name },
    ];
    rows = (await movementReport(filters)) as unknown as Record<string, unknown>[];
  } else if (key === "production") {
    columns = [
      { header: "Batch", value: (r) => r.batch_code },
      { header: "Date", value: (r) => r.produced_on },
      { header: "Status", value: (r) => r.status },
      { header: "Output item", value: (r) => r.item_name },
      { header: "Output quantity", value: (r) => r.output_quantity },
      { header: "Inputs consumed", value: (r) => r.input_quantity },
      { header: "Wastage", value: (r) => r.wastage_quantity },
      { header: "Unit cost", value: (r) => r.unit_cost },
      { header: "Recorded by", value: (r) => r.produced_by_name },
    ];
    rows = (await productionReport(filters)) as unknown as Record<string, unknown>[];
  } else if (key === "export-sales") {
    columns = [
      { header: "Order", value: (r) => r.order_code },
      { header: "Date", value: (r) => r.order_date },
      { header: "Status", value: (r) => r.status },
      { header: "Buyer", value: (r) => r.buyer_name },
      { header: "Country", value: (r) => r.destination_country },
      { header: "Product", value: (r) => r.item_name },
      { header: "Quantity", value: (r) => r.quantity },
      { header: "Shipped", value: (r) => r.shipped_quantity },
      { header: "Unit price", value: (r) => r.unit_price },
      { header: "Line value", value: (r) => r.line_value },
      { header: "Currency", value: (r) => r.currency },
    ];
    rows = (await exportSalesReport(filters)) as unknown as Record<string, unknown>[];
  } else if (key === "shipments") {
    columns = [
      { header: "Shipment", value: (r) => r.code },
      { header: "Status", value: (r) => r.status },
      { header: "Order", value: (r) => r.order_code },
      { header: "Buyer", value: (r) => r.buyer_name },
      { header: "Country", value: (r) => r.destination_country },
      { header: "Container", value: (r) => r.container_number },
      { header: "Loading port", value: (r) => r.port_of_loading },
      { header: "Discharge port", value: (r) => r.port_of_discharge },
      { header: "ETD", value: (r) => r.etd },
      { header: "ETA", value: (r) => r.eta },
      { header: "Dispatched", value: (r) => r.dispatched_on },
      { header: "Planned quantity", value: (r) => r.planned_quantity },
    ];
    rows = (await shipmentScheduleReport(filters)) as unknown as Record<string, unknown>[];
  } else if (key === "overdue") {
    name = "overdue-documents";
    columns = [
      { header: "Type", value: (r) => r.document_type },
      { header: "Document", value: (r) => r.code },
      { header: "Party", value: (r) => r.party_name },
      { header: "Currency", value: (r) => r.currency },
      { header: "Issued", value: (r) => r.issue_date },
      { header: "Due", value: (r) => r.due_date },
      { header: "Amount", value: (r) => r.amount },
      { header: "Outstanding", value: (r) => r.outstanding },
    ];
    rows = (await overdueDocuments()) as unknown as Record<string, unknown>[];
  } else if (key === "unapplied") {
    columns = [
      { header: "Type", value: (r) => r.entry_type },
      { header: "Document", value: (r) => r.code },
      { header: "Party", value: (r) => r.party_name },
      { header: "Currency", value: (r) => r.currency },
      { header: "Date", value: (r) => r.entry_date },
      { header: "Amount", value: (r) => r.amount },
      { header: "Allocated", value: (r) => r.allocated },
      { header: "Unapplied", value: (r) => r.unapplied },
    ];
    rows = (await unappliedBalances()) as unknown as Record<string, unknown>[];
  } else if (key === "supplier-statement" && statementId) {
    name = "supplier-statement";
    const statement = await supplierStatement(statementId);
    rows = statement
      ? [
          ...statement.bills.map((bill) => ({
            entry_date: bill.issue_date,
            entry_type: "Bill",
            reference: bill.code,
            description: `Bill from ${bill.supplier_name}`,
            currency: bill.currency,
            debit: bill.amount,
            credit: "",
          })),
          ...statement.payments.map((payment) => ({
            entry_date: payment.payment_date,
            entry_type: "Payment",
            reference: payment.code,
            description: `Payment to ${payment.supplier_name}`,
            currency: payment.currency,
            debit: "",
            credit: payment.amount,
          })),
        ].sort((a, b) =>
          String(a.entry_date).localeCompare(String(b.entry_date)) ||
          String(a.reference).localeCompare(String(b.reference)),
        )
      : [];
    columns = [
      { header: "Date", value: (r) => r.entry_date },
      { header: "Type", value: (r) => r.entry_type },
      { header: "Reference", value: (r) => r.reference },
      { header: "Description", value: (r) => r.description },
      { header: "Currency", value: (r) => r.currency },
      { header: "Debit", value: (r) => r.debit },
      { header: "Credit", value: (r) => r.credit },
    ];
  } else if (key === "buyer-statement" && statementId) {
    name = "buyer-statement";
    const statement = await buyerStatement(statementId);
    rows = statement
      ? [
          ...statement.invoices.map((invoice) => ({
            entry_date: invoice.issue_date,
            entry_type: "Invoice",
            reference: invoice.code,
            currency: invoice.currency,
            debit: invoice.amount,
            credit: "",
          })),
          ...statement.receipts.map((receipt) => ({
            entry_date: receipt.receipt_date,
            entry_type: "Receipt",
            reference: receipt.code,
            currency: receipt.currency,
            debit: "",
            credit: receipt.amount,
          })),
        ].sort((a, b) =>
          String(a.entry_date).localeCompare(String(b.entry_date)) ||
          String(a.reference).localeCompare(String(b.reference)),
        )
      : [];
    columns = [
      { header: "Date", value: (r) => r.entry_date },
      { header: "Type", value: (r) => r.entry_type },
      { header: "Reference", value: (r) => r.reference },
      { header: "Currency", value: (r) => r.currency },
      { header: "Debit", value: (r) => r.debit },
      { header: "Credit", value: (r) => r.credit },
    ];
  }
  if (!columns)
    return Response.json({ error: "Unknown report." }, { status: 404 });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(columns, rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="earthheritance-${name}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
