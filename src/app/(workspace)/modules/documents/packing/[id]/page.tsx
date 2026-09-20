import { notFound } from "next/navigation";
import { getPackingList } from "@/lib/records";
import { PackingDocumentView } from "@/components/documents-ui";
import { requirePermission } from "@/lib/workspace";
import { PreviewNote } from "@/components/forms";

export const metadata = { title: "Packing list" };

export default async function PackingListDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const actor = await requirePermission("exports.view");
  if (actor.preview)
    return (
      <section className="panel panel-body">
        <p className="muted">
          Printable documents need live data.
        </p>
        <PreviewNote />
      </section>
    );
  const doc = await getPackingList(id);
  if (!doc) notFound();
  return <PackingDocumentView doc={doc} />;
}
