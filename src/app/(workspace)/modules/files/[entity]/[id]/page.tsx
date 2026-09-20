import { notFound } from "next/navigation";
import Link from "next/link";
import { Download } from "lucide-react";
import { PageHeading } from "@/components/ui";
import { PreviewNote } from "@/components/forms";
import { DocumentDeleteButton, DocumentUploader } from "@/components/files-ui";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/lib/workspace";
import { formatDate } from "@/lib/format";
import {
  DOCUMENT_ENTITIES,
  isDocumentEntity,
  listDocuments,
} from "@/lib/records";

export const metadata = { title: "Supporting documents" };

const CATEGORY_LABELS: Record<string, string> = {
  certificate: "Certificate",
  transport: "Transport / B/L",
  payment_evidence: "Payment evidence",
  tax: "Tax document",
  photo: "Photo",
  other: "Other",
};
function formatSize(bytes: string) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function FilesPage({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  const { entity, id } = await params;
  if (!isDocumentEntity(entity) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const meta = DOCUMENT_ENTITIES[entity];
  const actor = await requirePermission(meta.read);
  if (actor.preview)
    return (
      <section className="panel panel-body">
        <p className="muted">Supporting documents need live data.</p>
        <PreviewNote />
      </section>
    );
  const documents = await listDocuments(entity, id);
  const canManage = can(actor.permissions, meta.manage);
  return (
    <>
      <PageHeading
        eyebrow="Supporting documents"
        title={`${meta.label} files`}
        description="Private attachments for this record — certificates, transport papers, tax forms and payment evidence."
      />
      {canManage && <DocumentUploader entity={entity} entityId={id} />}
      <section className="panel">
        {documents.length === 0 ? (
          <div className="panel-body muted">No documents attached yet.</div>
        ) : (
          <div className="table-scroll">
            <table className="record-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Category</th>
                  <th>File</th>
                  <th>Added by</th>
                  <th>Date</th>
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.title}</td>
                    <td>{CATEGORY_LABELS[doc.category] ?? doc.category}</td>
                    <td>
                      <Link className="primary" href={`/attachments/${doc.id}`}>
                        <Download size={14} /> {doc.file_name}
                      </Link>
                      <span className="sub">{formatSize(doc.file_size_bytes)}</span>
                    </td>
                    <td>{doc.uploaded_by_name ?? "—"}</td>
                    <td>{formatDate(doc.created_at.slice(0, 10))}</td>
                    {canManage && (
                      <td>
                        <DocumentDeleteButton
                          documentId={doc.id}
                          entity={entity}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
