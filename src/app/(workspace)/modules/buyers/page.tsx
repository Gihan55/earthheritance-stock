import { requirePermission } from "@/lib/workspace";
import { listBuyers } from "@/lib/records";
import { can } from "@/lib/permissions";
import { PageHeading } from "@/components/ui";
import { BuyersDirectory } from "@/components/buyers-ui";

export const metadata = { title: "Buyers" };

export default async function BuyersPage() {
  const actor = await requirePermission("buyers.view");
  const buyers = await listBuyers();
  return (
    <>
      <PageHeading
        eyebrow="PARTNERS"
        title="Buyers"
        description="Your export partners, contacts, and shipment relationships."
      />
      <BuyersDirectory
        buyers={buyers}
        preview={actor.preview}
        canManage={can(actor.permissions, "buyers.manage")}
      />
    </>
  );
}
