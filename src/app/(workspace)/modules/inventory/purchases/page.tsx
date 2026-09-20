import Link from "next/link";
import { requirePermission } from "@/lib/workspace";
import {
  activeItemOptions,
  activeSupplierOptions,
  listPurchases,
} from "@/lib/records";
import { formatDate } from "@/lib/format";
import { purchaseStatus } from "@/lib/format";
import { Badge, PageHeading } from "@/components/ui";
import {
  InventoryNav,
  PurchaseCreate,
} from "@/components/inventory/components";

export const metadata = { title: "Inventory · Purchases" };

export default async function InventoryPurchasesPage() {
  const actor = await requirePermission("suppliers.view");
  const [purchases, suppliers, items] = await Promise.all([
    listPurchases(),
    activeSupplierOptions(),
    activeItemOptions(),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="OPERATIONS"
        title="Purchase orders"
        description="Raise orders with suppliers, confirm them, and receive goods into stock."
      >
        <PurchaseCreate
          actor={actor}
          suppliers={suppliers}
          items={items.map((item) => ({
            id: item.id,
            name: item.name,
            code: item.code,
            stock_unit: item.stock_unit,
          }))}
        />
      </PageHeading>
      <InventoryNav
        pathname="/modules/inventory/purchases"
        permissions={actor.permissions}
      />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              Orders <span className="count-bubble">{purchases.length}</span>
            </h2>
            <p>Newest first.</p>
          </div>
        </div>
        {purchases.length === 0 ? (
          <div className="panel-body muted">
            No purchase orders yet. Create one to start buying from a supplier.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="record-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Supplier</th>
                  <th>Order date</th>
                  <th>Expected</th>
                  <th className="num">Lines</th>
                  <th className="num">Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => {
                  const badge = purchaseStatus(purchase.status);
                  const value = purchase.lines.reduce(
                    (sum, line) =>
                      sum + Number(line.quantity) * Number(line.unit_price),
                    0,
                  );
                  return (
                    <tr key={purchase.id}>
                      <td>
                        <Link
                          href={`/modules/inventory/purchases/${purchase.id}`}
                          className="primary"
                        >
                          {purchase.code}
                        </Link>
                      </td>
                      <td>{purchase.supplier?.name ?? "—"}</td>
                      <td>{formatDate(purchase.order_date)}</td>
                      <td>{formatDate(purchase.expected_date)}</td>
                      <td className="num">{purchase.lines.length}</td>
                      <td className="num">
                        {value.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{" "}
                        {purchase.currency}
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
    </>
  );
}
