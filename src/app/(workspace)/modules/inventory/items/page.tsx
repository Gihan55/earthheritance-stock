import { requirePermission } from "@/lib/workspace";
import { getInventoryOverview, listItemCatalog } from "@/lib/records";
import { can } from "@/lib/permissions";
import { PageHeading } from "@/components/ui";
import { ItemsDirectory } from "@/components/inventory-ui";
import { InventoryNav } from "@/components/inventory/components";

export const metadata = { title: "Inventory · Items" };

export default async function InventoryItemsPage() {
  const actor = await requirePermission("inventory.view");
  const [items, { balances }] = await Promise.all([
    listItemCatalog(),
    getInventoryOverview(),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="OPERATIONS"
        title="Items"
        description="The raw materials and finished products you track in stock."
      />
      <InventoryNav
        pathname="/modules/inventory/items"
        permissions={actor.permissions}
      />
      <ItemsDirectory
        items={items}
        balances={balances}
        preview={actor.preview}
        canManage={can(actor.permissions, "inventory.manage")}
      />
    </>
  );
}
