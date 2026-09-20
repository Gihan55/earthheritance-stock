import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/workspace";
import { getBuyerDetail } from "@/lib/records";
import { can } from "@/lib/permissions";
import { Badge, PageHeading } from "@/components/ui";
import {
  BuyerActiveToggle,
  BuyerHistory,
  BuyerSummary,
} from "@/components/buyers-ui";

export const metadata = { title: "Buyer profile" };

export default async function BuyerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requirePermission("buyers.view");
  const detail = await getBuyerDetail(id);
  if (!detail) notFound();
  const canManage = can(actor.permissions, "buyers.manage");
  return (
    <>
      <PageHeading
        eyebrow="BUYER PROFILE"
        title={detail.buyer.name}
        description={`${detail.buyer.code} · export partner`}
      >
        <Badge tone={detail.buyer.is_active ? "green" : "neutral"}>
          {detail.buyer.is_active ? "Active" : "Inactive"}
        </Badge>
      </PageHeading>
      {!actor.preview && (
        <Link href="/modules/buyers" className="inline-link">
          <ArrowLeft size={14} /> Back to buyers
        </Link>
      )}
      <div className="section-spacer" />
      <BuyerSummary
        buyer={detail.buyer}
        canManage={canManage}
        preview={actor.preview}
      />
      {canManage && !actor.preview && (
        <div className="panel-body detail-actions">
          <BuyerActiveToggle
            buyer={{
              id: detail.buyer.id,
              is_active: detail.buyer.is_active,
            }}
            preview={actor.preview}
          />
        </div>
      )}
      <BuyerHistory detail={detail} />
    </>
  );
}
