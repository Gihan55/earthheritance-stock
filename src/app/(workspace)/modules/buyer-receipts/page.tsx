import { requirePermission } from "@/lib/workspace";
import {
  financeBuyerOptions,
  listBuyerInvoices,
  listBuyerReceipts,
  readRegisterFilters,
} from "@/lib/records";
import { can } from "@/lib/permissions";
import { PageHeading } from "@/components/ui";
import {
  BuyerReceiptsBoard,
  RegisterFilterForm,
} from "@/components/finance-ui";

export const metadata = { title: "Buyer receipts" };

export default async function BuyerReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("finance.view");
  const filters = readRegisterFilters(await searchParams);
  const isFiltered = Boolean(
    filters.partyId ||
      filters.from ||
      filters.to ||
      filters.currency ||
      filters.reference ||
      filters.allocation,
  );
  const [invoices, receipts, allInvoices, buyers] = await Promise.all([
    listBuyerInvoices(filters),
    listBuyerReceipts(filters),
    // Allocation dropdowns must still see every open invoice, filtered or not.
    isFiltered ? listBuyerInvoices() : Promise.resolve(null),
    financeBuyerOptions(),
  ]);
  const canManage = can(actor.permissions, "finance.manage");
  return (
    <>
      <PageHeading
        eyebrow="FINANCE"
        title="Buyer receipts"
        description="Keep every buyer payment connected to its order — receipts, allocations, and open invoices."
      />
      <RegisterFilterForm
        action="/modules/buyer-receipts"
        partyLabel="Buyer"
        parties={buyers}
        filters={filters}
      />
      <BuyerReceiptsBoard
        invoices={invoices}
        allInvoices={allInvoices ?? invoices}
        receipts={receipts}
        buyers={buyers}
        canManage={canManage}
        preview={actor.preview}
      />
    </>
  );
}
