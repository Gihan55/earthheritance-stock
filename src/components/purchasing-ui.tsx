"use client";
import { useId, useActionState, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import {
  cancelPurchase,
  confirmPurchase,
  createPurchase,
  receiveGoods,
} from "@/app/actions";
import { INITIAL_STATE } from "@/lib/validation";
import type { PurchaseLineRow } from "@/lib/records";
import { formatQty } from "@/lib/format";
import { CurrencySelect } from "./currency";
import { Modal } from "./client-modal";
import { Feedback, PreviewNote, SubmitButton } from "./forms";

type Option = { id: string; name: string; code: string; stock_unit: string };

export function LineEditor<T extends { id: string }>({
  rows,
  fields,
  onChange,
  onRemove,
  onAdd,
  addLabel,
  canRemove,
}: {
  rows: T[];
  fields: (row: T, update: (patch: Partial<T>) => void) => React.ReactNode;
  onChange: (id: string, patch: Partial<T>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  addLabel: string;
  canRemove: (row: T) => boolean;
}) {
  return (
    <div className="line-editor">
      {rows.map((row) => (
        <div className="line-row" key={row.id}>
          {fields(row, (patch) => onChange(row.id, patch))}
          {canRemove(row) && (
            <button
              type="button"
              className="remove-line"
              aria-label="Remove line"
              onClick={() => onRemove(row.id)}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="button button-secondary button-small"
        onClick={onAdd}
      >
        <Plus size={15} /> {addLabel}
      </button>
    </div>
  );
}

type PurchaseLineRowState = {
  id: string;
  item_id: string;
  quantity: string;
  unit_price: string;
};

export function PurchaseForm({
  preview,
  suppliers,
  items,
}: {
  preview: boolean;
  suppliers: {
    id: string;
    name: string;
    code: string;
    preferred_currency: string;
  }[];
  items: Option[];
}) {
  const [state, action, pending] = useActionState(
    createPurchase,
    INITIAL_STATE,
  );
  const today = new Date().toISOString().slice(0, 10);
  const uid = useId();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const selectedSupplier = suppliers.find(
    (supplier) => supplier.id === supplierId,
  );
  const [currencyOverride, setCurrencyOverride] = useState("");
  const currency =
    currencyOverride || selectedSupplier?.preferred_currency || "USD";
  const [rows, setRows] = useState<PurchaseLineRowState[]>([
    { id: `${uid}-l0`, item_id: "", quantity: "", unit_price: "" },
  ]);
  const update = (id: string, patch: Partial<PurchaseLineRowState>) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  const linesJson = JSON.stringify(
    rows
      .filter((row) => row.item_id && Number(row.quantity) > 0)
      .map((row) => ({
        item_id: row.item_id,
        quantity: Number(row.quantity),
        unit_price: row.unit_price === "" ? 0 : Number(row.unit_price),
      })),
  );
  return (
    <Modal
      buttonLabel="New purchase order"
      icon={<Plus size={16} />}
      title="Create a purchase order"
      description="Add the items and quantities you are buying. The order starts as a draft you can confirm later."
      wide
    >
      {({ close }) => (
        <form action={action} className="stack-form">
          <div className="form-grid">
            <label>
              Supplier <span className="required">*</span>
              <select
                name="supplier_id"
                required
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="" disabled>
                  Select a supplier…
                </option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name} ({supplier.code})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Currency <span className="required">*</span>
              <CurrencySelect
                name="currency"
                value={currency}
                onChange={(event) =>
                  setCurrencyOverride(event.target.value)
                }
                required
              />
            </label>
            <label>
              Order date <span className="required">*</span>
              <input
                type="date"
                name="order_date"
                defaultValue={today}
                required
              />
            </label>
            <label>
              Expected date
              <input type="date" name="expected_date" defaultValue="" />
            </label>
            <label className="full-width">
              Notes
              <textarea name="notes" rows={2} maxLength={2000} />
            </label>
          </div>
          <div className="form-section-title divided">
            <h3>Item lines</h3>
            <p>Choose an item and enter the ordered quantity and unit price.</p>
          </div>
          <LineEditor
            rows={rows}
            addLabel="Add another line"
            canRemove={() => rows.length > 1}
            onChange={update}
            onRemove={(id) =>
              setRows((current) => current.filter((row) => row.id !== id))
            }
            onAdd={() =>
              setRows((current) => [
                ...current,
                {
                  id: `${uid}-n${Date.now()}`,
                  item_id: "",
                  quantity: "",
                  unit_price: "",
                },
              ])
            }
            fields={(row, patch) => (
              <>
                <div className="line-field line-item">
                  <span>Item</span>
                  <select
                    value={row.item_id}
                    onChange={(event) => patch({ item_id: event.target.value })}
                  >
                    <option value="">Select item…</option>
                    {items.map((item) => (
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
                    onChange={(event) =>
                      patch({ quantity: event.target.value })
                    }
                    placeholder="0"
                  />
                </div>
                <div className="line-field">
                  <span>Unit price</span>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={row.unit_price}
                    onChange={(event) =>
                      patch({ unit_price: event.target.value })
                    }
                    placeholder="0"
                  />
                </div>
              </>
            )}
          />
          <input type="hidden" name="lines" value={linesJson} readOnly />
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
              Create draft order
            </SubmitButton>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function PurchaseStatusActions({
  purchaseId,
  status,
  preview,
}: {
  purchaseId: string;
  status: string;
  preview: boolean;
}) {
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmPurchase,
    INITIAL_STATE,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelPurchase,
    INITIAL_STATE,
  );
  return (
    <div className="detail-actions">
      {status === "draft" && (
        <form action={confirmAction}>
          <input type="hidden" name="id" value={purchaseId} />
          <button
            type="submit"
            className="button button-primary"
            disabled={confirmPending || preview}
          >
            <Check size={16} />
            {confirmPending ? "Confirming..." : "Confirm order"}
          </button>
          <Feedback state={confirmState} />
        </form>
      )}
      {["draft", "confirmed"].includes(status) && (
        <form action={cancelAction}>
          <input type="hidden" name="id" value={purchaseId} />
          <button
            type="submit"
            className="button button-secondary"
            disabled={cancelPending || preview}
          >
            <X size={16} />
            {cancelPending ? "Cancelling..." : "Cancel order"}
          </button>
          <Feedback state={cancelState} />
        </form>
      )}
    </div>
  );
}

type ReceiptRow = {
  id: string;
  quantity: string;
  lot_number: string;
  unit_cost: string;
};

export function ReceiptForm({
  purchaseId,
  lines,
  preview,
}: {
  purchaseId: string;
  lines: PurchaseLineRow[];
  preview: boolean;
}) {
  const [state, action, pending] = useActionState(receiveGoods, INITIAL_STATE);
  const uid = useId();
  const today = new Date().toISOString().slice(0, 10);
  const initialRows: ReceiptRow[] = lines.map((line, index) => ({
    id: `${uid}-${index}`,
    quantity: "",
    lot_number: "",
    unit_cost: "",
  }));
  const [rows, setRows] = useState<ReceiptRow[]>(initialRows);
  const update = (id: string, patch: Partial<ReceiptRow>) =>
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  const linesJson = JSON.stringify(
    rows
      .map((row, index) => ({
        purchase_line_id: lines[index].id,
        quantity: Number(row.quantity),
        lot_number: row.lot_number,
        unit_cost: row.unit_cost === "" ? 0 : Number(row.unit_cost),
      }))
      .filter((line) => line.quantity > 0),
  );
  return (
    <Modal
      buttonLabel="Receive goods"
      buttonClass="button button-primary"
      icon={<Plus size={16} />}
      title="Receive goods"
      description="Record the quantities arriving. Each line creates a stock lot and posts a receipt movement."
      wide
    >
      {({ close }) => (
        <form action={action} className="stack-form">
          <input type="hidden" name="purchase_id" value={purchaseId} />
          <div className="form-grid">
            <label>
              Receipt date <span className="required">*</span>
              <input
                type="date"
                name="receipt_date"
                defaultValue={today}
                required
              />
            </label>
            <label>
              Supplier reference
              <input name="supplier_reference" maxLength={120} />
            </label>
            <label className="full-width">
              Notes
              <textarea name="notes" rows={2} maxLength={2000} />
            </label>
          </div>
          <div className="form-section-title divided">
            <h3>Received quantities</h3>
            <p>
              Enter how much of each line is arriving now (up to the balance).
            </p>
          </div>
          <div className="line-editor">
            {lines.map((line, index) => {
              const ordered = Number(line.quantity);
              const received = Number(line.received_quantity);
              const balance = Math.max(ordered - received, 0);
              const row = rows[index];
              return (
                <div className="line-row" key={line.id}>
                  <div className="line-field line-item">
                    <span>Item</span>
                    <div>
                      <strong>{line.item?.name ?? "Item"}</strong>
                      <span className="sub">
                        {formatQty(balance, line.item?.stock_unit)} remaining
                      </span>
                    </div>
                  </div>
                  <div className="line-field">
                    <span>Receive qty</span>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      max={balance}
                      value={row.quantity}
                      disabled={balance <= 0}
                      onChange={(event) =>
                        update(row.id, { quantity: event.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="line-field">
                    <span>Lot number</span>
                    <input
                      value={row.lot_number}
                      maxLength={60}
                      onChange={(event) =>
                        update(row.id, { lot_number: event.target.value })
                      }
                      placeholder="Auto"
                    />
                  </div>
                  <div className="line-field">
                    <span>Unit cost</span>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={row.unit_cost}
                      onChange={(event) =>
                        update(row.id, { unit_cost: event.target.value })
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <input type="hidden" name="lines" value={linesJson} readOnly />
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
              Record receipt
            </SubmitButton>
          </div>
        </form>
      )}
    </Modal>
  );
}
