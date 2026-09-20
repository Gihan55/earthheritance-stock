import { requirePermission } from "@/lib/workspace";
import {
  financeSupplierOptions,
  listSupplierBills,
  listSupplierPayments,
  purchaseReferenceOptions,
  readRegisterFilters,
} from "@/lib/records";
import { can } from "@/lib/permissions";
import { PageHeading } from "@/components/ui";
import {
  RegisterFilterForm,
  SupplierPaymentsBoard,
} from "@/components/finance-ui";

export const metadata = { title: "Supplier payments" };

export default async function SupplierPaymentsPage({
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
  const [bills, payments, allBills, suppliers, purchases] = await Promise.all([
    listSupplierBills(filters),
    listSupplierPayments(filters),
    // Allocation dropdowns must still see every open bill, filtered or not.
    isFiltered ? listSupplierBills() : Promise.resolve(null),
    financeSupplierOptions(),
    purchaseReferenceOptions(),
  ]);
  const canManage = can(actor.permissions, "finance.manage");
  return (
    <>
      <PageHeading
        eyebrow="FINANCE"
        title="Supplier payments"
        description="Every raw-material payment, accounted for — bills, advances, and what is still outstanding."
      />
      <RegisterFilterForm
        action="/modules/supplier-payments"
        partyLabel="Supplier"
        parties={suppliers}
        filters={filters}
      />
      <SupplierPaymentsBoard
        bills={bills}
        allBills={allBills ?? bills}
        payments={payments}
        suppliers={suppliers}
        purchases={purchases}
        canManage={canManage}
        preview={actor.preview}
      />
    </>
  );
}
