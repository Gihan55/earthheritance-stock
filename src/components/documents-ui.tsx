import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "./reports-ui";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import type { InvoiceDocument, PackingListDocument } from "@/lib/records";

function Letterhead({
  company,
  title,
  subtitle,
}: {
  company: InvoiceDocument["company"];
  title: string;
  subtitle: string;
}) {
  return (
    <header className="doc-header">
      <div>
        <p className="eyebrow">{company?.name ?? "Your company"}</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      <div className="doc-company">
        {company ? (
          <>
            <strong>{company.name}</strong>
            {company.address && <span>{company.address}</span>}
            {company.country && <span>{company.country}</span>}
            {(company.phone || company.email) && (
              <span>
                {company.phone}
                {company.phone && company.email ? " · " : ""}
                {company.email}
              </span>
            )}
          </>
        ) : (
          <span className="muted">
            Company details are configured in Settings.
          </span>
        )}
      </div>
    </header>
  );
}

function DocMeta({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="doc-meta">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function InvoiceDocumentView({ doc }: { doc: InvoiceDocument }) {
  const { invoice, buyer, shipment, order, lines } = doc;
  const totalQuantity = lines.reduce((sum, line) => sum + Number(line.quantity), 0);
  return (
    <article className="doc-sheet">
      <div className="doc-toolbar no-print">
        <Link
          href={`/modules/exports/${invoice.order_id}`}
          className="button button-secondary button-small"
        >
          <ArrowLeft size={15} /> Back
        </Link>
        <PrintButton />
      </div>
      <Letterhead company={doc.company} title="Commercial invoice" subtitle={invoice.code} />
      <div className="doc-parties">
        <section>
          <h2>Invoice to</h2>
          {buyer ? (
            <address>
              <strong>{buyer.name}</strong>
              {buyer.code && <span>({buyer.code})</span>}
              {buyer.billing_address && <span>{buyer.billing_address}</span>}
              {buyer.contact_person && <span>Attn: {buyer.contact_person}</span>}
              {(buyer.phone || buyer.email) && (
                <span>
                  {buyer.phone}
                  {buyer.phone && buyer.email ? " · " : ""}
                  {buyer.email}
                </span>
              )}
              {buyer.tax_id && <span>Tax ID: {buyer.tax_id}</span>}
            </address>
          ) : (
            <p className="muted">Buyer not recorded.</p>
          )}
        </section>
        <DocMeta
          rows={[
            ["Invoice no.", invoice.code],
            ["Issue date", formatDate(invoice.issue_date)],
            ["Due date", formatDate(invoice.due_date)],
            ["Order", order?.code ?? "—"],
            ["Shipment", shipment?.code ?? "—"],
            ["Incoterms", order?.incoterms ?? "—"],
            ["Destination", order?.destination_country ?? "—"],
            ["Currency", `${invoice.currency} (rate ${invoice.exchange_rate})`],
          ]}
        />
      </div>
      {shipment && (
        <p className="doc-route">
          {[
            shipment.container_number && `Container ${shipment.container_number}`,
            shipment.vessel && `Vessel ${shipment.vessel}`,
            (shipment.port_of_loading || shipment.port_of_discharge) &&
              `${shipment.port_of_loading || "?"} → ${shipment.port_of_discharge || "?"}`,
            shipment.bl_reference && `B/L ${shipment.bl_reference}`,
            shipment.dispatched_on && `Dispatched ${formatDate(shipment.dispatched_on)}`,
          ]
            .filter(Boolean)
            .join(" · ") || "Shipment details pending."}
        </p>
      )}
      <div className="table-scroll">
        <table className="record-table doc-lines">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th className="num">Quantity</th>
              <th className="num">Unit price</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${line.description}-${index}`}>
                <td>{index + 1}</td>
                <td>{line.description}</td>
                <td className="num">{formatQty(line.quantity)}</td>
                <td className="num">{formatMoney(line.unit_price, invoice.currency)}</td>
                <td className="num">{formatMoney(line.amount, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {(Number(invoice.subtotal) !== 0 || lines.length > 0) && (
              <tr>
                <td colSpan={4}>Subtotal</td>
                <td className="num">{formatMoney(invoice.subtotal, invoice.currency)}</td>
              </tr>
            )}
            {Number(invoice.discount) > 0 && (
              <tr>
                <td colSpan={4}>Discount</td>
                <td className="num">−{formatMoney(invoice.discount, invoice.currency)}</td>
              </tr>
            )}
            {Number(invoice.tax) > 0 && (
              <tr>
                <td colSpan={4}>Tax</td>
                <td className="num">{formatMoney(invoice.tax, invoice.currency)}</td>
              </tr>
            )}
            <tr className="doc-total">
              <td colSpan={4}>Total due</td>
              <td className="num">{formatMoney(invoice.amount, invoice.currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {invoice.notes && (
        <section className="doc-notes">
          <h2>Notes</h2>
          <p>{invoice.notes}</p>
        </section>
      )}
      <footer className="doc-sign">
        <div>
          <span>Authorized by</span>
        </div>
        <div>
          <span>Received by</span>
        </div>
      </footer>
      <p className="doc-footnote muted">
        {totalQuantity > 0 ? `${formatQty(String(totalQuantity))} in total · ` : ""}
        Generated by the export management system. Errors and omissions excepted.
      </p>
    </article>
  );
}

export function PackingDocumentView({ doc }: { doc: PackingListDocument }) {
  const { shipment, buyer, order, lines } = doc;
  const totalQuantity = lines.reduce((sum, line) => sum + Number(line.quantity), 0);
  return (
    <article className="doc-sheet">
      <div className="doc-toolbar no-print">
        <Link
          href={`/modules/exports/${shipment.order_id}`}
          className="button button-secondary button-small"
        >
          <ArrowLeft size={15} /> Back
        </Link>
        <PrintButton />
      </div>
      <Letterhead
        company={doc.company}
        title="Packing list"
        subtitle={`${shipment.code}${shipment.bl_reference ? ` · B/L ${shipment.bl_reference}` : ""}`}
      />
      <div className="doc-parties">
        <section>
          <h2>Deliver to</h2>
          {buyer ? (
            <address>
              <strong>{buyer.name}</strong>
              {buyer.code && <span>({buyer.code})</span>}
              {buyer.shipping_address && <span>{buyer.shipping_address}</span>}
              {buyer.destination_country && <span>{buyer.destination_country}</span>}
              {buyer.contact_person && <span>Attn: {buyer.contact_person}</span>}
              {(buyer.phone || buyer.email) && (
                <span>
                  {buyer.phone}
                  {buyer.phone && buyer.email ? " · " : ""}
                  {buyer.email}
                </span>
              )}
            </address>
          ) : (
            <p className="muted">Buyer not recorded.</p>
          )}
        </section>
        <DocMeta
          rows={[
            ["Shipment no.", shipment.code],
            ["Order", order?.code ?? "—"],
            ["Dispatched", formatDate(shipment.dispatched_on)],
            ["ETD / ETA", `${formatDate(shipment.etd)} / ${formatDate(shipment.eta)}`],
            ["Route", `${shipment.port_of_loading || "?"} → ${shipment.port_of_discharge || "?"}`],
            ["Vessel", shipment.vessel],
            ["Incoterms", order?.incoterms ?? "—"],
          ]}
        />
      </div>
      <div className="table-scroll">
        <table className="record-table doc-lines">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Lot</th>
              <th className="num">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${line.item_code}-${line.lot_number}-${index}`}>
                <td>{index + 1}</td>
                <td>
                  {line.item_name}
                  {line.item_code && <span className="sub">{line.item_code}</span>}
                </td>
                <td>{line.lot_number || "—"}</td>
                <td className="num">{formatQty(line.quantity, line.stock_unit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="doc-total">
              <td colSpan={3}>Total quantity</td>
              <td className="num">{formatQty(String(totalQuantity))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <section className="doc-cargo">
        <h2>Cargo summary</h2>
        <dl className="doc-meta">
          <div>
            <dt>Container / seal</dt>
            <dd>
              {shipment.container_number || "—"}
              {shipment.seal_number ? ` / ${shipment.seal_number}` : ""}
            </dd>
          </div>
          <div>
            <dt>Packages</dt>
            <dd>{shipment.package_count ?? "—"}</dd>
          </div>
          <div>
            <dt>Net weight</dt>
            <dd>
              {shipment.net_weight_kg ? `${formatQty(shipment.net_weight_kg, "kg")}` : "—"}
            </dd>
          </div>
          <div>
            <dt>Gross weight</dt>
            <dd>
              {shipment.gross_weight_kg
                ? `${formatQty(shipment.gross_weight_kg, "kg")}`
                : "—"}
            </dd>
          </div>
        </dl>
      </section>
      {shipment.notes && (
        <section className="doc-notes">
          <h2>Notes</h2>
          <p>{shipment.notes}</p>
        </section>
      )}
      <footer className="doc-sign">
        <div>
          <span>Packed by</span>
        </div>
        <div>
          <span>Checked by</span>
        </div>
      </footer>
      <p className="doc-footnote muted">
        Generated by the export management system. Errors and omissions excepted.
      </p>
    </article>
  );
}
