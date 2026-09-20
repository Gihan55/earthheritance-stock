"use client";

import { useId, useState, useActionState } from "react";
import { LoaderCircle, Paperclip, Trash2, Upload } from "lucide-react";
import { attachDocument, removeDocument } from "@/app/actions";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { INITIAL_STATE } from "@/lib/validation";
import { Feedback } from "@/components/forms";
import type { DocumentEntity } from "@/lib/records";

const MAX_BYTES = 10 * 1024 * 1024;
const DOCUMENT_CATEGORIES = [
  "certificate",
  "transport",
  "payment_evidence",
  "tax",
  "photo",
  "other",
] as const;
const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const CATEGORY_LABELS: Record<string, string> = {
  certificate: "Certificate",
  transport: "Transport / B/L",
  payment_evidence: "Payment evidence",
  tax: "Tax document",
  photo: "Photo",
  other: "Other",
};

export function DocumentUploader({
  entity,
  entityId,
}: {
  entity: DocumentEntity;
  entityId: string;
}) {
  const [state, dispatch, pending] = useActionState(attachDocument, INITIAL_STATE);
  const uid = useId();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState("");
  const busy = uploading || pending;
  const message = localError || state.message;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError("");
    if (!file) {
      setLocalError("Choose a file to attach.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError("Files must be 10 MB or smaller.");
      return;
    }
    if (!ACCEPTED_MIME.includes(file.type)) {
      setLocalError("Allowed types: PDF, JPG, PNG, WEBP, DOCX, XLSX.");
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(-120);
      const path = `${entity}/${entityId}/${crypto.randomUUID()}-${safeName}`;
      data.set("file_path", path);
      data.set("file_name", file.name.slice(0, 200));
      data.set("file_size_bytes", String(file.size));
      data.set("mime_type", file.type);
      const { error } = await createBrowserSupabase()
        .storage.from("attachments")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        setLocalError(
          "The file upload failed. Check your connection and try again.",
        );
        return;
      }
      await dispatch(data);
      setFile(null);
      form.reset();
    } finally {
      setUploading(false);
    }
  }
  return (
    <section className="panel section-spacer">
      <div className="panel-body">
        <h2>
          <Paperclip size={18} /> Attach a supporting document
        </h2>
        <p className="muted">
          PDF, JPG, PNG, WEBP, DOCX or XLSX up to 10 MB. Files are stored
          privately and only visible to roles allowed for this record.
        </p>
        <form className="form-grid" onSubmit={submit}>
          <input type="hidden" name="entity_type" value={entity} />
          <input type="hidden" name="entity_id" value={entityId} />
          <label>
            Title
            <input
              id={`${uid}-title`}
              name="title"
              required
              minLength={2}
              maxLength={120}
              placeholder="Bill of lading, phytosanitary certificate…"
            />
          </label>
          <label>
            Category
            <select
              id={`${uid}-category`}
              name="category"
              defaultValue="other"
            >
              {DOCUMENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>
          <label>
            File
            <input
              id={`${uid}-file`}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
              required
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <div className="form-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Upload size={16} />
              )}
              {uploading ? "Uploading…" : "Upload and attach"}
            </button>
          </div>
        </form>
        {message && !state.success && (
          <p className="form-feedback error" role="alert">
            {message}
          </p>
        )}
        <Feedback state={state} />
      </div>
    </section>
  );
}

export function DocumentDeleteButton({
  documentId,
  entity,
}: {
  documentId: string;
  entity: DocumentEntity;
}) {
  const [, dispatch, pending] = useActionState(removeDocument, INITIAL_STATE);
  return (
    <form action={dispatch} className="inline-form">
      <input type="hidden" name="id" value={documentId} />
      <input type="hidden" name="entity_type" value={entity} />
      <button className="button button-ghost button-small" disabled={pending}>
        <Trash2 size={14} /> Remove
      </button>
    </form>
  );
}
