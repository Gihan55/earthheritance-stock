"use client";
import { useActionState, useState } from "react";
import { Check, SlidersHorizontal, X } from "lucide-react";
import { decideAdjustment, requestAdjustment } from "@/app/actions";
import { INITIAL_STATE } from "@/lib/validation";
import type { AdjustmentRow, CatalogItem, LotOption } from "@/lib/records";
import { formatQty } from "@/lib/format";
import { Modal } from "./client-modal";
import { Feedback, PreviewNote, SubmitButton } from "./forms";

export function AdjustmentRequestForm({
  preview,
  items,
  lots,
}: {
  preview: boolean;
  items: CatalogItem[];
  lots: LotOption[];
}) {
  const [state, action, pending] = useActionState(
    requestAdjustment,
    INITIAL_STATE,
  );
  const [itemId, setItemId] = useState("");
  const [lotId, setLotId] = useState("");
  const itemLots = lots.filter(
    (lot) => lot.item_id === itemId && Number(lot.on_hand) > 0,
  );
  return (
    <Modal
      buttonLabel="Request adjustment"
      buttonClass="button button-secondary"
      icon={<SlidersHorizontal size={16} />}
      title="Request a stock adjustment"
      description="Adjustments correct the counted stock and must be approved by a manager before they post."
    >
      {({ close }) => (
        <form
          action={action}
          className="stack-form"
          key={state.success ? "saved" : "form"}
        >
          <label>
            Item <span className="required">*</span>
            <select
              name="item_id"
              required
              value={itemId}
              onChange={(event) => {
                setItemId(event.target.value);
                setLotId("");
              }}
            >
              <option value="" disabled>
                Select an item…
              </option>
              {items
                .filter((item) => item.is_active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.code}) · {item.stock_unit}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Lot <span className="required">*</span>
            <select
              name="lot_id"
              required
              value={lotId}
              onChange={(event) => setLotId(event.target.value)}
              disabled={!itemId}
            >
              <option value="" disabled>
                {itemId ? "Select a lot…" : "Choose an item first"}
              </option>
              {itemLots.map((lot) => (
                <option key={lot.lot_id} value={lot.lot_id}>
                  {lot.lot_number} · {formatQty(lot.on_hand, lot.stock_unit)} on
                  hand
                </option>
              ))}
            </select>
          </label>
          <label>
            Direction <span className="required">*</span>
            <select name="direction" defaultValue="increase">
              <option value="increase">Increase (found stock)</option>
              <option value="decrease">Decrease (write off)</option>
            </select>
          </label>
          <label>
            Quantity <span className="required">*</span>
            <input
              name="quantity"
              type="number"
              step="0.001"
              min="0.001"
              required
              placeholder="0"
            />
          </label>
          <label>
            Reason <span className="required">*</span>
            <textarea
              name="reason"
              rows={2}
              required
              minLength={3}
              maxLength={500}
              placeholder="Why is this correction needed?"
            />
          </label>
          <Feedback state={state} />
          {preview && <PreviewNote />}
          <div className="form-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={close}
            >
              Cancel
            </button>
            <SubmitButton pending={pending} disabled={preview}>
              Submit for approval
            </SubmitButton>
          </div>
        </form>
      )}
    </Modal>
  );
}

function AdjustmentDecision({
  adjustment,
  preview,
}: {
  adjustment: AdjustmentRow;
  preview: boolean;
}) {
  const [state, action, pending] = useActionState(
    decideAdjustment,
    INITIAL_STATE,
  );
  return (
    <form action={action} className="detail-actions">
      <input type="hidden" name="id" value={adjustment.id} />
      <button
        type="submit"
        name="decision"
        value="approve"
        className="button button-primary button-small"
        disabled={pending || preview}
      >
        <Check size={15} /> Approve
      </button>
      <button
        type="submit"
        name="decision"
        value="reject"
        className="button button-secondary button-small"
        disabled={pending || preview}
      >
        <X size={15} /> Reject
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function AdjustmentTable({
  adjustments,
  canApprove,
  preview,
}: {
  adjustments: AdjustmentRow[];
  canApprove: boolean;
  preview: boolean;
}) {
  return (
    <section className="panel section-spacer">
      <div className="panel-heading">
        <div>
          <h2>Stock adjustments</h2>
          <p>Corrections requested by stores, approved by managers.</p>
        </div>
      </div>
      {adjustments.length === 0 ? (
        <div className="panel-body muted">
          No adjustments have been requested yet.
        </div>
      ) : (
        <div className="table-scroll">
          <table className="record-table">
            <thead>
              <tr>
                <th>Adjustment</th>
                <th>Item / lot</th>
                <th className="num">Change</th>
                <th>Reason</th>
                <th>Requested by</th>
                <th>Status</th>
                {canApprove && <th>Decision</th>}
              </tr>
            </thead>
            <tbody>
              {adjustments.map((adjustment) => (
                <tr key={adjustment.id}>
                  <td>
                    <span className="primary">{adjustment.code}</span>
                  </td>
                  <td>
                    {adjustment.item?.name ?? "—"}
                    <span className="sub">
                      {adjustment.lot?.lot_number ?? "No lot"}
                    </span>
                  </td>
                  <td className="num">
                    <span
                      className={
                        adjustment.direction === "increase"
                          ? "delta-pos"
                          : "delta-neg"
                      }
                    >
                      {adjustment.direction === "increase" ? "+" : "−"}
                      {formatQty(
                        adjustment.quantity,
                        adjustment.item?.stock_unit,
                      )}
                    </span>
                  </td>
                  <td>{adjustment.reason}</td>
                  <td>{adjustment.requested_by?.full_name ?? "—"}</td>
                  <td>
                    <span className="primary">
                      {adjustment.status === "pending"
                        ? "Awaiting approval"
                        : adjustment.status === "approved"
                          ? `Approved${
                              adjustment.decided_by
                                ? ` · ${adjustment.decided_by.full_name}`
                                : ""
                            }`
                          : "Rejected"}
                    </span>
                  </td>
                  {canApprove && (
                    <td>
                      {adjustment.status === "pending" ? (
                        <AdjustmentDecision
                          adjustment={adjustment}
                          preview={preview}
                        />
                      ) : (
                        <span className="muted">Decided</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
