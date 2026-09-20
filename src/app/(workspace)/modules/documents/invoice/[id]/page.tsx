import { notFound } from "next/navigation";
import { getInvoiceDocument } from "@/lib/records";
import { InvoiceDocumentView } from "@/components/documents-ui";
import { requirePermission } from "@/lib/workspace";
import { PreviewNote } from "@/components/forms";

export const metadata = { title: "Commercial invoice" };

export default async function InvoiceDocumentPage({
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
  const doc = await getInvoiceDocument(id);
  if (!doc) notFound();
  return <InvoiceDocumentView doc={doc} />;
}
