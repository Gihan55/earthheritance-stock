"use client";
import { useActionState, useId, useState } from "react";
import { Check, Pencil, Plus, RotateCcw } from "lucide-react";
import {
  createBatch,
  postBatch,
  reverseBatch,
  updateBatch,
} from "@/app/actions";
import { INITIAL_STATE } from "@/lib/validation";
import type { BatchDetail, LotOption } from "@/lib/records";
import { formatQty } from "@/lib/format";
import { Modal } from "./client-modal";
import { Feedback, PreviewNote, SubmitButton } from "./forms";
import { LineEditor } from "./purchasing-ui";

type ItemOption = {
  id: string;
  name: string;
  code: string;
  stock_unit: string;
};
type InputRow = {
  id: string;
  item_id: string;
  lot_id: string;
  quantity: string;
};
type OutputRow = {
  id: string;
  item_id: string;
  quantity: string;
  unit_cost: string;
};
type WastageRow = {
  id: string;
  item_id: string;
  quantity: string;
  unit: string;
  reason: string;
};
export type BatchInitial = {
  id: string;
  produced_on: string;
  notes: string;
  inputs: BatchDetail["inputs"];
  outputs: BatchDetail["outputs"];
  wastage: BatchDetail["wastage"];
};

function BatchFormBody({
  preview,
  rawItems,
  finishedItems,
  lots,
  initial,
  close,
}: {
  preview: boolean;
  rawItems: ItemOption[];
  finishedItems: ItemOption[];
  lots: LotOption[];
  initial?: BatchInitial;
  close: () => void;
}) {
  const editing = !!initial;
  const [state, action, pending] = useActionState(
    editing ? updateBatch : createBatch,
    INITIAL_STATE,
  );
  const uid = useId();
  const today = new Date().toISOString().slice(0, 10);
  const [inputs, setInputs] = useState<InputRow[]>(
    initial
      ? initial.inputs.map((line, index) => ({
          id: `${uid}-i${index}`,
          item_id: line.item_id,
          lot_id: line.lot_id,
          quantity: line.quantity,
        }))
      : [{ id: `${uid}-i0`, item_id: "", lot_id: "", quantity: "" }],
  );
  const [outputs, setOutputs] = useState<OutputRow[]>(
    initial
      ? initial.outputs.map((line, index) => ({
          id: `${uid}-o${index}`,
          item_id: line.item_id,
          quantity: line.quantity,
          unit_cost: line.unit_cost ?? "",
        }))
      : [{ id: `${uid}-o0`, item_id: "", quantity: "", unit_cost: "" }],
  );
  const [wastage, setWastage] = useState<WastageRow[]>(
    initial
      ? initial.wastage.map((line, index) => ({
          id: `${uid}-w${index}`,
          item_id: line.item_id ?? "",
          quantity: line.quantity,
          unit: line.unit,
          reason: line.reason,
        }))
      : [],
  );
  const [seq, setSeq] = useState(1);
  const nextId = (prefix: string) => `${uid}-${prefix}${seq}`;
  const bump = () => setSeq((value) => value + 1);

  const inputsJson = JSON.stringify(
    inputs
      .filter((row) => row.item_id && row.lot_id && Number(row.quantity) > 0)
      .map((row) => ({
        item_id: row.item_id,
        lot_id: row.lot_id,
        quantity: Number(row.quantity),
      })),
  );
  const outputsJson = JSON.stringify(
    outputs
      .filter((row) => row.item_id && Number(row.quantity) > 0)
      .map((row) => ({
        item_id: row.item_id,
        quantity: Number(row.quantity),
        unit_cost: row.unit_cost === "" ? null : Number(row.unit_cost),
      })),
  );
  const wastageJson = JSON.stringify(
    wastage
      .filter((row) => Number(row.quantity) > 0)
      .map((row) => ({
        item_id: row.item_id,
        quantity: Number(row.quantity),
        unit: row.unit,
        reason: row.reason,
      })),
  );
  return (
    <form action={action} className="stack-form">
      {editing && <input type="hidden" name="id" value={initial.id} />}
      <div className="form-grid">
        <label>
          Production date <span className="required">*</span>
          <input
            type="date"
            name="produced_on"
            defaultValue={initial?.produced_on ?? today}
            required
          />
        </label>
        <label className="full-width">
          Notes
          <textarea
            name="notes"
            rows={2}
            maxLength={2000}
            defaultValue={initial?.notes ?? ""}
          />
        </label>
      </div>
      <div className="form-section-title divided">
        <h3>Materials consumed</h3>
        <p>Choose a raw-material lot and how much of it the batch uses.</p>
      </div>
      <LineEditor
        rows={inputs}
        addLabel="Add input material"
        canRemove={() => inputs.length > 1}
        onChange={(id, patch) =>
          setInputs((current) =>
            current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
          )
        }
        onRemove={(id) =>
          setInputs((current) => current.filter((row) => row.id !== id))
        }
        onAdd={() => {
          bump();
          setInputs((current) => [
            ...current,
            { id: nextId("in"), item_id: "", lot_id: "", quantity: "" },
          ]);
        }}
        fields={(row, patch) => {
          const rowLots = lots.filter((lot) => lot.item_id === row.item_id);
          return (
            <>
              <div className="line-field line-item">
                <span>Material</span>
                <select
                  value={row.item_id}
                  onChange={(event) =>
                    patch({ item_id: event.target.value, lot_id: "" })
                  }
                >
                  <option value="">Select material…</option>
                  {rawItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.code}) · {item.stock_unit}
                    </option>
                  ))}
                </select>
              </div>
              <div className="line-field">
                <span>Lot</span>
                <select
                  value={row.lot_id}
                  disabled={rowLots.length === 0}
                  onChange={(event) => patch({ lot_id: event.target.value })}
                >
                  <option value="">
                    {row.item_id ? "Select lot…" : "Choose material first"}
                  </option>
                  {rowLots.map((lot) => (
                    <option key={lot.lot_id} value={lot.lot_id}>
                      {lot.lot_number} ·{" "}
                      {formatQty(lot.on_hand, lot.stock_unit)} on hand
                    </option>
                  ))}
                </select>
              </div>
              <div className="line-field">
                <span>Quantity</span>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={row.quantity}
                  onChange={(event) => patch({ quantity: event.target.value })}
                  placeholder="0"
                />
              </div>
            </>
          );
        }}
      />
      <div className="form-section-title divided">
        <h3>Finished output</h3>
        <p>
          Each output line creates a new finished-product lot when the batch is
          posted.
        </p>
      </div>
      <LineEditor
        rows={outputs}
        addLabel="Add output product"
        canRemove={() => outputs.length > 1}
        onChange={(id, patch) =>
          setOutputs((current) =>
            current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
          )
        }
        onRemove={(id) =>
          setOutputs((current) => current.filter((row) => row.id !== id))
        }
        onAdd={() => {
          bump();
          setOutputs((current) => [
            ...current,
            {
              id: nextId("on"),
              item_id: "",
              quantity: "",
              unit_cost: "",
            },
          ]);
        }}
        fields={(row, patch) => (
          <>
            <div className="line-field line-item">
              <span>Product</span>
              <select
                value={row.item_id}
                onChange={(event) => patch({ item_id: event.target.value })}
              >
                <option value="">Select product…</option>
                {finishedItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.code}) · {item.stock_unit}
                  </option>
                ))}
              </select>
            </div>
            <div className="line-field">
              <span>Quantity</span>
              <input
                type="number"
                step="0.001"
                min="0"
                value={row.quantity}
                onChange={(event) => patch({ quantity: event.target.value })}
                placeholder="0"
              />
            </div>
            <div className="line-field">
              <span>Unit cost</span>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={row.unit_cost}
                onChange={(event) => patch({ unit_cost: event.target.value })}
                placeholder="Optional"
              />
            </div>
          </>
        )}
      />
      <div className="form-section-title divided">
        <h3>Wastage (optional)</h3>
        <p>Record material lost or rejected during the batch.</p>
      </div>
      <LineEditor
        rows={wastage}
        addLabel="Add wastage line"
        canRemove={() => true}
        onChange={(id, patch) =>
          setWastage((current) =>
            current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
          )
        }
        onRemove={(id) =>
          setWastage((current) => current.filter((row) => row.id !== id))
        }
        onAdd={() => {
          bump();
          setWastage((current) => [
            ...current,
            {
              id: nextId("wn"),
              item_id: "",
              quantity: "",
              unit: "",
              reason: "",
            },
          ]);
        }}
        fields={(row, patch) => (
          <>
            <div className="line-field line-item">
              <span>Material (optional)</span>
              <select
                value={row.item_id}
                onChange={(event) => patch({ item_id: event.target.value })}
              >
                <option value="">Not specified</option>
                {rawItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="line-field">
              <span>Quantity</span>
              <input
                type="number"
                step="0.001"
                min="0"
                value={row.quantity}
                onChange={(event) => patch({ quantity: event.target.value })}
                placeholder="0"
              />
            </div>
            <div className="line-field">
              <span>Unit</span>
              <input
                value={row.unit}
                maxLength={20}
                onChange={(event) => patch({ unit: event.target.value })}
                placeholder="kg"
              />
            </div>
            <div className="line-field">
              <span>Reason</span>
              <input
                value={row.reason}
                maxLength={200}
                onChange={(event) => patch({ reason: event.target.value })}
                placeholder="e.g. Moisture loss"
              />
            </div>
          </>
        )}
      />
      <input type="hidden" name="inputs" value={inputsJson} readOnly />
      <input type="hidden" name="outputs" value={outputsJson} readOnly />
      <input type="hidden" name="wastage" value={wastageJson} readOnly />
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
          {editing ? "Save draft lines" : "Create draft batch"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function BatchForm({
  preview,
  rawItems,
  finishedItems,
  lots,
}: {
  preview: boolean;
  rawItems: ItemOption[];
  finishedItems: ItemOption[];
  lots: LotOption[];
}) {
  return (
    <Modal
      buttonLabel="New production batch"
      icon={<Plus size={16} />}
      title="Record a production batch"
      description="Log the material lots a batch consumes and the finished products it yields. Nothing posts to stock until you submit the batch."
      wide
    >
      {({ close }) => (
        <BatchFormBody
          preview={preview}
          rawItems={rawItems}
          finishedItems={finishedItems}
          lots={lots}
          close={close}
        />
      )}
    </Modal>
  );
}

export function BatchEditForm({
  preview,
  rawItems,
  finishedItems,
  lots,
  initial,
}: {
  preview: boolean;
  rawItems: ItemOption[];
  finishedItems: ItemOption[];
  lots: LotOption[];
  initial: BatchInitial;
}) {
  return (
    <Modal
      buttonLabel="Edit lines"
      buttonClass="button button-secondary"
      icon={<Pencil size={15} />}
      title="Edit batch lines"
      description="Update the draft inputs, outputs, and wastage before posting."
      wide
    >
      {({ close }) => (
        <BatchFormBody
          preview={preview}
          rawItems={rawItems}
          finishedItems={finishedItems}
          lots={lots}
          initial={initial}
          close={close}
        />
      )}
    </Modal>
  );
}

export function BatchStatusActions({
  batchId,
  status,
  preview,
}: {
  batchId: string;
  status: BatchDetail["batch"]["status"];
  preview: boolean;
}) {
  const [postState, postAction, postPending] = useActionState(
    postBatch,
    INITIAL_STATE,
  );
  const [reverseState, reverseAction, reversePending] = useActionState(
    reverseBatch,
    INITIAL_STATE,
  );
  return (
    <div className="detail-actions">
      {status === "draft" && (
        <form action={postAction}>
          <input type="hidden" name="id" value={batchId} />
          <button
            type="submit"
            className="button button-primary"
            disabled={postPending || preview}
          >
            <Check size={16} />
            {postPending ? "Posting..." : "Post to stock"}
          </button>
          <Feedback state={postState} />
        </form>
      )}
      {status === "posted" && (
        <form action={reverseAction}>
          <input type="hidden" name="id" value={batchId} />
          <button
            type="submit"
            className="button button-secondary"
            disabled={reversePending || preview}
          >
            <RotateCcw size={16} />
            {reversePending ? "Reversing..." : "Reverse batch"}
          </button>
          <Feedback state={reverseState} />
        </form>
      )}
    </div>
  );
}
