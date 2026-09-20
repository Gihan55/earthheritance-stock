import { requirePermission } from "@/lib/workspace";
import {
  getLotBalances,
  listAdjustments,
  listItemCatalog,
} from "@/lib/records";
import { can } from "@/lib/permissions";
import { PageHeading } from "@/components/ui";
import { AdjustmentTable } from "@/components/adjustments-ui";
import {
  AdjustmentRequestPanel,
  InventoryNav,
} from "@/components/inventory/components";

export const metadata = { title: "Inventory · Adjustments" };

export default async function InventoryAdjustmentsPage() {
  const actor = await requirePermission("inventory.view");
  const [adjustments, items, lots] = await Promise.all([
    listAdjustments(),
    listItemCatalog(),
    getLotBalances(),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="OPERATIONS"
        title="Stock adjustments"
        description="Correct counted stock. Managers approve or reject each request."
      >
        <AdjustmentRequestPanel actor={actor} items={items} lots={lots} />
      </PageHeading>
      <InventoryNav
        pathname="/modules/inventory/adjustments"
        permissions={actor.permissions}
      />
      <AdjustmentTable
        adjustments={adjustments}
        canApprove={can(actor.permissions, "inventory.approve")}
        preview={actor.preview}
      />
    </>
  );
}
