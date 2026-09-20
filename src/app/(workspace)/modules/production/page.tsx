import { requirePermission } from "@/lib/workspace";
import {
  activeItemOptions,
  getLotBalances,
  listBatches,
  searchTraceability,
} from "@/lib/records";
import { PageHeading } from "@/components/ui";
import {
  BatchCreate,
  BatchTable,
  TraceabilityTable,
} from "@/components/production/components";

export const metadata = { title: "Production" };

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await requirePermission("production.view");
  const { q } = await searchParams;
  const [batches, lots, itemOptions, traces] = await Promise.all([
    listBatches(),
    getLotBalances(["raw_material"]),
    activeItemOptions(),
    q ? searchTraceability(q) : Promise.resolve([]),
  ]);
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
        eyebrow="OPERATIONS"
        title="Production"
        description="Record batches, consume material lots, and create finished stock — traceably."
      >
        <BatchCreate
          actor={actor}
          rawItems={raw}
          finishedItems={finished}
          lots={lots}
        />
      </PageHeading>
      <BatchTable batches={batches} />
      <section className="panel section-spacer">
        <div className="panel-heading">
          <div>
            <h2>Trace a lot or batch</h2>
            <p>
              Search a finished lot, a batch code (PB-0001), or a source lot to
              see where it came from.
            </p>
          </div>
        </div>
        <div className="panel-body">
          <form method="get" className="search-form">
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Lot or batch number…"
              aria-label="Trace a lot or batch"
            />
            <button type="submit" className="button button-secondary">
              Trace
            </button>
          </form>
        </div>
      </section>
      {q ? <TraceabilityTable rows={traces} /> : null}
    </>
  );
}
