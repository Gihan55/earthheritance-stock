import { notFound } from "next/navigation";
import Link from "next/link";
import { FolderLock } from "lucide-react";
import { requirePermission } from "@/lib/workspace";
import { getPurchaseDetail } from "@/lib/records";
import { PageHeading } from "@/components/ui";
import {
  InventoryNav,
  PurchaseHeader,
  PurchaseLinesTable,
  ReceiptHistory,
  ReceiveGoodsPanel,
} from "@/components/inventory/components";

export const metadata = { title: "Purchase order" };

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requirePermission("suppliers.view");
  const detail = await getPurchaseDetail(id);
  if (!detail) notFound();
  return (
    <>
      <PageHeading
        eyebrow="PURCHASE ORDER"
        title={detail.purchase.code}
        description={detail.purchase.supplier?.name ?? "Supplier"}
      >
        <Link className="button button-ghost" href={`/modules/files/purchase/${id}`}>
          <FolderLock size={15} /> Files
        </Link>
      </PageHeading>
      <InventoryNav
        pathname="/modules/inventory/purchases"
        permissions={actor.permissions}
      />
      <PurchaseHeader detail={detail} actor={actor} />
      <PurchaseLinesTable lines={detail.lines} />
      <ReceiveGoodsPanel detail={detail} actor={actor} />
      <ReceiptHistory receipts={detail.receipts} />
    </>
  );
}
