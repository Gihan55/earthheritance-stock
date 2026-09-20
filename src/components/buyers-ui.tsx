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
import { saveBuyer, setBuyerActive } from "@/app/actions";
import { INITIAL_STATE, type ActionState } from "@/lib/validation";
import type { Buyer, BuyerDetail } from "@/lib/records";
import {
  exportOrderStatus,
  formatDate,
  formatMoney,
  formatQty,
  paymentState,
} from "@/lib/format";
import { Badge, EmptyState } from "./ui";
import { Modal } from "./client-modal";
import { CurrencySelect } from "./currency";
import { Feedback, PreviewNote, SubmitButton } from "./forms";

type BuyerFormValues = Partial<BuyerDetail["buyer"]> & { id?: string };

function BuyerFields({
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
  values: BuyerFormValues;
  close: () => void;
}) {
  return (
    <form action={action} className="stack-form">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <div className="form-grid">
        <label className="full-width">
          Buyer name <span className="required">*</span>
          <input
            name="name"
            defaultValue={values.name}
            required
            minLength={2}
            maxLength={160}
            placeholder="e.g. Horizon Garden Supplies"
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
            placeholder="buyer@example.com"
          />
        </label>
        <label>
          Destination country
          <input
            name="destination_country"
            defaultValue={values.destination_country}
            maxLength={80}
            placeholder="Where goods ship to"
          />
        </label>
        <label className="full-width">
          Billing address
          <textarea
            name="billing_address"
            defaultValue={values.billing_address}
            rows={2}
            maxLength={500}
            placeholder="Address used on invoices"
          />
        </label>
        <label className="full-width">
          Shipping address
          <textarea
            name="shipping_address"
            defaultValue={values.shipping_address}
            rows={2}
            maxLength={500}
            placeholder="Delivery / consignee address"
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
            placeholder="e.g. Net 45"
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
            placeholder="Anything worth remembering about this buyer"
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
          Save buyer
        </SubmitButton>
      </div>
    </form>
  );
}

export function BuyerForm({
  preview,
  buyer,
}: {
  preview: boolean;
  buyer?: BuyerDetail["buyer"];
}) {
  const [state, action, pending] = useActionState(saveBuyer, INITIAL_STATE);
  if (buyer)
    return (
      <div className="panel panel-body">
        <h2>Edit buyer</h2>
        <p className="muted">
          Code {buyer.code} is assigned automatically and never changes.
        </p>
        <BuyerFields
          preview={preview}
          state={state}
          action={action}
          pending={pending}
          values={buyer}
          close={() => {}}
        />
      </div>
    );
  return (
    <Modal
      buttonLabel="New buyer"
      icon={<Plus size={16} />}
      title="Add a buyer"
      description="Capture the export partner details you need for orders and invoices."
      wide
    >
      {({ close }) => (
        <BuyerFields
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

function BuyerEditForm({
  buyer,
  preview,
  close,
}: {
  buyer: BuyerDetail["buyer"];
  preview: boolean;
  close: () => void;
}) {
  const [state, action, pending] = useActionState(saveBuyer, INITIAL_STATE);
  return (
    <BuyerFields
      key={state.success ? buyer.id : "edit"}
      preview={preview}
      state={state}
      action={action}
      pending={pending}
      values={buyer}
      close={close}
    />
  );
}

export function BuyerActiveToggle({
  buyer,
  preview,
}: {
  buyer: { id: string; is_active: boolean };
  preview: boolean;
}) {
  const [state, action, pending] = useActionState(
    setBuyerActive,
    INITIAL_STATE,
  );
  return (
    <form action={action} className="detail-actions">
      <input type="hidden" name="id" value={buyer.id} />
      <input
        type="hidden"
        name="is_active"
        value={buyer.is_active ? "false" : "true"}
      />
      <button
        type="submit"
        className="button button-secondary"
        disabled={pending || preview}
      >
        {pending
          ? "Saving..."
          : buyer.is_active
            ? "Deactivate buyer"
            : "Reactivate buyer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function BuyersDirectory({
  buyers,
  preview,
  canManage,
}: {
  buyers: Buyer[];
  preview: boolean;
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = buyers.filter(
    (buyer) =>
      (status === "all" ||
        (status === "active") === buyer.is_active ||
        status === "any") &&
      `${buyer.name} ${buyer.code} ${buyer.contact_person} ${buyer.destination_country}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>
            Buyer directory <span className="count-bubble">{buyers.length}</span>
          </h2>
          <p>Your export partners, contacts, and relationships, in one place.</p>
        </div>
        {canManage && <BuyerForm preview={preview} />}
      </div>
      <div className="table-toolbar">
        <div className="input-icon">
          <Search size={17} />
          <label className="sr-only" htmlFor="buyer-search">
            Search buyers
          </label>
          <input
            id="buyer-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, code, contact, or country..."
          />
        </div>
        <label className="sr-only" htmlFor="buyer-status">
          Filter by status
        </label>
        <select
          id="buyer-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="active">Active buyers</option>
          <option value="inactive">Inactive buyers</option>
          <option value="any">All buyers</option>
        </select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon="buyers"
          title={
            buyers.length ? "No matching buyers" : "Add your first buyer"
          }
          description={
            buyers.length
              ? "Try a different name, code, or country."
              : "Buyers power your export orders and invoices. Create a profile to start planning shipments for them."
          }
        />
      ) : (
        <div className="table-scroll">
          <table className="record-table">
            <thead>
              <tr>
                <th>Buyer</th>
                <th>Contact</th>
                <th>Destination</th>
                <th>Currency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((buyer) => (
                <tr key={buyer.id}>
                  <td>
                    <Link href={`/modules/buyers/${buyer.id}`}>
                      <span className="primary">{buyer.name}</span>
                      <span className="sub">{buyer.code}</span>
                    </Link>
                  </td>
                  <td>
                    {buyer.contact_person || "—"}
                    <span className="sub">
                      {buyer.phone || buyer.email || "No contact"}
                    </span>
                  </td>
                  <td>{buyer.destination_country || "—"}</td>
                  <td>{buyer.preferred_currency || "—"}</td>
                  <td>
                    <Badge tone={buyer.is_active ? "green" : "neutral"}>
                      {buyer.is_active ? "Active" : "Inactive"}
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

export function BuyerSummary({
  buyer,
  canManage,
  preview,
}: {
  buyer: BuyerDetail["buyer"];
  canManage: boolean;
  preview: boolean;
}) {
  return (
    <section className="panel panel-body">
      <div
        className="detail-actions"
        style={{ justifyContent: "space-between" }}
      >
        <Link href="/modules/buyers" className="button button-secondary">
          <ArrowLeft size={16} />
          All buyers
        </Link>
        {canManage && (
          <Modal
            buttonLabel="Edit details"
            buttonClass="button button-secondary"
            icon={<Pencil size={15} />}
            title={`Edit ${buyer.name}`}
            description="Update the contact and commercial details for this buyer."
            wide
          >
            {({ close }) => (
              <BuyerEditForm buyer={buyer} preview={preview} close={close} />
            )}
          </Modal>
        )}
      </div>
      <dl className="definition-grid section-spacer">
        <div>
          <dt>Contact person</dt>
          <dd>
            <UserRound size={13} /> {buyer.contact_person || "—"}
          </dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>
            <Phone size={13} /> {buyer.phone || "—"}
          </dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>
            <Mail size={13} /> {buyer.email || "—"}
          </dd>
        </div>
        <div>
          <dt>Destination country</dt>
          <dd>
            <MapPin size={13} /> {buyer.destination_country || "—"}
          </dd>
        </div>
        <div>
          <dt>Tax / registration ID</dt>
          <dd>{buyer.tax_id || "—"}</dd>
        </div>
        <div>
          <dt>Payment terms</dt>
          <dd>{buyer.payment_terms || "—"}</dd>
        </div>
        <div>
          <dt>Preferred currency</dt>
          <dd>
            <Building2 size={13} /> {buyer.preferred_currency || "—"}
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <Badge tone={buyer.is_active ? "green" : "neutral"}>
              {buyer.is_active ? "Active" : "Inactive"}
            </Badge>
          </dd>
        </div>
      </dl>
      {buyer.billing_address && (
        <p className="muted section-spacer">
          <strong>Billing address:</strong> {buyer.billing_address}
        </p>
      )}
      {buyer.shipping_address && (
        <p className="muted">
          <strong>Shipping address:</strong> {buyer.shipping_address}
        </p>
      )}
      {buyer.notes && (
        <p className="muted">
          <strong>Notes:</strong> {buyer.notes}
        </p>
      )}
    </section>
  );
}

export function BuyerHistory({ detail }: { detail: BuyerDetail }) {
  return (
    <>
      <section className="panel section-spacer">
        <div className="panel-heading">
          <div>
            <h2>Export orders</h2>
            <p>Orders raised with this buyer.</p>
          </div>
        </div>
        {detail.orders.length === 0 ? (
          <div className="panel-body muted">No export orders recorded yet.</div>
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
                {detail.orders.map((order) => {
                  const badge = exportOrderStatus(order.status);
                  return (
                    <tr key={order.id}>
                      <td>
                        <Link
                          href={`/modules/exports/${order.id}`}
                          className="primary"
                        >
                          {order.code}
                        </Link>
                      </td>
                      <td>{formatDate(order.order_date)}</td>
                      <td>{order.currency}</td>
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
      {detail.itemTotals.length > 0 && (
        <section className="panel section-spacer">
          <div className="panel-heading">
            <div>
              <h2>Quantity totals by product</h2>
              <p>Across every export order from this buyer.</p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="record-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Ordered</th>
                  <th className="num">Shipped</th>
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
        </section>
      )}
      {detail.receivables.length > 0 || detail.totals.length > 0 ? (
        <section className="panel section-spacer">
          <div className="panel-heading">
            <div>
              <h2>Invoices &amp; receipts</h2>
              <p>Outstanding balances on this buyer’s export invoices.</p>
            </div>
          </div>
          {detail.totals.length > 0 && (
            <div className="panel-body">
              <div className="table-scroll">
                <table className="record-table">
                  <thead>
                    <tr>
                      <th>Currency</th>
                      <th className="num">Invoiced</th>
                      <th className="num">Received</th>
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
                        <td className="num">
                          {formatMoney(row.paid, row.currency)}
                        </td>
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
                  href={`/modules/reports?statement=buyer&party=${detail.buyer.id}`}
                  className="inline-link"
                >
                  View full buyer statement (invoices, receipts, running
                  balance)
                </Link>
              </p>
            </div>
          )}
          {detail.receivables.length > 0 && (
          <div className="table-scroll">
            <table className="record-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Issued</th>
                  <th className="num">Amount</th>
                  <th className="num">Outstanding</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {detail.receivables.map((invoice) => {
                  const badge = paymentState(invoice.payment_state);
                  return (
                    <tr key={invoice.id}>
                      <td>
                        <Link
                          className="primary"
                          href={`/modules/documents/invoice/${invoice.id}`}
                        >
                          {invoice.code}
                        </Link>
                      </td>
                      <td>{formatDate(invoice.issue_date)}</td>
                      <td className="num">
                        {formatMoney(invoice.amount, invoice.currency)}
                      </td>
                      <td className="num">
                        {formatMoney(invoice.outstanding, invoice.currency)}
                      </td>
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
      ) : null}
    </>
  );
}
