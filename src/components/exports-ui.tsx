"use client";
import Link from "next/link";
import { useActionState, useId, useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleCheck,
  Plus,
  Send,
  Ship,
  Truck,
  X,
} from "lucide-react";
import {
  cancelExportOrder,
  closeExportOrder,
  confirmExportOrder,
  createExportOrder,
  createInvoice,
  createShipment,
  dispatchShipment,
  markShipmentDelivered,
  markShipmentReady,
} from "@/app/actions";
import { INITIAL_STATE } from "@/lib/validation";
import type {
  ExportOrderDetail,
  ExportOrderRow,
  LotOption,
  ShipmentRow,
} from "@/lib/records";
import {
  exportOrderStatus,
  formatDate,
  formatMoney,
  formatQty,
  paymentState,
  shipmentStatus,
} from "@/lib/format";
import { Badge, EmptyState } from "./ui";
import { Modal } from "./client-modal";
import { Feedback, PreviewNote, SubmitButton } from "./forms";
import { LineEditor } from "./purchasing-ui";

const CURRENCIES = ["USD", "LKR", "INR", "EUR", "GBP", "AED", "AUD", "CAD", "SGD"];
type BuyerOption = {
  id: string;
  code: string;
  name: string;
  preferred_currency: string;
  destination_country: string;
};
type ItemOption = { id: string; name: string; code: string; stock_unit: string };

export function ExportOrdersTable({ orders }: { orders: ExportOrderRow[] }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>
            Export orders <span className="count-bubble">{orders.length}</span>
          </h2>
          <p>Every order from enquiry to dispatch, in one pipeline.</p>
        </div>
      </div>
      {orders.length === 0 ? (
        <EmptyState
          icon="exports"
          title="No export orders yet"
          description="Create an order for a buyer to reserve finished stock and plan a shipment."
        />
      ) : (
        <div className="table-scroll">
          <table className="record-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Buyer</th>
                <th>Date</th>
                <th className="num">Ordered</th>
                <th className="num">Shipped</th>
                <th>Currency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const badge = exportOrderStatus(order.status);
                return (
                  <tr key={order.order_id}>
                    <td>
                      <Link
                        href={`/modules/exports/${order.order_id}`}
                        className="primary"
                      >
                        {order.code}
                      </Link>
                    </td>
                    <td>{order.buyer_name}</td>
                    <td>{formatDate(order.order_date)}</td>
                    <td className="num">{formatQty(order.ordered_quantity)}</td>
                    <td className="num">{formatQty(order.shipped_quantity)}</td>
                    <td>{order.currency}</td>
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
  );
}

type OrderLineState = {
  id: string;
  item_id: string;
  quantity: string;
  unit_price: string;
};

export function ExportOrderCreate({
  preview,
  buyers,
  items,
}: {
  preview: boolean;
  buyers: BuyerOption[];
  items: ItemOption[];
}) {
  const [state, action, pending] = useActionState(
    createExportOrder,
    INITIAL_STATE,
  );
  const uid = useId();
  const today = new Date().toISOString().slice(0, 10);
  const [buyerId, setBuyerId] = useState(buyers[0]?.id ?? "");
  const selectedBuyer = buyers.find((buyer) => buyer.id === buyerId);
  const [currencyOverride, setCurrencyOverride] = useState("");
  const currency =
    currencyOverride || selectedBuyer?.preferred_currency || "USD";
  const [rows, setRows] = useState<OrderLineState[]>([
    { id: `${uid}-l0`, item_id: "", quantity: "", unit_price: "" },
  ]);
  const update = (id: string, patch: Partial<OrderLineState>) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  const linesJson = JSON.stringify(
    rows
      .filter((row) => row.item_id && Number(row.quantity) > 0)
      .map((row) => ({
        item_id: row.item_id,
        quantity: Number(row.quantity),
        unit_price: row.unit_price === "" ? 0 : Number(row.unit_price),
      })),
  );
  return (
    <Modal
      buttonLabel="New export order"
      icon={<Plus size={16} />}
      title="Create an export order"
      description="Add the finished products and quantities the buyer has ordered. The order starts as a draft you can confirm to reserve stock."
      wide
    >
      {({ close }) => (
        <form action={action} className="stack-form">
          <div className="form-grid">
            <label>
              Buyer <span className="required">*</span>
              <select
                name="buyer_id"
                required
                value={buyerId}
                onChange={(event) => setBuyerId(event.target.value)}
              >
                <option value="" disabled>
                  Select a buyer…
                </option>
                {buyers.map((buyer) => (
                  <option key={buyer.id} value={buyer.id}>
                    {buyer.name} ({buyer.code})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Currency <span className="required">*</span>
              <input
                name="currency"
                value={currency}
                onChange={(event) =>
                  setCurrencyOverride(event.target.value.toUpperCase())
                }
                maxLength={3}
                minLength={3}
                pattern="[A-Za-z]{3}"
                required
              />
            </label>
            <label>
              Incoterms
              <input
                name="incoterms"
                defaultValue={selectedBuyer ? "" : ""}
                maxLength={40}
                placeholder="e.g. FOB, CIF"
              />
            </label>
            <label>
              Destination country
              <input
                name="destination_country"
                defaultValue=""
                key={buyerId}
                placeholder={selectedBuyer?.destination_country || "Optional"}
                maxLength={80}
                onChange={() => {}}
              />
            </label>
            <label>
              Order date <span className="required">*</span>
              <input type="date" name="order_date" defaultValue={today} required />
            </label>
            <label>
              Requested ship date
              <input type="date" name="requested_ship_date" defaultValue="" />
            </label>
            <label className="full-width">
              Notes
              <textarea name="notes" rows={2} maxLength={2000} />
            </label>
          </div>
          <div className="form-section-title divided">
            <h3>Product lines</h3>
            <p>Choose a finished product, ordered quantity, and unit price.</p>
          </div>
          <LineEditor
            rows={rows}
            addLabel="Add another line"
            canRemove={() => rows.length > 1}
            onChange={update}
            onRemove={(id) =>
              setRows((current) => current.filter((row) => row.id !== id))
            }
            onAdd={() =>
              setRows((current) => [
                ...current,
                {
                  id: `${uid}-n${Date.now()}`,
                  item_id: "",
                  quantity: "",
                  unit_price: "",
                },
              ])
            }
            fields={(row, patch) => (
              <>
                <div className="line-field line-item">
                  <span>Product</span>
                  <select
                    value={row.item_id}
                    onChange={(event) => patch({ item_id: event.target.value })}
                  >
                    <option value="">Select product…</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.code}) · {item.stock_unit}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="line-field">
                  <span>Quantity</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={row.quantity}
                    onChange={(event) => patch({ quantity: event.target.value })}
                    placeholder="0"
                  />
                </div>
                <div className="line-field">
                  <span>Unit price</span>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={row.unit_price}
                    onChange={(event) => patch({ unit_price: event.target.value })}
                    placeholder="0"
                  />
                </div>
              </>
            )}
          />
          <input type="hidden" name="lines" value={linesJson} readOnly />
          <Feedback state={state} />
          {preview && <PreviewNote />}
          <div className="form-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={close}
            >
              Cancel
            </button>
            <SubmitButton pending={pending} disabled={preview}>
              Create draft order
            </SubmitButton>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function OrderStatusActions({
  detail,
  preview,
}: {
  detail: ExportOrderDetail;
  preview: boolean;
}) {
  const status = detail.order.status;
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmExportOrder,
    INITIAL_STATE,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelExportOrder,
    INITIAL_STATE,
  );
  const [closeState, closeAction, closePending] = useActionState(
    closeExportOrder,
    INITIAL_STATE,
  );
  return (
    <div className="detail-actions">
      {status === "draft" && (
        <form action={confirmAction}>
          <input type="hidden" name="id" value={detail.order.id} />
          <button
            type="submit"
            className="button button-primary"
            disabled={confirmPending || preview}
          >
            <Check size={16} />
            {confirmPending ? "Confirming..." : "Confirm & reserve stock"}
          </button>
          <Feedback state={confirmState} />
        </form>
      )}
      {(status === "draft" || status === "confirmed") && (
        <form action={cancelAction}>
          <input type="hidden" name="id" value={detail.order.id} />
          <button
            type="submit"
            className="button button-secondary"
            disabled={cancelPending || preview}
          >
            <X size={16} />
            {cancelPending ? "Cancelling..." : "Cancel order"}
          </button>
          <Feedback state={cancelState} />
        </form>
      )}
      {(status === "shipped" || status === "partially_shipped") && (
        <form action={closeAction}>
          <input type="hidden" name="id" value={detail.order.id} />
          <button
            type="submit"
            className="button button-secondary"
            disabled={closePending || preview}
          >
            <CircleCheck size={16} />
            {closePending ? "Closing..." : "Close order"}
          </button>
          <Feedback state={closeState} />
        </form>
      )}
    </div>
  );
}

export function OrderSummary({ detail }: { detail: ExportOrderDetail }) {
  const order = detail.order;
  const badge = exportOrderStatus(order.status);
  const total = detail.lines.reduce(
    (sum, line) => sum + Number(line.quantity) * Number(line.unit_price),
    0,
  );
  return (
    <section className="panel panel-body">
      <div
        className="detail-actions"
        style={{ justifyContent: "space-between" }}
      >
        <Link href="/modules/exports" className="button button-secondary">
          <ArrowLeft size={16} /> All export orders
        </Link>
      </div>
      <dl className="definition-grid section-spacer">
        <div>
          <dt>Buyer</dt>
          <dd>{order.buyer?.name ?? "—"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </dd>
        </div>
        <div>
          <dt>Order date</dt>
          <dd>{formatDate(order.order_date)}</dd>
        </div>
        <div>
          <dt>Requested ship date</dt>
          <dd>{formatDate(order.requested_ship_date)}</dd>
        </div>
        <div>
          <dt>Incoterms</dt>
          <dd>{order.incoterms || "—"}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{order.destination_country || "—"}</dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>{order.currency}</dd>
        </div>
        <div>
          <dt>Order value</dt>
          <dd>{formatMoney(total, order.currency)}</dd>
        </div>
      </dl>
      {order.notes && (
        <p className="muted section-spacer">
          <strong>Notes:</strong> {order.notes}
        </p>
      )}
    </section>
  );
}

export function OrderLinesTable({ detail }: { detail: ExportOrderDetail }) {
  return (
    <section className="panel section-spacer">
      <div className="panel-heading">
        <div>
          <h2>Ordered products</h2>
          <p>Reserved, shipped, and still-open quantities per line.</p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="record-table">
          <thead>
            <tr>
              <th>Product</th>
              <th className="num">Ordered</th>
              <th className="num">Reserved</th>
              <th className="num">Shipped</th>
              <th className="num">Unit price</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((line) => {
              const reserved = Number(detail.reservedByLine[line.id] ?? 0);
              return (
                <tr key={line.id}>
                  <td>
                    <span className="primary">{line.item?.name ?? "—"}</span>
                    <span className="sub">{line.item?.code}</span>
                  </td>
                  <td className="num">
                    {formatQty(line.quantity, line.item?.stock_unit)}
                  </td>
                  <td className="num">{formatQty(reserved, line.item?.stock_unit)}</td>
                  <td className="num">
                    {formatQty(line.shipped_quantity, line.item?.stock_unit)}
                  </td>
                  <td className="num">
                    {formatMoney(line.unit_price, detail.order.currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type ShipmentLineState = {
  id: string;
  order_line_id: string;
  lot_id: string;
  quantity: string;
};

export function ShipmentCreate({
  detail,
  lots,
  preview,
}: {
  detail: ExportOrderDetail;
  lots: LotOption[];
  preview: boolean;
}) {
  const [state, action, pending] = useActionState(createShipment, INITIAL_STATE);
  const uid = useId();
  const openLines = detail.lines.filter(
    (line) => Number(line.shipped_quantity) < Number(line.quantity),
  );
  const [rows, setRows] = useState<ShipmentLineState[]>([
    { id: `${uid}-s0`, order_line_id: "", lot_id: "", quantity: "" },
  ]);
  const update = (id: string, patch: Partial<ShipmentLineState>) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  const linesJson = JSON.stringify(
    rows
      .filter((row) => row.order_line_id && row.lot_id && Number(row.quantity) > 0)
      .map((row) => ({
        order_line_id: row.order_line_id,
        lot_id: row.lot_id,
        quantity: Number(row.quantity),
      })),
  );
  return (
    <Modal
      buttonLabel="Plan shipment"
      buttonClass="button button-primary"
      icon={<Ship size={16} />}
      title="Plan a shipment"
      description="Allocate lots from reserved stock to a container. Physical stock is only deducted when you dispatch."
      wide
    >
      {({ close }) => (
        <form action={action} className="stack-form">
          <input type="hidden" name="order_id" value={detail.order.id} />
          <div className="form-grid">
            <label>
              Container number
              <input name="container_number" maxLength={60} />
            </label>
            <label>
              Seal number
              <input name="seal_number" maxLength={60} />
            </label>
            <label>
              Port of loading
              <input name="port_of_loading" maxLength={120} />
            </label>
            <label>
              Port of discharge
              <input name="port_of_discharge" maxLength={120} />
            </label>
            <label>
              Vessel
              <input name="vessel" maxLength={120} />
            </label>
            <label>
              B/L reference
              <input name="bl_reference" maxLength={120} />
            </label>
            <label>
              ETD
              <input type="date" name="etd" defaultValue="" />
            </label>
            <label>
              ETA
              <input type="date" name="eta" defaultValue="" />
            </label>
            <label>
              Packages
              <input type="number" name="package_count" min="0" step="1" />
            </label>
            <label>
              Net weight (kg)
              <input type="number" name="net_weight_kg" min="0" step="0.001" />
            </label>
            <label>
              Gross weight (kg)
              <input type="number" name="gross_weight_kg" min="0" step="0.001" />
            </label>
            <label className="full-width">
              Notes
              <textarea name="notes" rows={2} maxLength={2000} />
            </label>
          </div>
          <div className="form-section-title divided">
            <h3>Load allocation</h3>
            <p>Choose an ordered line, the lot to draw from, and the quantity.</p>
          </div>
          <LineEditor
            rows={rows}
            addLabel="Add shipment line"
            canRemove={() => rows.length > 1}
            onChange={update}
            onRemove={(id) =>
              setRows((current) => current.filter((row) => row.id !== id))
            }
            onAdd={() =>
              setRows((current) => [
                ...current,
                { id: `${uid}-n${Date.now()}`, order_line_id: "", lot_id: "", quantity: "" },
              ])
            }
            fields={(row, patch) => {
              const selectedLine = detail.lines.find(
                (line) => line.id === row.order_line_id,
              );
              return (
                <>
                  <div className="line-field line-item">
                    <span>Ordered line</span>
                    <select
                      value={row.order_line_id}
                      onChange={(event) =>
                        patch({ order_line_id: event.target.value, lot_id: "" })
                      }
                    >
                      <option value="">Select line…</option>
                      {openLines.map((line) => (
                        <option key={line.id} value={line.id}>
                          {line.item?.name} ·{" "}
                          {formatQty(
                            Number(line.quantity) - Number(line.shipped_quantity),
                            line.item?.stock_unit,
                          )}{" "}
                          still open
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="line-field">
                    <span>Lot</span>
                    <select
                      value={row.lot_id}
                      disabled={!selectedLine}
                      onChange={(event) => patch({ lot_id: event.target.value })}
                    >
                      <option value="">
                        {selectedLine ? "Select lot…" : "Choose line first"}
                      </option>
                      {lots
                        .filter((lot) => lot.item_code === selectedLine?.item?.code)
                        .map((lot) => (
                          <option key={lot.lot_id} value={lot.lot_id}>
                            {lot.lot_number} ·{" "}
                            {formatQty(lot.on_hand, lot.stock_unit)} on hand
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="line-field">
                    <span>Quantity</span>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={row.quantity}
                      onChange={(event) => patch({ quantity: event.target.value })}
                      placeholder="0"
                    />
                  </div>
                </>
              );
            }}
          />
          <input type="hidden" name="lines" value={linesJson} readOnly />
          <Feedback state={state} />
          {preview && <PreviewNote />}
          <div className="form-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={close}
            >
              Cancel
            </button>
            <SubmitButton pending={pending} disabled={preview}>
              Plan shipment
            </SubmitButton>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ShipmentStatusActions({
  shipment,
  preview,
}: {
  shipment: ShipmentRow;
  preview: boolean;
}) {
  const [readyState, readyAction, readyPending] = useActionState(
    markShipmentReady,
    INITIAL_STATE,
  );
  const [dispatchState, dispatchAction, dispatchPending] = useActionState(
    dispatchShipment,
    INITIAL_STATE,
  );
  const [deliveredState, deliveredAction, deliveredPending] = useActionState(
    markShipmentDelivered,
    INITIAL_STATE,
  );
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="detail-actions">
      {shipment.status === "draft" && (
        <form action={readyAction}>
          <input type="hidden" name="id" value={shipment.id} />
          <button
            type="submit"
            className="button button-secondary"
            disabled={readyPending || preview}
          >
            <Check size={15} />
            {readyPending ? "Saving..." : "Mark ready"}
          </button>
          <Feedback state={readyState} />
        </form>
      )}
      {shipment.status === "ready" && (
        <form action={dispatchAction}>
          <input type="hidden" name="id" value={shipment.id} />
          <label className="sr-only" htmlFor={`dispatch-${shipment.id}`}>
            Dispatch date
          </label>
          <input
            id={`dispatch-${shipment.id}`}
            type="date"
            name="dispatched_on"
            defaultValue={today}
          />
          <button
            type="submit"
            className="button button-primary"
            disabled={dispatchPending || preview}
          >
            <Truck size={15} />
            {dispatchPending ? "Dispatching..." : "Dispatch"}
          </button>
          <Feedback state={dispatchState} />
        </form>
      )}
      {shipment.status === "dispatched" && (
        <form action={deliveredAction}>
          <input type="hidden" name="id" value={shipment.id} />
          <button
            type="submit"
            className="button button-secondary"
            disabled={deliveredPending || preview}
          >
            <Send size={15} />
            {deliveredPending ? "Saving..." : "Mark delivered"}
          </button>
          <Feedback state={deliveredState} />
        </form>
      )}
    </div>
  );
}

export function ShipmentsPanel({
  detail,
  lots,
  canManage,
  preview,
}: {
  detail: ExportOrderDetail;
  lots: LotOption[];
  canManage: boolean;
  preview: boolean;
}) {
  const canPlan =
    canManage &&
    !preview &&
    (detail.order.status === "confirmed" ||
      detail.order.status === "partially_shipped");
  return (
    <section className="panel section-spacer">
      <div className="panel-heading">
        <div>
          <h2>Shipments</h2>
          <p>Containers planned against this order and their dispatch status.</p>
        </div>
        {canPlan && <ShipmentCreate detail={detail} lots={lots} preview={preview} />}
      </div>
      {detail.shipments.length === 0 ? (
        <div className="panel-body muted">
          No shipments planned yet.
        </div>
      ) : (
        <div className="table-scroll">
          <table className="record-table">
            <thead>
              <tr>
                <th>Shipment</th>
                <th>Container / route</th>
                <th className="num">Lines</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {detail.shipments.map((shipment) => {
                const badge = shipmentStatus(shipment.status);
                return (
                  <tr key={shipment.id}>
                    <td>
                      <Link
                        className="primary"
                        href={`/modules/documents/packing/${shipment.id}`}
                      >
                        {shipment.code}
                      </Link>
                      <span className="sub">
                        {shipment.dispatched_on
                          ? `Dispatched ${formatDate(shipment.dispatched_on)}`
                          : `ETD ${formatDate(shipment.etd)}`}
                      </span>
                      <span className="sub">
                        <Link href={`/modules/files/shipment/${shipment.id}`}>
                          Files
                        </Link>
                      </span>
                    </td>
                    <td>
                      {shipment.container_number || "—"}
                      <span className="sub">
                        {shipment.port_of_loading || "?"} →{" "}
                        {shipment.port_of_discharge || "?"}
                      </span>
                    </td>
                    <td className="num">{shipment.shipment_lines.length}</td>
                    <td>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </td>
                    <td>
                      {canManage && !preview && (
                        <ShipmentStatusActions
                          shipment={shipment}
                          preview={preview}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type InvoiceLineState = {
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
};

export function InvoiceCreate({
  detail,
  preview,
}: {
  detail: ExportOrderDetail;
  preview: boolean;
}) {
  const [state, action, pending] = useActionState(createInvoice, INITIAL_STATE);
  const uid = useId();
  const today = new Date().toISOString().slice(0, 10);
  const invoiceable = detail.shipments.filter(
    (shipment) =>
      shipment.status === "dispatched" || shipment.status === "delivered",
  );
  const alreadyInvoiced = new Set(detail.invoices.map((i) => i.code));
  const [shipmentId, setShipmentId] = useState(invoiceable[0]?.id ?? "");
  const [rows, setRows] = useState<InvoiceLineState[]>([
    { id: `${uid}-l0`, description: "", quantity: "", unit_price: "" },
  ]);
  const update = (id: string, patch: Partial<InvoiceLineState>) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  const linesJson = JSON.stringify(
    rows
      .filter(
        (row) =>
          row.description.trim() &&
          Number(row.quantity) > 0,
      )
      .map((row) => ({
        description: row.description,
        quantity: Number(row.quantity),
        unit_price: row.unit_price === "" ? 0 : Number(row.unit_price),
      })),
  );
  const subtotal = rows.reduce(
    (sum, row) => sum + Number(row.quantity || 0) * Number(row.unit_price || 0),
    0,
  );
  if (invoiceable.length === 0) return null;
  return (
    <Modal
      buttonLabel="New invoice"
      buttonClass="button button-primary"
      icon={<Plus size={16} />}
      title="Issue a commercial invoice"
      description="Invoice a dispatched shipment. Already-invoiced shipments can still be credited with additional lines."
      wide
    >
      {({ close }) => (
        <form action={action} className="stack-form">
          <div className="form-grid">
            <label className="full-width">
              Shipment <span className="required">*</span>
              <select
                name="shipment_id"
                required
                value={shipmentId}
                onChange={(event) => setShipmentId(event.target.value)}
              >
                <option value="" disabled>
                  Select a dispatched shipment…
                </option>
                {invoiceable.map((shipment) => (
                  <option key={shipment.id} value={shipment.id}>
                    {shipment.code}
                    {alreadyInvoiced.has(shipment.code) ? " (previously invoiced)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Issue date <span className="required">*</span>
              <input type="date" name="issue_date" defaultValue={today} required />
            </label>
            <label>
              Due date
              <input type="date" name="due_date" defaultValue="" />
            </label>
            <label>
              Currency <span className="required">*</span>
              <input
                name="currency"
                defaultValue={detail.order.currency}
                list="invoice-currency-list"
                maxLength={3}
                minLength={3}
                pattern="[A-Za-z]{3}"
                required
              />
              <datalist id="invoice-currency-list">
                {CURRENCIES.map((currency) => (
                  <option key={currency} value={currency} />
                ))}
              </datalist>
            </label>
            <label>
              Exchange rate
              <input
                type="number"
                name="exchange_rate"
                min="0"
                step="0.000001"
                placeholder="1 (leave blank for 1)"
              />
              <small>Rate to your base currency for reporting.</small>
            </label>
            <label>
              Discount
              <input type="number" name="discount" min="0" step="0.01" placeholder="0" />
            </label>
            <label>
              Tax
              <input type="number" name="tax" min="0" step="0.01" placeholder="0" />
            </label>
            <label className="full-width">
              Notes
              <textarea name="notes" rows={2} maxLength={2000} />
            </label>
          </div>
          <div className="form-section-title divided">
            <h3>Invoice lines</h3>
            <p>
              Describe each charge. Subtotal computes to {formatMoney(subtotal)}.
            </p>
          </div>
          <LineEditor
            rows={rows}
            addLabel="Add invoice line"
            canRemove={() => rows.length > 1}
            onChange={update}
            onRemove={(id) =>
              setRows((current) => current.filter((row) => row.id !== id))
            }
            onAdd={() =>
              setRows((current) => [
                ...current,
                { id: `${uid}-n${Date.now()}`, description: "", quantity: "", unit_price: "" },
              ])
            }
            fields={(row, patch) => (
              <>
                <div className="line-field line-item">
                  <span>Description</span>
                  <input
                    value={row.description}
                    maxLength={200}
                    onChange={(event) => patch({ description: event.target.value })}
                    placeholder="e.g. Cocopeat blocks 5kg × 1200"
                  />
                </div>
                <div className="line-field">
                  <span>Quantity</span>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={row.quantity}
                    onChange={(event) => patch({ quantity: event.target.value })}
                    placeholder="0"
                  />
                </div>
                <div className="line-field">
                  <span>Unit price</span>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={row.unit_price}
                    onChange={(event) => patch({ unit_price: event.target.value })}
                    placeholder="0"
                  />
                </div>
              </>
            )}
          />
          <input type="hidden" name="lines" value={linesJson} readOnly />
          <Feedback state={state} />
          {preview && <PreviewNote />}
          <div className="form-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={close}
            >
              Cancel
            </button>
            <SubmitButton pending={pending} disabled={preview}>
              Issue invoice
            </SubmitButton>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function InvoicesPanel({
  detail,
  canManage,
  preview,
}: {
  detail: ExportOrderDetail;
  canManage: boolean;
  preview: boolean;
}) {
  return (
    <section className="panel section-spacer">
      <div className="panel-heading">
        <div>
          <h2>Invoices</h2>
          <p>Commercial invoices issued against this order.</p>
        </div>
        {canManage && !preview && <InvoiceCreate detail={detail} preview={preview} />}
      </div>
      {detail.invoices.length === 0 ? (
        <div className="panel-body muted">
          No invoices issued yet. Invoice a shipment once it has dispatched.
        </div>
      ) : (
        <div className="table-scroll">
          <table className="record-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Issued</th>
                <th>Due</th>
                <th className="num">Amount</th>
                <th className="num">Outstanding</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {detail.invoices.map((invoice) => {
                const badge = paymentState(invoice.payment_state);
                return (
                  <tr key={invoice.id}>
                    <td>
                      <Link
                        className="primary"
                        href={`/modules/documents/invoice/${invoice.id}`}
                      >
                        {invoice.code}
                      </Link>
                      <span className="sub">
                        <Link
                          href={`/modules/files/export_invoice/${invoice.id}`}
                        >
                          Files
                        </Link>
                      </span>
                    </td>
                    <td>{formatDate(invoice.issue_date)}</td>
                    <td>{formatDate(invoice.due_date)}</td>
                    <td className="num">
                      {formatMoney(invoice.amount, invoice.currency)}
                    </td>
                    <td className="num">
                      {formatMoney(invoice.outstanding, invoice.currency)}
                    </td>
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
  );
}
