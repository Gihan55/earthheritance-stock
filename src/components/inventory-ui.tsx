"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Boxes, PackagePlus, Pencil, Plus, Search } from "lucide-react";
import { recordOpeningStock, saveItem, setItemActive } from "@/app/actions";
import { INITIAL_STATE, type ActionState } from "@/lib/validation";
import type { CatalogItem, StockBalance } from "@/lib/records";
import { categoryLabel, formatQty } from "@/lib/format";
import { Badge, EmptyState } from "./ui";
import { Modal } from "./client-modal";
import { Feedback, PreviewNote, SubmitButton } from "./forms";

type ItemFormValues = Partial<CatalogItem> & { id?: string };

function ItemFields({
  preview,
  state,
  action,
  pending,
  values,
  close,
  lockCategory,
}: {
  preview: boolean;
  state: ActionState;
  action: (payload: FormData) => void;
  pending: boolean;
  values: ItemFormValues;
  close: () => void;
  lockCategory: boolean;
}) {
  return (
    <form action={action} className="stack-form">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="form-grid">
        <label className="full-width">
          Item name <span className="required">*</span>
          <input
            name="name"
            defaultValue={values.name}
            required
            minLength={2}
            maxLength={160}
            placeholder="e.g. Coco peat grow bags"
          />
        </label>
        <label>
          Category <span className="required">*</span>
          <select
            name="category"
            defaultValue={values.category ?? "raw_material"}
            disabled={lockCategory}
          >
            <option value="raw_material">Raw material</option>
            <option value="finished_product">Finished product</option>
          </select>
          {lockCategory && (
            <small>The category cannot change once the item exists.</small>
          )}
        </label>
        <label>
          Stock unit <span className="required">*</span>
          <input
            name="stock_unit"
            defaultValue={values.stock_unit}
            required
            maxLength={20}
            placeholder="kg, bag, bale..."
          />
        </label>
        <label>
          Reorder level
          <input
            name="reorder_level"
            type="number"
            step="0.001"
            min="0"
            defaultValue={values.reorder_level ?? ""}
            placeholder="0"
          />
        </label>
        <label>
          Net weight (kg)
          <input
            name="net_weight_kg"
            type="number"
            step="0.001"
            min="0"
            defaultValue={values.net_weight_kg ?? ""}
            placeholder="Optional"
          />
        </label>
        <label className="full-width">
          Packaging specification
          <input
            name="packaging_spec"
            defaultValue={values.packaging_spec}
            maxLength={200}
            placeholder="e.g. 70L compressed bale"
          />
        </label>
        <label className="full-width">
          Notes
          <textarea
            name="notes"
            defaultValue={values.notes}
            rows={2}
            maxLength={2000}
          />
        </label>
      </div>
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
          Save item
        </SubmitButton>
      </div>
    </form>
  );
}

export function ItemForm({
  preview,
  item,
}: {
  preview: boolean;
  item?: CatalogItem;
}) {
  const [state, action, pending] = useActionState(saveItem, INITIAL_STATE);
  if (item)
    return (
      <ItemFields
        key={state.success ? item.id : "edit"}
        preview={preview}
        state={state}
        action={action}
        pending={pending}
        values={item}
        close={() => {}}
        lockCategory
      />
    );
  return (
    <Modal
      buttonLabel="New item"
      icon={<Plus size={16} />}
      title="Add an item"
      description="Define a raw material or finished product you track in stock."
      wide
    >
      {({ close }) => (
        <ItemFields
          key={state.success ? "saved" : "form"}
          preview={preview}
          state={state}
          action={action}
          pending={pending}
          values={{ category: "raw_material" }}
          close={close}
          lockCategory={false}
        />
      )}
    </Modal>
  );
}

export function ItemEditForm({
  item,
  preview,
  close,
}: {
  item: CatalogItem;
  preview: boolean;
  close: () => void;
}) {
  const [state, action, pending] = useActionState(saveItem, INITIAL_STATE);
  return (
    <ItemFields
      key={state.success ? item.id : "edit"}
      preview={preview}
      state={state}
      action={action}
      pending={pending}
      values={item}
      close={close}
      lockCategory
    />
  );
}

export function ItemActiveToggle({
  item,
  preview,
}: {
  item: { id: string; is_active: boolean };
  preview: boolean;
}) {
  const [state, action, pending] = useActionState(setItemActive, INITIAL_STATE);
  return (
    <form action={action} className="detail-actions">
      <input type="hidden" name="id" value={item.id} />
      <input
        type="hidden"
        name="is_active"
        value={item.is_active ? "false" : "true"}
      />
      <button
        type="submit"
        className="button button-secondary button-small"
        disabled={pending || preview}
      >
        {pending ? "Saving..." : item.is_active ? "Deactivate" : "Reactivate"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function OpeningStockForm({
  preview,
  items,
}: {
  preview: boolean;
  items: { id: string; name: string; code: string; stock_unit: string }[];
}) {
  const [state, action, pending] = useActionState(
    recordOpeningStock,
    INITIAL_STATE,
  );
  return (
    <Modal
      buttonLabel="Record opening stock"
      buttonClass="button button-secondary"
      icon={<PackagePlus size={16} />}
      title="Record opening stock"
      description="Enter the quantity you physically hold before trading begins. This creates the lot and posts an opening movement."
    >
      {({ close }) => (
        <form
          action={action}
          className="stack-form"
          key={state.success ? "saved" : "form"}
        >
          <label>
            Item <span className="required">*</span>
            <select name="item_id" required defaultValue="">
              <option value="" disabled>
                Select an item…
              </option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.code}) · {item.stock_unit}
                </option>
              ))}
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
            Unit cost
            <input
              name="unit_cost"
              type="number"
              step="0.0001"
              min="0"
              placeholder="Optional"
            />
          </label>
          <label>
            Lot number
            <input
              name="lot_number"
              maxLength={60}
              placeholder="Leave blank to auto-generate"
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
              Record stock
            </SubmitButton>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function ItemsDirectory({
  items,
  balances,
  preview,
  canManage,
}: {
  items: CatalogItem[];
  balances: StockBalance[];
  preview: boolean;
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const onHand = new Map(balances.map((b) => [b.item_id, b]));
  const filtered = items.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      `${item.name} ${item.code}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>
            Item catalogue <span className="count-bubble">{items.length}</span>
          </h2>
          <p>Raw materials and finished products you keep in stock.</p>
        </div>
        {canManage && (
          <div className="detail-actions">
            <ItemForm preview={preview} />
            <OpeningStockForm
              preview={preview}
              items={items
                .filter((item) => item.is_active)
                .map((item) => ({
                  id: item.id,
                  name: item.name,
                  code: item.code,
                  stock_unit: item.stock_unit,
                }))}
            />
          </div>
        )}
      </div>
      <div className="table-toolbar">
        <div className="input-icon">
          <Search size={17} />
          <label className="sr-only" htmlFor="item-search">
            Search items
          </label>
          <input
            id="item-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search item name or code..."
          />
        </div>
        <label className="sr-only" htmlFor="item-category">
          Filter by category
        </label>
        <select
          id="item-category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">All categories</option>
          <option value="raw_material">Raw materials</option>
          <option value="finished_product">Finished products</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon="inventory"
          title={items.length ? "No matching items" : "Create your first item"}
          description={
            items.length
              ? "Try a different name or category."
              : "Items are the products and materials you buy, produce, and track in stock."
          }
        />
      ) : (
        <div className="table-scroll">
          <table className="record-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th className="num">On hand</th>
                <th className="num">Reorder level</th>
                <th>Status</th>
                {canManage && <th>Edit</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const balance = onHand.get(item.id);
                return (
                  <tr key={item.id}>
                    <td>
                      <span className="primary">{item.name}</span>
                      <span className="sub">{item.code}</span>
                    </td>
                    <td>{categoryLabel(item.category)}</td>
                    <td className="num">
                      {balance ? (
                        <>
                          {formatQty(balance.on_hand, balance.stock_unit)}
                          {balance.is_low && (
                            <span className="sub">
                              <Badge tone="amber">Low</Badge>
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="num">
                      {formatQty(item.reorder_level, item.stock_unit)}
                    </td>
                    <td>
                      <Badge tone={item.is_active ? "green" : "neutral"}>
                        {item.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    {canManage && (
                      <td>
                        <div className="detail-actions">
                          <Modal
                            buttonLabel=""
                            buttonClass="icon-button"
                            icon={<Pencil size={16} />}
                            title={`Edit ${item.name}`}
                            description="Update this item’s details."
                            wide
                          >
                            {({ close }) => (
                              <ItemEditForm
                                item={item}
                                preview={preview}
                                close={close}
                              />
                            )}
                          </Modal>
                          <ItemActiveToggle
                            item={{
                              id: item.id,
                              is_active: item.is_active,
                            }}
                            preview={preview}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="panel-footnote">
        <Boxes size={15} /> Stock balances update automatically from receipts,
        adjustments, and future production.
        {!preview && canManage && (
          <Link href="/modules/inventory" className="inline-link">
            {" "}
            View the stock ledger →
          </Link>
        )}
      </div>
    </section>
  );
}
