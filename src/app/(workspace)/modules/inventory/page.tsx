import { requirePermission } from "@/lib/workspace";
import { getInventoryOverview } from "@/lib/records";
import { PageHeading } from "@/components/ui";
import {
  InventoryNav,
  MovementLedgerTable,
  StockBalancesTable,
} from "@/components/inventory/components";

export const metadata = { title: "Inventory" };

export default async function InventoryOverviewPage() {
  const actor = await requirePermission("inventory.view");
  const { balances, movements } = await getInventoryOverview();
  return (
    <>
      <PageHeading
        eyebrow="OPERATIONS"
        title="Inventory"
        description="Know what you have, and what is ready to move."
      />
      <InventoryNav
        pathname="/modules/inventory"
        permissions={actor.permissions}
      />
      <StockBalancesTable balances={balances} />
      <MovementLedgerTable movements={movements} />
    </>
  );
}
