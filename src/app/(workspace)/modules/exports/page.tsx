import { requirePermission } from "@/lib/workspace";
import {
  activeBuyerOptions,
  activeItemOptions,
  listExportOrders,
} from "@/lib/records";
import { can } from "@/lib/permissions";
import { PageHeading } from "@/components/ui";
import { ExportOrdersTable, ExportOrderCreate } from "@/components/exports-ui";

export const metadata = { title: "Exports & shipments" };

export default async function ExportsPage() {
  const actor = await requirePermission("exports.view");
  const [orders, buyers, itemOptions] = await Promise.all([
    listExportOrders(),
    activeBuyerOptions(),
    activeItemOptions(),
  ]);
  const finished = itemOptions
    .filter((item) => item.category === "finished_product")
    .map((item) => ({
      id: item.id,
      name: item.name,
      code: item.code,
      stock_unit: item.stock_unit,
    }));
  const canManage = can(actor.permissions, "exports.manage");
  return (
    <>
      <PageHeading
        eyebrow="OPERATIONS"
        title="Exports & shipments"
        description="A clear path from your warehouse to the world — orders, containers, and invoices."
      >
        {canManage && !actor.preview && (
          <ExportOrderCreate
            preview={actor.preview}
            buyers={buyers}
            items={finished}
          />
        )}
      </PageHeading>
      <ExportOrdersTable orders={orders} />
    </>
  );
}
