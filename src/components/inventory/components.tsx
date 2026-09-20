import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  Package,
} from "lucide-react";
import type {
  MovementRow,
  PurchaseDetail,
  PurchaseLineRow,
  ReceiptRow,
  StockBalance,
} from "@/lib/records";
import {
  categoryLabel,
  formatDate,
  formatDateTime,
  formatMoney,
  formatQty,
  movementLabel,
  purchaseStatus,
} from "@/lib/format";
import { can, type Permission } from "@/lib/permissions";
import { Badge } from "@/components/ui";
import { AdjustmentRequestForm } from "@/components/adjustments-ui";
import {
  PurchaseForm,
  PurchaseStatusActions,
  ReceiptForm,
} from "@/components/purchasing-ui";

const TABS = [
  {
    href: "/modules/inventory",
    label: "Stock overview",
    icon: LayoutDashboard,
    permission: "inventory.view" as Permission,
  },
  {
    href: "/modules/inventory/items",
    label: "Items",
    icon: Package,
    permission: "inventory.view" as Permission,
  },
  {
    href: "/modules/inventory/adjustments",
    label: "Adjustments",
    icon: Boxes,
    permission: "inventory.view" as Permission,
  },
  {
    href: "/modules/inventory/purchases",
    label: "Purchase orders",
    icon: ClipboardList,
    permission: "suppliers.view" as Permission,
  },
];

export function InventoryNav({
  pathname,
  permissions,
}: {
  pathname: string;
  permissions: readonly string[];
}) {
  const tabs = TABS.filter((tab) => can(permissions, tab.permission));
  return (
    <nav className="subnav" aria-label="Inventory sections">
      {tabs.map((tab) => {
        const active =
          tab.href === "/modules/inventory"
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? "active" : ""}
            aria-current={active ? "page" : undefined}
          >
            <tab.icon size={15} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function StockBalancesTable({ balances }: { balances: StockBalance[] }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>
            Stock on hand{" "}
            <span className="count-bubble">{balances.length}</span>
          </h2>
          <p>
            Balances are derived from the movement ledger and cannot be edited
            directly.
          </p>
        </div>
      </div>
      {balances.length === 0 ? (
        <div className="panel-body muted">
          No stock yet. Record opening stock or receive goods against a purchase
          order to see balances here.
        </div>
      ) : (
        <div className="table-scroll">
          <table className="record-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th className="num">On hand</th>
                <th className="num">Available</th>
                <th className="num">Reorder level</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((balance) => (
                <tr key={balance.item_id}>
                  <td>
                    <span className="primary">{balance.name}</span>
                    <span className="sub">{balance.code}</span>
                  </td>
                  <td>{categoryLabel(balance.category)}</td>
                  <td className="num">
                    {formatQty(balance.on_hand, balance.stock_unit)}
                    {balance.is_low && (
                      <span className="sub">
                        <Badge tone="amber">Reorder</Badge>
                      </span>
                    )}
                  </td>
                  <td className="num">
                    {formatQty(balance.available, balance.stock_unit)}
                  </td>
                  <td className="num">
                    {formatQty(balance.reorder_level, balance.stock_unit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function MovementLedgerTable({
  movements,
}: {
  movements: MovementRow[];
}) {
  return (
    <section className="panel section-spacer">
      <div className="panel-heading">
        <div>
          <h2>Recent movements</h2>
          <p>The latest entries in the append-only stock ledger.</p>
        </div>
      </div>
      {movements.length === 0 ? (
        <div className="panel-body muted">No stock movements recorded yet.</div>
      ) : (
        <div className="table-scroll">
          <table className="record-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Item</th>
                <th>Type</th>
                <th className="num">Change</th>
                <th>Reference</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => {
                const positive = Number(movement.quantity_delta) >= 0;
                return (
                  <tr key={movement.id}>
                    <td>{formatDateTime(movement.created_at)}</td>
                    <td>
                      <span className="primary">{movement.item_name}</span>
                      <span className="sub">{movement.item_code}</span>
                    </td>
                    <td>{movementLabel(movement.movement_type)}</td>
                    <td className="num">
                      <span className={positive ? "delta-pos" : "delta-neg"}>
                        {positive ? (
                          <ArrowUpRight size={13} />
                        ) : (
                          <ArrowDownLeft size={13} />
                        )}{" "}
                        {formatQty(
                          movement.quantity_delta,
                          movement.stock_unit,
                        )}
                      </span>
                    </td>
                    <td>
                      {movement.lot_number ? `Lot ${movement.lot_number}` : "—"}
                    </td>
                    <td>{movement.created_by_name ?? "—"}</td>
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

export function AdjustmentRequestPanel({
  actor,
  items,
  lots,
}: {
  actor: { preview: boolean; permissions: readonly string[] };
  items: Parameters<typeof AdjustmentRequestForm>[0]["items"];
  lots: Parameters<typeof AdjustmentRequestForm>[0]["lots"];
}) {
  if (!can(actor.permissions, "inventory.manage") || actor.preview) return null;
  return (
    <div className="detail-actions">
      <AdjustmentRequestForm
        preview={actor.preview}
        items={items}
        lots={lots}
      />
    </div>
  );
}

export function PurchaseCreate({
  actor,
  suppliers,
  items,
}: {
  actor: { preview: boolean; permissions: readonly string[] };
  suppliers: Parameters<typeof PurchaseForm>[0]["suppliers"];
  items: Parameters<typeof PurchaseForm>[0]["items"];
}) {
  if (!can(actor.permissions, "purchasing.manage") || actor.preview)
    return null;
  return (
    <PurchaseForm preview={actor.preview} suppliers={suppliers} items={items} />
  );
}

export function PurchaseHeader({
  detail,
  actor,
}: {
  detail: PurchaseDetail;
  actor: { preview: boolean; permissions: readonly string[] };
}) {
  const badge = purchaseStatus(detail.purchase.status);
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
        <Link
          href="/modules/inventory/purchases"
          className="button button-secondary"
        >
          <ArrowUpRight size={16} /> All purchase orders
        </Link>
        {can(actor.permissions, "purchasing.manage") && !actor.preview && (
          <PurchaseStatusActions
            purchaseId={detail.purchase.id}
            status={detail.purchase.status}
            preview={actor.preview}
          />
        )}
      </div>
      <dl className="definition-grid section-spacer">
        <div>
          <dt>Supplier</dt>
          <dd>{detail.purchase.supplier?.name ?? "—"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </dd>
        </div>
        <div>
          <dt>Order date</dt>
          <dd>{formatDate(detail.purchase.order_date)}</dd>
        </div>
        <div>
          <dt>Expected date</dt>
          <dd>{formatDate(detail.purchase.expected_date)}</dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>{detail.purchase.currency}</dd>
        </div>
        <div>
          <dt>Order value</dt>
          <dd>{formatMoney(total, detail.purchase.currency)}</dd>
        </div>
      </dl>
      {detail.purchase.notes && (
        <p className="muted section-spacer">
          <strong>Notes:</strong> {detail.purchase.notes}
        </p>
      )}
    </section>
  );
}

export function PurchaseLinesTable({ lines }: { lines: PurchaseLineRow[] }) {
  return (
    <section className="panel section-spacer">
      <div className="panel-heading">
        <div>
          <h2>Ordered items</h2>
          <p>Quantities ordered versus already received.</p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="record-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Ordered</th>
              <th className="num">Received</th>
              <th className="num">Unit price</th>
              <th className="num">Line total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>
                  <span className="primary">{line.item?.name ?? "—"}</span>
                  <span className="sub">{line.item?.code}</span>
                </td>
                <td className="num">
                  {formatQty(line.quantity, line.item?.stock_unit)}
                </td>
                <td className="num">
                  {formatQty(line.received_quantity, line.item?.stock_unit)}
                </td>
                <td className="num">{formatMoney(line.unit_price)}</td>
                <td className="num">
                  {formatMoney(Number(line.quantity) * Number(line.unit_price))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ReceiptHistory({ receipts }: { receipts: ReceiptRow[] }) {
  return (
    <section className="panel section-spacer">
      <div className="panel-heading">
        <div>
          <h2>Goods receipts</h2>
          <p>Deliveries recorded against this order.</p>
        </div>
      </div>
      {receipts.length === 0 ? (
        <div className="panel-body muted">No goods have been received yet.</div>
      ) : (
        <div className="table-scroll">
          <table className="record-table">
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Date</th>
                <th>Supplier reference</th>
                <th className="num">Lines</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.id}>
                  <td>
                    <span className="primary">{receipt.code}</span>
                    <span className="sub">
                      <Link
                        href={`/modules/files/goods_receipt/${receipt.id}`}
                      >
                        Files
                      </Link>
                    </span>
                  </td>
                  <td>{formatDate(receipt.receipt_date)}</td>
                  <td>{receipt.supplier_reference || "—"}</td>
                  <td className="num">{receipt.goods_receipt_lines.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ReceiveGoodsPanel({
  detail,
  actor,
}: {
  detail: PurchaseDetail;
  actor: { preview: boolean; permissions: readonly string[] };
}) {
  const open =
    (detail.purchase.status === "confirmed" ||
      detail.purchase.status === "partially_received") &&
    detail.lines.some(
      (line) => Number(line.received_quantity) < Number(line.quantity),
    );
  if (!open || !can(actor.permissions, "purchasing.manage") || actor.preview)
    return null;
  return (
    <div className="detail-actions section-spacer">
      <ReceiptForm
        purchaseId={detail.purchase.id}
        lines={detail.lines}
        preview={actor.preview}
      />
    </div>
  );
}
