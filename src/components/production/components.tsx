import Link from "next/link";
import { History, Layers } from "lucide-react";
import type { BatchDetail, BatchRow, LotOption, TraceRow } from "@/lib/records";
import type { BatchInitial } from "@/components/production-ui";
import {
  batchStatus,
  formatDate,
  formatDateTime,
  formatQty,
} from "@/lib/format";
import { can } from "@/lib/permissions";
import { Badge } from "@/components/ui";
import {
  BatchEditForm,
  BatchForm,
  BatchStatusActions,
} from "@/components/production-ui";

export function BatchCreate({
  actor,
  rawItems,
  finishedItems,
  lots,
}: {
  actor: { preview: boolean; permissions: readonly string[] };
  rawItems: Parameters<typeof BatchForm>[0]["rawItems"];
  finishedItems: Parameters<typeof BatchForm>[0]["finishedItems"];
  lots: LotOption[];
}) {
  if (!can(actor.permissions, "production.manage")) return null;
  return (
    <BatchForm
      preview={actor.preview}
      rawItems={rawItems}
      finishedItems={finishedItems}
      lots={lots}
    />
  );
}

export function BatchTable({ batches }: { batches: BatchRow[] }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>
            Production batches{" "}
            <span className="count-bubble">{batches.length}</span>
          </h2>
          <p>Newest first. Open a batch to review its lines and post it.</p>
        </div>
      </div>
      {batches.length === 0 ? (
        <div className="panel-body muted">
          No batches yet. Record one when a production run consumes material
          lots.
        </div>
      ) : (
        <div className="table-scroll">
          <table className="record-table">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Produced on</th>
                <th className="num">Inputs</th>
                <th className="num">Outputs</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const badge = batchStatus(batch.status);
                return (
                  <tr key={batch.id}>
                    <td>
                      <Link
                        href={`/modules/production/${batch.id}`}
                        className="primary"
                      >
                        {batch.code}
                      </Link>
                      {batch.notes && (
                        <span className="sub">{batch.notes}</span>
                      )}
                    </td>
                    <td>{formatDate(batch.produced_on)}</td>
                    <td className="num">{batch.production_inputs.length}</td>
                    <td className="num">{batch.production_outputs.length}</td>
                    <td>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function BatchHeader({
  detail,
  actor,
}: {
  detail: BatchDetail;
  actor: { preview: boolean; permissions: readonly string[] };
}) {
  const badge = batchStatus(detail.batch.status);
  const canManage =
    can(actor.permissions, "production.manage") && !actor.preview;
  return (
    <section className="panel panel-body">
      <div
        className="detail-actions"
        style={{ justifyContent: "space-between" }}
      >
        <Link href="/modules/production" className="button button-secondary">
          <History size={16} /> All batches
        </Link>
        {canManage && (
          <BatchStatusActions
            batchId={detail.batch.id}
            status={detail.batch.status}
            preview={actor.preview}
          />
        )}
      </div>
      <dl className="definition-grid section-spacer">
        <div>
          <dt>Status</dt>
          <dd>
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </dd>
        </div>
        <div>
          <dt>Produced on</dt>
          <dd>{formatDate(detail.batch.produced_on)}</dd>
        </div>
        <div>
          <dt>Posted</dt>
          <dd>
            {detail.batch.posted_at
              ? `${formatDateTime(detail.batch.posted_at)}${
                  detail.batch.posted_by_name
                    ? ` · ${detail.batch.posted_by_name}`
                    : ""
                }`
              : "—"}
          </dd>
        </div>
      </dl>
      {detail.batch.notes && (
        <p className="muted section-spacer">
          <strong>Notes:</strong> {detail.batch.notes}
        </p>
      )}
    </section>
  );
}

export function BatchEditPanel({
  detail,
  actor,
  rawItems,
  finishedItems,
  lots,
}: {
  detail: BatchDetail;
  actor: { preview: boolean; permissions: readonly string[] };
  rawItems: Parameters<typeof BatchForm>[0]["rawItems"];
  finishedItems: Parameters<typeof BatchForm>[0]["finishedItems"];
  lots: LotOption[];
}) {
  if (
    detail.batch.status !== "draft" ||
    !can(actor.permissions, "production.manage")
  )
    return null;
  const initial: BatchInitial = {
    id: detail.batch.id,
    produced_on: detail.batch.produced_on,
    notes: detail.batch.notes,
    inputs: detail.inputs,
    outputs: detail.outputs,
    wastage: detail.wastage,
  };
  return (
    <div className="detail-actions section-spacer">
      <BatchEditForm
        preview={actor.preview}
        rawItems={rawItems}
        finishedItems={finishedItems}
        lots={lots}
        initial={initial}
      />
    </div>
  );
}

export function BatchLinesTables({ detail }: { detail: BatchDetail }) {
  return (
    <>
      <section className="panel section-spacer">
        <div className="panel-heading">
          <div>
            <h2>
              Materials consumed{" "}
              <span className="count-bubble">{detail.inputs.length}</span>
            </h2>
            <p>Raw-material lots this batch takes from stock.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="record-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Lot</th>
                <th className="num">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {detail.inputs.map((line) => (
                <tr key={line.id}>
                  <td>
                    <span className="primary">
                      {line.lot?.item?.name ?? "—"}
                    </span>
                    <span className="sub">{line.lot?.item?.code}</span>
                  </td>
                  <td>{line.lot?.lot_number ?? "—"}</td>
                  <td className="num">
                    {formatQty(line.quantity, line.lot?.item?.stock_unit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel section-spacer">
        <div className="panel-heading">
          <div>
            <h2>
              Finished output{" "}
              <span className="count-bubble">{detail.outputs.length}</span>
            </h2>
            <p>Products this batch created, with their lot numbers.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="record-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Lot</th>
                <th className="num">Quantity</th>
                <th className="num">Unit cost</th>
              </tr>
            </thead>
            <tbody>
              {detail.outputs.map((line) => (
                <tr key={line.id}>
                  <td>
                    <span className="primary">{line.item?.name ?? "—"}</span>
                    <span className="sub">{line.item?.code}</span>
                  </td>
                  <td>{line.lot?.lot_number ?? "Not posted"}</td>
                  <td className="num">
                    {formatQty(line.quantity, line.item?.stock_unit)}
                  </td>
                  <td className="num">{line.unit_cost ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {detail.wastage.length > 0 && (
        <section className="panel section-spacer">
          <div className="panel-heading">
            <div>
              <h2>Wastage</h2>
              <p>Material lost or rejected during this batch.</p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="record-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th className="num">Quantity</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {detail.wastage.map((line) => (
                  <tr key={line.id}>
                    <td>{line.item?.name ?? "General"}</td>
                    <td className="num">
                      {formatQty(line.quantity, line.unit)}
                    </td>
                    <td>{line.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

export function TraceabilityTable({ rows }: { rows: TraceRow[] }) {
  return (
    <section className="panel section-spacer">
      <div className="panel-heading">
        <div>
          <h2>
            <Layers size={17} className="inline-icon" /> Traceability
          </h2>
          <p>Finished lot ← production batch ← source lot ← supplier.</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="panel-body muted">
          Nothing to trace yet. Traceability appears once a batch is posted.
        </div>
      ) : (
        <div className="table-scroll">
          <table className="record-table">
            <thead>
              <tr>
                <th>Finished lot</th>
                <th>Batch</th>
                <th>Source lot</th>
                <th>Material</th>
                <th>Supplier</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.batch_id}-${index}`}>
                  <td>
                    <span className="primary">
                      {row.finished_lot_number ?? "—"}
                    </span>
                    <span className="sub">{row.finished_item_name}</span>
                  </td>
                  <td>
                    <Link href={`/modules/production/${row.batch_id}`}>
                      {row.batch_code}
                    </Link>
                  </td>
                  <td>{row.input_lot_number ?? "—"}</td>
                  <td>{row.input_item_name ?? "—"}</td>
                  <td>{row.supplier_name ?? "Production lot"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
