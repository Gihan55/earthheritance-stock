import Link from "next/link";
import { Download } from "lucide-react";
import { requirePermission } from "@/lib/workspace";
import { can } from "@/lib/permissions";
import {
  activeItemOptions,
  buyerStatement,
  exportSalesReport,
  financeBuyerOptions,
  financeSupplierOptions,
  movementReport,
  overdueDocuments,
  productionReport,
  shipmentScheduleReport,
  stockReport,
  supplierStatement,
  unappliedBalances,
} from "@/lib/records";
import type { ReportFilters } from "@/lib/records";
import { Badge, PageHeading } from "@/components/ui";
import { PrintButton } from "@/components/reports-ui";
import {
  batchStatus,
  categoryLabel,
  exportOrderStatus,
  formatDateTime,
  formatDate,
  formatMoney,
  formatQty,
  movementLabel,
  shipmentStatus,
} from "@/lib/format";

export const metadata = { title: "Reports" };

type SearchParams = Record<string, string | string[] | undefined>;
const param = (sp: SearchParams, key: string) =>
  typeof sp[key] === "string" && sp[key] !== "" ? (sp[key] as string) : undefined;

function csvHref(key: string, filters: ReportFilters, id?: string) {
  const params = new URLSearchParams({ report: key });
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.itemId) params.set("item", filters.itemId);
  if (filters.partyId) params.set("party", filters.partyId);
  if (filters.status) params.set("status", filters.status);
  if (filters.lowOnly) params.set("low", "1");
  if (id) params.set("id", id);
  return `/modules/reports/export?${params.toString()}`;
}

function CsvLink({ href, label = "CSV" }: { href: string; label?: string }) {
  return (
    <a className="button button-secondary button-small no-print" href={href}>
      <Download size={14} />
      {label}
    </a>
  );
}

function EmptyRow({ message = "Nothing to show for these filters." }) {
  return <div className="panel-body muted">{message}</div>;
}

type StatementEntry = {
  entry_date: string;
  entry_type: string;
  reference: string;
  debit: string;
  credit: string;
  currency: string;
};
function StatementTables({ entries, csv }: { entries: StatementEntry[]; csv: string }) {
  const currencies = [...new Set(entries.map((entry) => entry.currency))].sort();
  if (currencies.length === 0)
    return <EmptyRow message="This party has no bills or payments recorded yet." />;
  return (
    <>
      {currencies.map((currency) => {
        const rows = entries
          .filter((entry) => entry.currency === currency)
          .sort(
            (a, b) =>
              a.entry_date.localeCompare(b.entry_date) ||
              a.reference.localeCompare(b.reference),
          );
        let balance = 0;
        return (
          <div className="table-scroll" key={currency}>
            <table className="record-table">
              <caption className="caption">{currency} statement</caption>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => {
                  balance += Number(entry.debit || 0) - Number(entry.credit || 0);
                  return (
                    <tr key={`${entry.entry_type}-${entry.reference}`}>
                      <td>{formatDate(entry.entry_date)}</td>
                      <td>{entry.entry_type}</td>
                      <td>
                        <span className="primary">{entry.reference}</span>
                      </td>
                      <td className="num">
                        {entry.debit ? formatMoney(entry.debit, currency) : "—"}
                      </td>
                      <td className="num">
                        {entry.credit ? formatMoney(entry.credit, currency) : "—"}
                      </td>
                      <td className="num">{formatMoney(balance, currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="panel-body">
        <CsvLink href={csv} label="Export statement (CSV)" />
      </div>
    </>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const actor = await requirePermission("reports.view");
  const perms = actor.permissions;
  const filters: ReportFilters = {
    from: param(sp, "from"),
    to: param(sp, "to"),
    itemId: param(sp, "item"),
    partyId: param(sp, "party"),
    status: param(sp, "status"),
    lowOnly: param(sp, "low") === "1",
  };
  const mayInventory = can(perms, "inventory.view");
  const mayProduction = can(perms, "production.view");
  const mayExports = can(perms, "exports.view");
  const mayFinance = can(perms, "finance.view");
  const statementKind = param(sp, "statement");
  const statementId = param(sp, "party");
  const [
    stock,
    movements,
    production,
    sales,
    shipments,
    overdue,
    unapplied,
    itemOptions,
    supplierOptions,
    buyerOptions,
    supStatement,
    buyStatement,
  ] = await Promise.all([
    mayInventory ? stockReport(filters) : [],
    mayInventory ? movementReport(filters) : [],
    mayProduction ? productionReport(filters) : [],
    mayExports ? exportSalesReport(filters) : [],
    mayExports ? shipmentScheduleReport(filters) : [],
    mayFinance ? overdueDocuments() : [],
    mayFinance ? unappliedBalances() : [],
    mayInventory ? activeItemOptions() : [],
    mayFinance ? financeSupplierOptions() : [],
    mayFinance ? financeBuyerOptions() : [],
    mayFinance && statementKind === "supplier" && statementId
      ? supplierStatement(statementId)
      : null,
    mayFinance && statementKind === "buyer" && statementId
      ? buyerStatement(statementId)
      : null,
  ]);
  const query = new URLSearchParams();
  for (const [key, value] of [
    ["from", filters.from],
    ["to", filters.to],
    ["item", filters.itemId],
    ["low", filters.lowOnly ? "1" : undefined],
    ["statement", statementKind],
    ["party", statementId],
  ] as [string, string | undefined][])
    if (value) query.set(key, value);
  return (
    <>
      <PageHeading
        eyebrow="INSIGHTS"
        title="Reports"
        description="The information you need to make your next move — filtered, exported, and printed."
      >
        <PrintButton />
      </PageHeading>
      {actor.preview && (
        <p className="form-note section-spacer">
          Reports read from the live workspace. Connect Supabase to see your
          own data here.
        </p>
      )}
      <form
        className="panel report-filter-form"
        method="get"
        action="/modules/reports"
      >
        <div className="panel-body form-grid">
          <label>
            From
            <input type="date" name="from" defaultValue={filters.from ?? ""} />
          </label>
          <label>
            To
            <input type="date" name="to" defaultValue={filters.to ?? ""} />
          </label>
          {mayInventory && (
            <label>
              Item
              <select name="item" defaultValue={filters.itemId ?? ""}>
                <option value="">All items</option>
                {itemOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="checkbox-line">
            <input
              type="checkbox"
              name="low"
              value="1"
              defaultChecked={filters.lowOnly}
            />
            <span>Low stock only (stock balances)</span>
          </label>
          <input type="hidden" name="statement" value={statementKind ?? ""} />
          <input type="hidden" name="party" value={statementId ?? ""} />
          <div className="form-actions">
            <button type="submit" className="button button-secondary">
              Apply filters
            </button>
            <Link className="button button-ghost" href="/modules/reports">
              Reset
            </Link>
          </div>
        </div>
      </form>

      {mayInventory && (
        <section className="panel section-spacer">
          <div className="panel-heading">
            <div>
              <h2>
                Stock balances <span className="count-bubble">{stock.length}</span>
              </h2>
              <p>On-hand quantities per item, with reorder flags.</p>
            </div>
            <CsvLink href={csvHref("stock", filters)} />
          </div>
          {stock.length === 0 ? (
            <EmptyRow />
          ) : (
            <div className="table-scroll">
              <table className="record-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th className="num">On hand</th>
                    <th className="num">Reorder at</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((row) => (
                    <tr key={row.item_id}>
                      <td>
                        <span className="primary">{row.name}</span>
                        <small className="muted"> {row.code}</small>
                      </td>
                      <td>{categoryLabel(row.category)}</td>
                      <td className="num">{formatQty(row.on_hand, row.stock_unit)}</td>
                      <td className="num">{formatQty(row.reorder_level, row.stock_unit)}</td>
                      <td>
                        {row.is_low ? (
                          <Badge tone="amber">Reorder</Badge>
                        ) : (
                          <Badge tone="green">Healthy</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {mayInventory && (
        <section className="panel section-spacer">
          <div className="panel-heading">
            <div>
              <h2>
                Stock movements{" "}
                <span className="count-bubble">{movements.length}</span>
              </h2>
              <p>The append-only ledger — every receipt, use, and shift.</p>
            </div>
            <CsvLink href={csvHref("movements", filters)} />
          </div>
          {movements.length === 0 ? (
            <EmptyRow />
          ) : (
            <div className="table-scroll">
              <table className="record-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Item</th>
                    <th>Lot</th>
                    <th>Type</th>
                    <th className="num">Quantity</th>
                    <th>Reference</th>
                    <th>Recorded by</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.created_at)}</td>
                      <td>
                        <span className="primary">{row.item_name}</span>
                      </td>
                      <td>{row.lot_number ?? "—"}</td>
                      <td>{movementLabel(row.movement_type)}</td>
                      <td className="num">
                        {formatQty(row.quantity_delta, row.stock_unit)}
                      </td>
                      <td>{row.reference || "—"}</td>
                      <td>{row.created_by_name ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {mayProduction && (
        <section className="panel section-spacer">
          <div className="panel-heading">
            <div>
              <h2>
                Production summary{" "}
                <span className="count-bubble">{production.length}</span>
              </h2>
              <p>Output, consumption, and wastage per batch line.</p>
            </div>
            <CsvLink href={csvHref("production", filters)} />
          </div>
          {production.length === 0 ? (
            <EmptyRow />
          ) : (
            <div className="table-scroll">
              <table className="record-table">
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Date</th>
                    <th>Output</th>
                    <th className="num">Produced</th>
                    <th className="num">Inputs used</th>
                    <th className="num">Wastage</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {production.map((row, index) => {
                    const badge = batchStatus(row.status);
                    return (
                      <tr key={`${row.batch_id}-${index}`}>
                        <td>
                          <span className="primary">{row.batch_code}</span>
                        </td>
                        <td>{formatDate(row.produced_on)}</td>
                        <td>{row.item_name ?? "—"}</td>
                        <td className="num">
                          {formatQty(row.output_quantity, row.stock_unit ?? undefined)}
                        </td>
                        <td className="num">{formatQty(row.input_quantity)}</td>
                        <td className="num">{formatQty(row.wastage_quantity)}</td>
                        <td>
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {mayExports && (
        <section className="panel section-spacer">
          <div className="panel-heading">
            <div>
              <h2>
                Export sales{" "}
                <span className="count-bubble">{sales.length}</span>
              </h2>
              <p>Orders by buyer, product, and destination country.</p>
            </div>
            <CsvLink href={csvHref("export-sales", filters)} />
          </div>
          {sales.length === 0 ? (
            <EmptyRow />
          ) : (
            <div className="table-scroll">
              <table className="record-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Buyer</th>
                    <th>Country</th>
                    <th>Product</th>
                    <th className="num">Ordered</th>
                    <th className="num">Shipped</th>
                    <th className="num">Value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((row) => {
                    const badge = exportOrderStatus(row.status);
                    return (
                      <tr key={row.order_line_id}>
                        <td>
                          <span className="primary">{row.order_code}</span>
                          <small className="muted"> {formatDate(row.order_date)}</small>
                        </td>
                        <td>{row.buyer_name}</td>
                        <td>{row.destination_country || "—"}</td>
                        <td>{row.item_name}</td>
                        <td className="num">{formatQty(row.quantity, row.stock_unit)}</td>
                        <td className="num">{formatQty(row.shipped_quantity, row.stock_unit)}</td>
                        <td className="num">{formatMoney(row.line_value, row.currency)}</td>
                        <td>
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {mayExports && (
        <section className="panel section-spacer">
          <div className="panel-heading">
            <div>
              <h2>
                Shipment schedule{" "}
                <span className="count-bubble">{shipments.length}</span>
              </h2>
              <p>Containers planned, dispatched, and delivered.</p>
            </div>
            <CsvLink href={csvHref("shipments", filters)} />
          </div>
          {shipments.length === 0 ? (
            <EmptyRow />
          ) : (
            <div className="table-scroll">
              <table className="record-table">
                <thead>
                  <tr>
                    <th>Shipment</th>
                    <th>Buyer</th>
                    <th>Route</th>
                    <th>ETD / ETA</th>
                    <th className="num">Planned</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((row) => {
                    const badge = shipmentStatus(row.status);
                    return (
                      <tr key={row.id}>
                        <td>
                          <span className="primary">{row.code}</span>
                          <small className="muted"> {row.order_code}</small>
                        </td>
                        <td>
                          {row.buyer_name}
                          {row.destination_country ? ` · ${row.destination_country}` : ""}
                        </td>
                        <td>
                          {row.port_of_loading || "—"} → {row.port_of_discharge || "—"}
                        </td>
                        <td>
                          {formatDate(row.etd)} / {formatDate(row.eta)}
                        </td>
                        <td className="num">{formatQty(row.planned_quantity)}</td>
                        <td>
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {mayFinance && (
        <>
          <section className="panel section-spacer">
            <div className="panel-heading">
              <div>
                <h2>
                  Overdue documents{" "}
                  <span className="count-bubble">{overdue.length}</span>
                </h2>
                <p>Invoices and bills past their due date, not yet paid.</p>
              </div>
              <CsvLink href={csvHref("overdue", filters)} />
            </div>
            {overdue.length === 0 ? (
              <EmptyRow message="Nothing is overdue. Beautiful." />
            ) : (
              <div className="table-scroll">
                <table className="record-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Party</th>
                      <th>Due</th>
                      <th className="num">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdue.map((row) => (
                      <tr key={`${row.document_type}-${row.id}`}>
                        <td>
                          <span className="primary">{row.code}</span>
                          <small className="muted">
                            {" "}
                            {row.document_type === "export_invoice"
                              ? "Invoice"
                              : "Bill"}
                          </small>
                        </td>
                        <td>{row.party_name}</td>
                        <td>{formatDate(row.due_date)}</td>
                        <td className="num">
                          {formatMoney(row.outstanding, row.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel section-spacer">
            <div className="panel-heading">
              <div>
                <h2>
                  Unapplied balances{" "}
                  <span className="count-bubble">{unapplied.length}</span>
                </h2>
                <p>Advances and installments waiting to be allocated.</p>
              </div>
              <CsvLink href={csvHref("unapplied", filters)} />
            </div>
            {unapplied.length === 0 ? (
              <EmptyRow message="Every payment and receipt is fully allocated." />
            ) : (
              <div className="table-scroll">
                <table className="record-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Party</th>
                      <th>Date</th>
                      <th className="num">Unapplied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unapplied.map((row) => (
                      <tr key={`${row.entry_type}-${row.id}`}>
                        <td>
                          <span className="primary">{row.code}</span>
                          <small className="muted">
                            {" "}
                            {row.entry_type === "buyer_receipt"
                              ? "Receipt"
                              : "Payment"}
                          </small>
                        </td>
                        <td>{row.party_name}</td>
                        <td>{formatDate(row.entry_date)}</td>
                        <td className="num">
                          {formatMoney(row.unapplied, row.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel section-spacer">
            <div className="panel-heading">
              <div>
                <h2>Statements</h2>
                <p>
                  Supplier payment and buyer receipt statements, grouped by
                  currency.
                </p>
              </div>
            </div>
            <div className="panel-body stack-form">
              <form className="inline-filter" method="get" action="/modules/reports">
                <input type="hidden" name="statement" value="supplier" />
                <select name="party" defaultValue={statementId ?? ""} aria-label="Supplier">
                  <option value="" disabled>
                    Choose a supplier…
                  </option>
                  {supplierOptions.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name} ({supplier.code})
                    </option>
                  ))}
                </select>
                <button type="submit" className="button button-secondary button-small">
                  Show statement
                </button>
              </form>
              <form className="inline-filter" method="get" action="/modules/reports">
                <input type="hidden" name="statement" value="buyer" />
                <select name="party" defaultValue={statementId ?? ""} aria-label="Buyer">
                  <option value="" disabled>
                    Choose a buyer…
                  </option>
                  {buyerOptions.map((buyer) => (
                    <option key={buyer.id} value={buyer.id}>
                      {buyer.name} ({buyer.code})
                    </option>
                  ))}
                </select>
                <button type="submit" className="button button-secondary button-small">
                  Show statement
                </button>
              </form>
            </div>
            {supStatement && (
              <div className="panel-body">
                <h3>
                  {supStatement.supplier?.name} — payment statement
                </h3>
                <StatementTables
                  entries={[
                    ...supStatement.bills.map((bill) => ({
                      entry_date: bill.issue_date,
                      entry_type: "Bill",
                      reference: bill.code,
                      debit: bill.amount,
                      credit: "",
                      currency: bill.currency,
                    })),
                    ...supStatement.payments.map((payment) => ({
                      entry_date: payment.payment_date,
                      entry_type: "Payment",
                      reference: payment.code,
                      debit: "",
                      credit: payment.amount,
                      currency: payment.currency,
                    })),
                  ]}
                  csv={csvHref("supplier-statement", filters, statementId)}
                />
              </div>
            )}
            {buyStatement && (
              <div className="panel-body">
                <h3>{buyStatement.buyer?.name} — receipt statement</h3>
                <StatementTables
                  entries={[
                    ...buyStatement.invoices.map((invoice) => ({
                      entry_date: invoice.issue_date,
                      entry_type: "Invoice",
                      reference: invoice.code,
                      debit: invoice.amount,
                      credit: "",
                      currency: invoice.currency,
                    })),
                    ...buyStatement.receipts.map((receipt) => ({
                      entry_date: receipt.receipt_date,
                      entry_type: "Receipt",
                      reference: receipt.code,
                      debit: "",
                      credit: receipt.amount,
                      currency: receipt.currency,
                    })),
                  ]}
                  csv={csvHref("buyer-statement", filters, statementId)}
                />
              </div>
            )}
          </section>
        </>
      )}
      {mayFinance && !supStatement && !buyStatement && query.toString() && (
        <p className="form-note">
          Tip: pick a supplier or buyer above to see their full statement.
        </p>
      )}
    </>
  );
}
