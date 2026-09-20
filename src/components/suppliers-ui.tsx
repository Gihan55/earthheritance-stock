"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  UserRound,
} from "lucide-react";
import {
  saveSupplier,
  saveSupplierPaymentDetails,
  setSupplierActive,
} from "@/app/actions";
import { INITIAL_STATE, type ActionState } from "@/lib/validation";
import type {
  Supplier,
  SupplierDetail,
  SupplierPaymentDetails,
} from "@/lib/records";
import { formatDate, formatMoney, formatQty, purchaseStatus } from "@/lib/format";
import { Badge, EmptyState } from "./ui";
import { Modal } from "./client-modal";
import { CurrencySelect } from "./currency";
import { Feedback, PreviewNote, SubmitButton } from "./forms";

type SupplierFormValues = Partial<SupplierDetail["supplier"]> & {
  id?: string;
};

function SupplierFields({
  preview,
  state,
  action,
  pending,
  values,
  close,
}: {
  preview: boolean;
  state: ActionState;
  action: (payload: FormData) => void;
  pending: boolean;
  values: SupplierFormValues;
  close: () => void;
}) {
  return (
    <form action={action} className="stack-form">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="form-grid">
        <label className="full-width">
          Supplier name <span className="required">*</span>
          <input
            name="name"
            defaultValue={values.name}
            required
            minLength={2}
            maxLength={160}
            placeholder="e.g. Green Grove Cocopeat"
          />
        </label>
        <label>
          Contact person
          <input
            name="contact_person"
            defaultValue={values.contact_person}
            maxLength={120}
            placeholder="Who do you deal with?"
          />
        </label>
        <label>
          Phone
          <input
            name="phone"
            defaultValue={values.phone}
            maxLength={40}
            placeholder="Include country code"
          />
        </label>
        <label>
          Email
          <input
            type="email"
            name="email"
            defaultValue={values.email}
            maxLength={254}
            placeholder="supplier@example.com"
          />
        </label>
        <label>
          Country
          <input
            name="country"
            defaultValue={values.country}
            maxLength={80}
            placeholder="Supplier’s country"
          />
        </label>
        <label className="full-width">
          Address
          <textarea
            name="address"
            defaultValue={values.address}
            rows={2}
            maxLength={500}
            placeholder="Street address, city, postal code"
          />
        </label>
        <label>
          Tax / registration ID
          <input
            name="tax_id"
            defaultValue={values.tax_id}
            maxLength={60}
            placeholder="Optional"
          />
        </label>
        <label>
          Payment terms
          <input
            name="payment_terms"
            defaultValue={values.payment_terms}
            maxLength={160}
            placeholder="e.g. Net 30"
          />
        </label>
        <label>
          Preferred currency
          <CurrencySelect
            name="preferred_currency"
            defaultValue={values.preferred_currency}
            includeBlank
          />
        </label>
        <label className="full-width">
          Notes
          <textarea
            name="notes"
            defaultValue={values.notes}
            rows={2}
            maxLength={2000}
            placeholder="Anything worth remembering about this supplier"
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
          Save supplier
        </SubmitButton>
      </div>
    </form>
  );
}

export function SupplierForm({
  preview,
  supplier,
}: {
  preview: boolean;
  supplier?: SupplierDetail["supplier"];
}) {
  const [state, action, pending] = useActionState(saveSupplier, INITIAL_STATE);
  if (supplier)
    return (
      <div className="panel panel-body">
        <h2>Edit supplier</h2>
        <p className="muted">
          Code {supplier.code} is assigned automatically and never changes.
        </p>
        <SupplierFields
          preview={preview}
          state={state}
          action={action}
          pending={pending}
          values={supplier}
          close={() => {}}
        />
      </div>
    );
  return (
    <Modal
      buttonLabel="New supplier"
      icon={<Plus size={16} />}
      title="Add a supplier"
      description="Capture the raw-material partner details you need for purchasing."
      wide
    >
      {({ close }) => (
        <SupplierFields
          key={state.success ? "saved" : "form"}
          preview={preview}
          state={state}
          action={action}
          pending={pending}
          values={{ preferred_currency: "USD" }}
          close={close}
        />
      )}
    </Modal>
  );
}

function SupplierEditForm({
  supplier,
  preview,
  close,
}: {
  supplier: SupplierDetail["supplier"];
  preview: boolean;
  close: () => void;
}) {
  const [state, action, pending] = useActionState(saveSupplier, INITIAL_STATE);
  return (
    <SupplierFields
      key={state.success ? supplier.id : "edit"}
      preview={preview}
      state={state}
      action={action}
      pending={pending}
      values={supplier}
      close={close}
    />
  );
}

export function SupplierActiveToggle({
  supplier,
  preview,
}: {
  supplier: { id: string; name: string; is_active: boolean };
  preview: boolean;
}) {
  const [state, action, pending] = useActionState(
    setSupplierActive,
    INITIAL_STATE,
  );
  return (
    <form action={action} className="detail-actions">
      <input type="hidden" name="id" value={supplier.id} />
      <input
        type="hidden"
        name="is_active"
        value={supplier.is_active ? "false" : "true"}
      />
      <button
        type="submit"
        className="button button-secondary"
        disabled={pending || preview}
      >
        {pending
          ? "Saving..."
          : supplier.is_active
            ? "Deactivate supplier"
            : "Reactivate supplier"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function SupplierPaymentForm({
  supplierId,
  details,
  preview,
}: {
  supplierId: string;
  details: SupplierPaymentDetails | null;
  preview: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveSupplierPaymentDetails,
    INITIAL_STATE,
  );
  return (
    <form action={action} className="stack-form">
      <input type="hidden" name="supplier_id" value={supplierId} />
      <label>
        Bank name
        <input
          name="bank_name"
          defaultValue={details?.bank_name}
          maxLength={160}
        />
      </label>
      <label>
        Bank account / IBAN
        <input
          name="bank_account"
          defaultValue={details?.bank_account}
          maxLength={120}
        />
      </label>
      <label>
        Payment notes
        <textarea
          name="payment_notes"
          defaultValue={details?.payment_notes}
          rows={2}
          maxLength={1000}
        />
      </label>
      <Feedback state={state} />
      {preview && <PreviewNote />}
      <SubmitButton pending={pending} disabled={preview}>
        Save payment details
      </SubmitButton>
    </form>
  );
}

export function SuppliersDirectory({
  suppliers,
  preview,
  canManage,
}: {
  suppliers: Supplier[];
  preview: boolean;
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = suppliers.filter(
    (supplier) =>
      (status === "all" ||
        (status === "active") === supplier.is_active ||
        status === "any") &&
      `${supplier.name} ${supplier.code} ${supplier.contact_person} ${supplier.country}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>
            Supplier directory{" "}
            <span className="count-bubble">{suppliers.length}</span>
          </h2>
          <p>Your raw-material partners, in one place.</p>
        </div>
        {canManage && <SupplierForm preview={preview} />}
      </div>
      <div className="table-toolbar">
        <div className="input-icon">
          <Search size={17} />
          <label className="sr-only" htmlFor="supplier-search">
            Search suppliers
          </label>
          <input
            id="supplier-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, code, contact, or country..."
          />
        </div>
        <label className="sr-only" htmlFor="supplier-status">
          Filter by status
        </label>
        <select
          id="supplier-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="active">Active suppliers</option>
          <option value="inactive">Inactive suppliers</option>
          <option value="any">All suppliers</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon="suppliers"
          title={
            suppliers.length
              ? "No matching suppliers"
              : "Add your first raw-material supplier"
          }
          description={
            suppliers.length
              ? "Try a different name, code, or country."
              : "Suppliers power your purchasing and stock. Create a profile to start recording what you buy from each of them."
          }
        />
      ) : (
        <div className="table-scroll">
          <table className="record-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Contact</th>
                <th>Country</th>
                <th>Currency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((supplier) => (
                <tr key={supplier.id}>
                  <td>
                    <Link href={`/modules/suppliers/${supplier.id}`}>
                      <span className="primary">{supplier.name}</span>
                      <span className="sub">{supplier.code}</span>
                    </Link>
                  </td>
                  <td>
                    {supplier.contact_person || "—"}
                    <span className="sub">
                      {supplier.phone || supplier.email || "No contact"}
                    </span>
                  </td>
                  <td>{supplier.country || "—"}</td>
                  <td>{supplier.preferred_currency || "—"}</td>
                  <td>
                    <Badge tone={supplier.is_active ? "green" : "neutral"}>
                      {supplier.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function SupplierSummary({
  supplier,
  canManage,
  preview,
}: {
  supplier: SupplierDetail["supplier"];
  canManage: boolean;
  preview: boolean;
}) {
  return (
    <section className="panel panel-body">
      <div
        className="detail-actions"
        style={{ justifyContent: "space-between" }}
      >
        <Link href="/modules/suppliers" className="button button-secondary">
          <ArrowLeft size={16} />
          All suppliers
        </Link>
        {canManage && (
          <Modal
            buttonLabel="Edit details"
            buttonClass="button button-secondary"
            icon={<Pencil size={15} />}
            title={`Edit ${supplier.name}`}
            description="Update the contact and commercial details for this supplier."
            wide
          >
            {({ close }) => (
              <SupplierEditForm
                supplier={supplier}
                preview={preview}
                close={close}
              />
            )}
          </Modal>
        )}
      </div>
      <dl className="definition-grid section-spacer">
        <div>
          <dt>Contact person</dt>
          <dd>
            <UserRound size={13} /> {supplier.contact_person || "—"}
          </dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>
            <Phone size={13} /> {supplier.phone || "—"}
          </dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>
            <Mail size={13} /> {supplier.email || "—"}
          </dd>
        </div>
        <div>
          <dt>Country</dt>
          <dd>
            <MapPin size={13} /> {supplier.country || "—"}
          </dd>
        </div>
        <div>
          <dt>Tax / registration ID</dt>
          <dd>{supplier.tax_id || "—"}</dd>
        </div>
        <div>
          <dt>Payment terms</dt>
          <dd>{supplier.payment_terms || "—"}</dd>
        </div>
        <div>
          <dt>Preferred currency</dt>
          <dd>
            <Building2 size={13} /> {supplier.preferred_currency || "—"}
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <Badge tone={supplier.is_active ? "green" : "neutral"}>
              {supplier.is_active ? "Active" : "Inactive"}
            </Badge>
          </dd>
        </div>
      </dl>
      {supplier.address && (
        <p className="muted section-spacer">
          <strong>Address:</strong> {supplier.address}
        </p>
      )}
      {supplier.notes && (
        <p className="muted">
          <strong>Notes:</strong> {supplier.notes}
        </p>
      )}
    </section>
  );
}

export function SupplierHistory({ detail }: { detail: SupplierDetail }) {
  return (
    <section className="panel section-spacer">
      <div className="panel-heading">
        <div>
          <h2>Purchase history</h2>
          <p>Orders raised with this supplier.</p>
        </div>
      </div>
      {detail.purchases.length === 0 ? (
        <div className="panel-body muted">No purchase orders recorded yet.</div>
      ) : (
        <div className="table-scroll">
          <table className="record-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Order date</th>
                <th>Currency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.purchases.map((purchase) => {
                const badge = purchaseStatus(purchase.status);
                return (
                  <tr key={purchase.id}>
                    <td>
                      <Link
                        href={`/modules/inventory/purchases/${purchase.id}`}
                        className="primary"
                      >
                        {purchase.code}
                      </Link>
                    </td>
                    <td>{formatDate(purchase.order_date)}</td>
                    <td>{purchase.currency}</td>
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
      {detail.itemTotals.length > 0 && (
        <div className="panel-body">
          <h3 className="form-section-title">
            <span>Quantity totals by item</span>
          </h3>
          <div className="table-scroll">
            <table className="record-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Ordered</th>
                  <th className="num">Received</th>
                </tr>
              </thead>
              <tbody>
                {detail.itemTotals.map((row) => (
                  <tr key={row.item_id}>
                    <td>
                      <span className="primary">
                        {row.name} ({row.code})
                      </span>
                    </td>
                    <td className="num">
                      {formatQty(row.ordered_quantity, row.stock_unit)}
                    </td>
                    <td className="num">
                      {formatQty(row.delivered_quantity, row.stock_unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {detail.itemTotals.length === 0 && detail.suppliedItems.length > 0 && (
        <div className="panel-body">
          <h3 className="form-section-title">
            <span>Supplied items</span>
          </h3>
          <p className="muted">
            {detail.suppliedItems
              .map((item) => `${item.name} (${item.code})`)
              .join(", ")}
          </p>
        </div>
      )}
      {detail.totals.length > 0 && (
        <div className="panel-body">
          <h3 className="form-section-title">
            <span>Account summary</span>
          </h3>
          <div className="table-scroll">
            <table className="record-table">
              <thead>
                <tr>
                  <th>Currency</th>
                  <th className="num">Billed</th>
                  <th className="num">Paid</th>
                  <th className="num">Unapplied (advance)</th>
                  <th className="num">Outstanding balance</th>
                </tr>
              </thead>
              <tbody>
                {detail.totals.map((row) => (
                  <tr key={row.currency}>
                    <td>{row.currency}</td>
                    <td className="num">
                      {formatMoney(row.billed, row.currency)}
                    </td>
                    <td className="num">{formatMoney(row.paid, row.currency)}</td>
                    <td className="num">
                      {formatMoney(row.unapplied, row.currency)}
                    </td>
                    <td className="num">
                      {formatMoney(row.outstanding, row.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            <Link
              href={`/modules/reports?statement=supplier&party=${detail.supplier.id}`}
              className="inline-link"
            >
              View full supplier statement (bills, payments, running balance)
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}
