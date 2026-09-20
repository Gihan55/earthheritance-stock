import { notFound } from "next/navigation";
import Link from "next/link";
import { FolderLock } from "lucide-react";
import { requirePermission } from "@/lib/workspace";
import { getExportOrder, getLotBalances } from "@/lib/records";
import { can } from "@/lib/permissions";
import { Badge, PageHeading } from "@/components/ui";
import { exportOrderStatus } from "@/lib/format";
import {
  InvoicesPanel,
  OrderLinesTable,
  OrderStatusActions,
  OrderSummary,
  ShipmentsPanel,
} from "@/components/exports-ui";

export const metadata = { title: "Export order" };

export default async function ExportOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requirePermission("exports.view");
  const [detail, lots] = await Promise.all([
    getExportOrder(id),
    getLotBalances(["finished_product"]),
  ]);
  if (!detail) notFound();
  const badge = exportOrderStatus(detail.order.status);
  const canManage = can(actor.permissions, "exports.manage");
  return (
    <>
      <PageHeading
        eyebrow="EXPORT ORDER"
        title={detail.order.code}
        description={`${detail.order.buyer?.name ?? "Buyer"} · ${detail.order.currency}`}
      >
        <Badge tone={badge.tone}>{badge.label}</Badge>
        <Link className="button button-ghost" href={`/modules/files/export_order/${id}`}>
          <FolderLock size={15} /> Files
        </Link>
      </PageHeading>
      {canManage && !actor.preview && (
        <div className="section-spacer">
          <OrderStatusActions detail={detail} preview={actor.preview} />
        </div>
      )}
      <OrderSummary detail={detail} />
      <OrderLinesTable detail={detail} />
      <ShipmentsPanel
        detail={detail}
        lots={lots}
        canManage={canManage}
        preview={actor.preview}
      />
      <InvoicesPanel
        detail={detail}
        canManage={canManage}
        preview={actor.preview}
      />
    </>
  );
}
