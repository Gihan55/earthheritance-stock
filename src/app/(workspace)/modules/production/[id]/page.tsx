import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/workspace";
import {
  activeItemOptions,
  getBatchDetail,
  getBatchTraceability,
  getLotBalances,
} from "@/lib/records";
import { PageHeading } from "@/components/ui";
import {
  BatchEditPanel,
  BatchHeader,
  BatchLinesTables,
  TraceabilityTable,
} from "@/components/production/components";

export const metadata = { title: "Production batch" };

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requirePermission("production.view");
  const [detail, lots, itemOptions, traces] = await Promise.all([
    getBatchDetail(id),
    getLotBalances(["raw_material"]),
    activeItemOptions(),
    getBatchTraceability(id),
  ]);
  if (!detail) notFound();
  const toOption = (item: (typeof itemOptions)[number]) => ({
    id: item.id,
    name: item.name,
    code: item.code,
    stock_unit: item.stock_unit,
  });
  const raw = itemOptions
    .filter((item) => item.category === "raw_material")
    .map(toOption);
  const finished = itemOptions
    .filter((item) => item.category === "finished_product")
    .map(toOption);
  return (
    <>
      <PageHeading
        eyebrow="PRODUCTION BATCH"
        title={detail.batch.code}
        description="Materials in, product out — one auditable transaction."
      />
      <BatchHeader detail={detail} actor={actor} />
      <BatchEditPanel
        detail={detail}
        actor={actor}
        rawItems={raw}
        finishedItems={finished}
        lots={lots}
      />
      <BatchLinesTables detail={detail} />
      {detail.batch.status !== "draft" && <TraceabilityTable rows={traces} />}
    </>
  );
}
