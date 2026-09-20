import { requirePermission } from "@/lib/workspace";
import { listSuppliers } from "@/lib/records";
import { can } from "@/lib/permissions";
import { PageHeading } from "@/components/ui";
import { SuppliersDirectory } from "@/components/suppliers-ui";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const actor = await requirePermission("suppliers.view");
  const suppliers = await listSuppliers();
  return (
    <>
      <PageHeading
        eyebrow="PARTNERS"
        title="Suppliers"
        description="Your raw-material partners, contacts, and purchase history."
      />
      <SuppliersDirectory
        suppliers={suppliers}
        preview={actor.preview}
        canManage={can(actor.permissions, "suppliers.manage")}
      />
    </>
  );
}
