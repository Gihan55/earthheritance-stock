import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/workspace";
import { getSupplierDetail } from "@/lib/records";
import { can } from "@/lib/permissions";
import { Badge, PageHeading } from "@/components/ui";
import {
  SupplierActiveToggle,
  SupplierHistory,
  SupplierPaymentForm,
  SupplierSummary,
} from "@/components/suppliers-ui";

export const metadata = { title: "Supplier profile" };

export default async function SupplierProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requirePermission("suppliers.view");
  const detail = await getSupplierDetail(id);
  if (!detail) notFound();
  const canManage = can(actor.permissions, "suppliers.manage");
  const canFinance = can(actor.permissions, "finance.manage");
  return (
    <>
      <PageHeading
        eyebrow="SUPPLIER PROFILE"
        title={detail.supplier.name}
        description={`${detail.supplier.code} · raw-material partner`}
      >
        <Badge tone={detail.supplier.is_active ? "green" : "neutral"}>
          {detail.supplier.is_active ? "Active" : "Inactive"}
        </Badge>
      </PageHeading>
      {!actor.preview && (
        <Link href="/modules/suppliers" className="inline-link">
          <ArrowLeft size={14} /> Back to suppliers
        </Link>
      )}
      <div className="section-spacer" />
      <SupplierSummary
        supplier={detail.supplier}
        canManage={canManage}
        preview={actor.preview}
      />
      {canManage && !actor.preview && (
        <div className="panel-body detail-actions">
          <SupplierActiveToggle
            supplier={{
              id: detail.supplier.id,
              name: detail.supplier.name,
              is_active: detail.supplier.is_active,
            }}
            preview={actor.preview}
          />
        </div>
      )}
      {can(actor.permissions, "finance.view") && (
        <section className="panel section-spacer">
          <div className="panel-heading">
            <div>
              <h2>Payment details</h2>
              <p>
                Bank details are only visible to finance and administrator
                roles.
              </p>
            </div>
          </div>
          <div className="panel-body">
            {canFinance ? (
              <SupplierPaymentForm
                supplierId={detail.supplier.id}
                details={detail.paymentDetails}
                preview={actor.preview}
              />
            ) : (
              <p className="muted">
                You have view access to payments but not the ability to edit
                supplier bank details.
              </p>
            )}
          </div>
        </section>
      )}
      <SupplierHistory detail={detail} />
    </>
  );
}
