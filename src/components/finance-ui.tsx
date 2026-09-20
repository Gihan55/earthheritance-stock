"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Plus, RotateCcw, Split } from "lucide-react";
import {
  allocatePayment,
  allocateReceipt,
  createBill,
  recordBuyerReceipt,
  recordSupplierPayment,
  reverseBuyerReceipt,
  reverseSupplierPayment,
} from "@/app/actions";
import { INITIAL_STATE } from "@/lib/validation";
import type { ActionState } from "@/lib/validation";
import type {
  BillRow,
  BuyerReceiptRow,
  PaymentRow,
  ReceivableRow,
  RegisterFilters,
} from "@/lib/records";
import { formatDate, formatMoney, paymentState } from "@/lib/format";
import { Badge } from "./ui";
import { Modal } from "./client-modal";
import { Feedback, PreviewNote, SubmitButton } from "./forms";

const CURRENCIES = ["USD", "LKR", "INR", "EUR", "GBP", "AED", "AUD", "CAD", "SGD"];
type PartyOption = {
  id: string;
  code: string;
  name: string;
  preferred_currency: string;
};

export function RegisterFilterForm({
  action,
  partyLabel,
  parties,
  filters,
}: {
  action: string;
  partyLabel: string;
  parties: { id: string; code: string; name: string }[];
  filters: RegisterFilters;
}) {
  return (
    <form
      className="panel report-filter-form section-spacer"
      method="get"
      action={action}
    >
      <div className="panel-body form-grid">
        <label>
          {partyLabel}
          <select name="party" defaultValue={filters.partyId ?? ""}>
            <option value="">All {partyLabel.toLowerCase()}s</option>
            {parties.map((party) => (
              <option key={party.id} value={party.id}>
                {party.name} ({party.code})
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input type="date" name="from" defaultValue={filters.from ?? ""} />
        </label>
        <label>
          To
          <input type="date" name="to" defaultValue={filters.to ?? ""} />
        </label>
        <label>
          Currency
          <select name="currency" defaultValue={filters.currency ?? ""}>
            <option value="">Any currency</option>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reference
          <input
            name="reference"
            defaultValue={filters.reference ?? ""}
            maxLength={120}
            placeholder="Code or bank reference"
          />
        </label>
        <label>
          Allocation
          <select name="allocation" defaultValue={filters.allocation ?? ""}>
            <option value="">All states</option>
            <option value="open">Open / unallocated</option>
            <option value="partial">Partially allocated</option>
            <option value="settled">Fully settled</option>
          </select>
        </label>
        <div className="form-actions">
          <button type="submit" className="button button-secondary">
            Apply filters
          </button>
          <Link className="button button-ghost" href={action}>
            Reset
          </Link>
        </div>
      </div>
    </form>
  );
}

function CurrencyInput({ name, value }: { name: string; value?: string }) {
  return (
    <>
      <input
        name={name}
        defaultValue={value}
        list="finance-currency-list"
        maxLength={3}
        minLength={3}
        pattern="[A-Za-z]{3}"
        required
      />
      <datalist id="finance-currency-list">
        {CURRENCIES.map((currency) => (
          <option key={currency} value={currency} />
        ))}
      </datalist>
    </>
  );
}

function BillCreateForm({
  suppliers,
  purchases,
  preview,
  close,
}: {
  suppliers: PartyOption[];
  purchases: { id: string; code: string; supplier_id: string; supplier_name: string }[];
  preview: boolean;
  close: () => void;
}) {
  const [state, action, pending] = useActionState(createBill, INITIAL_STATE);
  const today = new Date().toISOString().slice(0, 10);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const supplierPurchases = purchases.filter(
    (purchase) => purchase.supplier_id === supplierId,
  );
  return (
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
          Linked purchase order
          <select name="purchase_id" defaultValue="">
            <option value="">None (standalone bill)</option>
            {supplierPurchases.map((purchase) => (
              <option key={purchase.id} value={purchase.id}>
                {purchase.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          Issue date <span className="required">*</span>
          <input type="date" name="issue_date" defaultValue={today} required />
        </label>
        <label>
          Due date
          <input type="date" name="due_date" defaultValue="" />
        </label>
        <label>
          Currency <span className="required">*</span>
          <CurrencyInput name="currency" value="USD" />
        </label>
        <label>
          Exchange rate
          <input type="number" name="exchange_rate" min="0" step="0.000001" placeholder="1" />
        </label>
        <label>
          Amount <span className="required">*</span>
          <input type="number" name="amount" min="0.01" step="0.01" required />
        </label>
        <label className="full-width">
          Description
          <input name="description" maxLength={500} placeholder="What is this bill for?" />
        </label>
        <label className="full-width">
          Notes
          <textarea name="notes" rows={2} maxLength={2000} />
        </label>
      </div>
      <Feedback state={state} />
      {preview && <PreviewNote />}
      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={close}>
          Cancel
        </button>
        <SubmitButton pending={pending} disabled={preview}>
          Record bill
        </SubmitButton>
      </div>
    </form>
  );
}

function PaymentForm({
  suppliers,
  preview,
  close,
}: {
  suppliers: PartyOption[];
  preview: boolean;
  close: () => void;
}) {
  const [state, action, pending] = useActionState(
    recordSupplierPayment,
    INITIAL_STATE,
  );
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="stack-form">
      <div className="form-grid">
        <label>
          Supplier <span className="required">*</span>
          <select name="supplier_id" defaultValue={suppliers[0]?.id ?? ""} required>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name} ({supplier.code})
              </option>
            ))}
          </select>
        </label>
        <label>
          Currency <span className="required">*</span>
          <CurrencyInput name="currency" value="USD" />
        </label>
        <label>
          Payment date <span className="required">*</span>
          <input type="date" name="payment_date" defaultValue={today} required />
        </label>
        <label>
          Amount <span className="required">*</span>
          <input type="number" name="amount" min="0.01" step="0.01" required />
        </label>
        <label>
          Exchange rate
          <input type="number" name="exchange_rate" min="0" step="0.000001" placeholder="1" />
        </label>
        <label>
          Method
          <input name="method" maxLength={60} placeholder="e.g. Bank transfer" />
        </label>
        <label>
          Bank / transaction reference
          <input name="reference" maxLength={120} />
        </label>
        <label className="full-width">
          Notes
          <textarea name="notes" rows={2} maxLength={2000} />
        </label>
      </div>
      <Feedback state={state} />
      {preview && <PreviewNote />}
      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={close}>
          Cancel
        </button>
        <SubmitButton pending={pending} disabled={preview}>
          Record payment
        </SubmitButton>
      </div>
    </form>
  );
}

function AllocatePaymentForm({
  payment,
  bills,
  preview,
  close,
}: {
  payment: PaymentRow;
  bills: BillRow[];
  preview: boolean;
  close: () => void;
}) {
  const [state, action, pending] = useActionState(allocatePayment, INITIAL_STATE);
  const open = bills.filter(
    (bill) =>
      bill.supplier_id === payment.supplier_id &&
      bill.currency === payment.currency &&
      Number(bill.outstanding) > 0,
  );
  const [billId, setBillId] = useState(open[0]?.id ?? "");
  const selected = open.find((bill) => bill.id === billId);
  const max = Math.min(Number(payment.unapplied), Number(selected?.outstanding ?? 0));
  return (
    <form action={action} className="stack-form">
      <input type="hidden" name="payment_id" value={payment.id} />
      <p className="muted">
        {payment.code} · {formatMoney(payment.unapplied, payment.currency)} unapplied
      </p>
      {open.length === 0 ? (
        <p className="form-note">
          No open bills match this payment’s supplier and currency.
        </p>
      ) : (
        <div className="form-grid">
          <label className="full-width">
            Allocate to bill
            <select
              name="bill_id"
              value={billId}
              onChange={(event) => setBillId(event.target.value)}
              required
            >
              {open.map((bill) => (
                <option key={bill.id} value={bill.id}>
                  {bill.code} · {formatMoney(bill.outstanding, bill.currency)} outstanding
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount <span className="required">*</span>
            <input
              type="number"
              name="amount"
              min="0.01"
              max={max}
              step="0.01"
              defaultValue={max > 0 ? max : ""}
              required
            />
            <small>Up to {formatMoney(max, payment.currency)}.</small>
          </label>
        </div>
      )}
      <Feedback state={state} />
      {preview && <PreviewNote />}
      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={close}>
          Cancel
        </button>
        <SubmitButton pending={pending} disabled={preview || open.length === 0}>
          Allocate
        </SubmitButton>
      </div>
    </form>
  );
}

function ReverseButton({
  paymentId,
  action,
  label,
  preview,
}: {
  paymentId: string;
  action: (previous: ActionState, payload: FormData) => Promise<ActionState>;
  label: string;
  preview: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  return (
    <form action={formAction} className="inline-form">
      <input type="hidden" name="id" value={paymentId} />
      <button
        type="submit"
        className="button button-secondary button-small"
        disabled={pending || preview}
      >
        <RotateCcw size={14} />
        {pending ? "Reversing..." : label}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function SupplierPaymentsBoard({
  bills,
  allBills,
  payments,
  suppliers,
  purchases,
  canManage,
  preview,
}: {
  bills: BillRow[];
  allBills?: BillRow[];
  payments: PaymentRow[];
  suppliers: PartyOption[];
  purchases: { id: string; code: string; supplier_id: string; supplier_name: string }[];
  canManage: boolean;
  preview: boolean;
}) {
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              Supplier bills <span className="count-bubble">{bills.length}</span>
            </h2>
            <p>Payables raised against raw-material suppliers.</p>
          </div>
          {canManage && !preview && (
            <Modal
              buttonLabel="Record bill"
              icon={<Plus size={16} />}
              title="Record a supplier bill"
              description="Capture a purchase invoice from a supplier to track what you owe."
              wide
            >
              {({ close }) => (
                <BillCreateForm
                  suppliers={suppliers}
                  purchases={purchases}
                  preview={preview}
                  close={close}
                />
              )}
            </Modal>
          )}
        </div>
        {bills.length === 0 ? (
          <div className="panel-body muted">No supplier bills recorded yet.</div>
        ) : (
          <div className="table-scroll">
            <table className="record-table">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Supplier</th>
                  <th>Due</th>
                  <th className="num">Amount</th>
                  <th className="num">Outstanding</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => {
                  const badge = paymentState(bill.payment_state);
                  return (
                    <tr key={bill.id}>
                      <td>
                        <span className="primary">{bill.code}</span>
                      </td>
                      <td>{bill.supplier_name}</td>
                      <td>{formatDate(bill.due_date)}</td>
                      <td className="num">
                        {formatMoney(bill.amount, bill.currency)}
                      </td>
                      <td className="num">
                        {formatMoney(bill.outstanding, bill.currency)}
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
      <section className="panel section-spacer">
        <div className="panel-heading">
          <div>
            <h2>
              Supplier payments{" "}
              <span className="count-bubble">{payments.length}</span>
            </h2>
            <p>Money paid out, with allocated and unapplied balances.</p>
          </div>
          {canManage && !preview && (
            <Modal
              buttonLabel="Record payment"
              icon={<Plus size={16} />}
              title="Record a supplier payment"
              description="Log a payment to a supplier. Allocate it to bills afterwards."
              wide
            >
              {({ close }) => (
                <PaymentForm suppliers={suppliers} preview={preview} close={close} />
              )}
            </Modal>
          )}
        </div>
        {payments.length === 0 ? (
          <div className="panel-body muted">
            No supplier payments recorded yet.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="record-table">
              <thead>
                <tr>
                  <th>Payment</th>
                  <th>Supplier</th>
                  <th>Date</th>
                  <th>Reference</th>
                  <th className="num">Amount</th>
                  <th className="num">Unapplied</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  const reversed = payment.status === "reversed";
                  return (
                    <tr key={payment.id}>
                      <td>
                        <span className="primary">{payment.code}</span>
                      </td>
                      <td>{payment.supplier_name}</td>
                      <td>{formatDate(payment.payment_date)}</td>
                      <td>
                        {payment.reference || "—"}
                        {payment.method && (
                          <span className="sub">{payment.method}</span>
                        )}
                      </td>
                      <td className="num">
                        {formatMoney(payment.amount, payment.currency)}
                      </td>
                      <td className="num">
                        {formatMoney(payment.unapplied, payment.currency)}
                      </td>
                      <td>
                        <Badge tone={reversed ? "neutral" : "green"}>
                          {reversed ? "Reversed" : "Recorded"}
                        </Badge>
                      </td>
                      <td>
                        {canManage &&
                          !preview &&
                          (reversed ? (
                            <span className="muted tiny">—</span>
                          ) : (
                            <div className="detail-actions">
                              {Number(payment.unapplied) > 0 && (
                                <Modal
                                  buttonLabel="Allocate"
                                  buttonClass="button button-secondary button-small"
                                  icon={<Split size={14} />}
                                  title={`Allocate ${payment.code}`}
                                  description="Apply this payment to one of the supplier’s open bills in the same currency."
                                >
                                  {({ close }) => (
                                    <AllocatePaymentForm
                                      payment={payment}
                                      bills={allBills ?? bills}
                                      preview={preview}
                                      close={close}
                                    />
                                  )}
                                </Modal>
                              )}
                              <ReverseButton
                                paymentId={payment.id}
                                action={reverseSupplierPayment}
                                label="Reverse"
                                preview={preview}
                              />
                            </div>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function ReceiptForm({
  buyers,
  preview,
  close,
}: {
  buyers: PartyOption[];
  preview: boolean;
  close: () => void;
}) {
  const [state, action, pending] = useActionState(
    recordBuyerReceipt,
    INITIAL_STATE,
  );
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="stack-form">
      <div className="form-grid">
        <label>
          Buyer <span className="required">*</span>
          <select name="buyer_id" defaultValue={buyers[0]?.id ?? ""} required>
            {buyers.map((buyer) => (
              <option key={buyer.id} value={buyer.id}>
                {buyer.name} ({buyer.code})
              </option>
            ))}
          </select>
        </label>
        <label>
          Currency <span className="required">*</span>
          <CurrencyInput name="currency" value="USD" />
        </label>
        <label>
          Receipt date <span className="required">*</span>
          <input type="date" name="receipt_date" defaultValue={today} required />
        </label>
        <label>
          Amount <span className="required">*</span>
          <input type="number" name="amount" min="0.01" step="0.01" required />
        </label>
        <label>
          Exchange rate
          <input type="number" name="exchange_rate" min="0" step="0.000001" placeholder="1" />
        </label>
        <label>
          Method
          <input name="method" maxLength={60} placeholder="e.g. Wire transfer" />
        </label>
        <label>
          Bank / transaction reference
          <input name="reference" maxLength={120} />
        </label>
        <label className="full-width">
          Notes
          <textarea name="notes" rows={2} maxLength={2000} />
        </label>
      </div>
      <Feedback state={state} />
      {preview && <PreviewNote />}
      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={close}>
          Cancel
        </button>
        <SubmitButton pending={pending} disabled={preview}>
          Record receipt
        </SubmitButton>
      </div>
    </form>
  );
}

function AllocateReceiptForm({
  receipt,
  invoices,
  preview,
  close,
}: {
  receipt: BuyerReceiptRow;
  invoices: ReceivableRow[];
  preview: boolean;
  close: () => void;
}) {
  const [state, action, pending] = useActionState(allocateReceipt, INITIAL_STATE);
  const open = invoices.filter(
    (invoice) =>
      invoice.buyer_id === receipt.buyer_id &&
      invoice.currency === receipt.currency &&
      Number(invoice.outstanding) > 0,
  );
  const [invoiceId, setInvoiceId] = useState(open[0]?.id ?? "");
  const selected = open.find((invoice) => invoice.id === invoiceId);
  const max = Math.min(
    Number(receipt.unapplied),
    Number(selected?.outstanding ?? 0),
  );
  return (
    <form action={action} className="stack-form">
      <input type="hidden" name="receipt_id" value={receipt.id} />
      <p className="muted">
        {receipt.code} · {formatMoney(receipt.unapplied, receipt.currency)} unapplied
      </p>
      {open.length === 0 ? (
        <p className="form-note">
          No open invoices match this receipt’s buyer and currency.
        </p>
      ) : (
        <div className="form-grid">
          <label className="full-width">
            Allocate to invoice
            <select
              name="invoice_id"
              value={invoiceId}
              onChange={(event) => setInvoiceId(event.target.value)}
              required
            >
              {open.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.code} ·{" "}
                  {formatMoney(invoice.outstanding, invoice.currency)} outstanding
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount <span className="required">*</span>
            <input
              type="number"
              name="amount"
              min="0.01"
              max={max}
              step="0.01"
              defaultValue={max > 0 ? max : ""}
              required
            />
            <small>Up to {formatMoney(max, receipt.currency)}.</small>
          </label>
        </div>
      )}
      <Feedback state={state} />
      {preview && <PreviewNote />}
      <div className="form-actions">
        <button type="button" className="button button-secondary" onClick={close}>
          Cancel
        </button>
        <SubmitButton pending={pending} disabled={preview || open.length === 0}>
          Allocate
        </SubmitButton>
      </div>
    </form>
  );
}

export function BuyerReceiptsBoard({
  invoices,
  allInvoices,
  receipts,
  buyers,
  canManage,
  preview,
}: {
  invoices: ReceivableRow[];
  allInvoices?: ReceivableRow[];
  receipts: BuyerReceiptRow[];
  buyers: PartyOption[];
  canManage: boolean;
  preview: boolean;
}) {
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              Buyer invoices{" "}
              <span className="count-bubble">{invoices.length}</span>
            </h2>
            <p>Receivables raised on dispatched export shipments.</p>
          </div>
        </div>
        {invoices.length === 0 ? (
          <div className="panel-body muted">
            No invoices issued yet. Invoice a shipment from its export order.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="record-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Buyer</th>
                  <th>Due</th>
                  <th className="num">Amount</th>
                  <th className="num">Outstanding</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
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
                      <td>{invoice.buyer_name ?? "—"}</td>
                      <td>{formatDate(invoice.due_date)}</td>
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
      <section className="panel section-spacer">
        <div className="panel-heading">
          <div>
            <h2>
              Buyer receipts{" "}
              <span className="count-bubble">{receipts.length}</span>
            </h2>
            <p>Money received, with allocated and unapplied balances.</p>
          </div>
          {canManage && !preview && (
            <Modal
              buttonLabel="Record receipt"
              icon={<Plus size={16} />}
              title="Record a buyer receipt"
              description="Log an incoming payment from a buyer. Allocate it to invoices afterwards."
              wide
            >
              {({ close }) => (
                <ReceiptForm buyers={buyers} preview={preview} close={close} />
              )}
            </Modal>
          )}
        </div>
        {receipts.length === 0 ? (
          <div className="panel-body muted">
            No buyer receipts recorded yet.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="record-table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Buyer</th>
                  <th>Date</th>
                  <th>Reference</th>
                  <th className="num">Amount</th>
                  <th className="num">Unapplied</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => {
                  const reversed = receipt.status === "reversed";
                  return (
                    <tr key={receipt.id}>
                      <td>
                        <span className="primary">{receipt.code}</span>
                      </td>
                      <td>{receipt.buyer_name}</td>
                      <td>{formatDate(receipt.receipt_date)}</td>
                      <td>
                        {receipt.reference || "—"}
                        {receipt.method && (
                          <span className="sub">{receipt.method}</span>
                        )}
                      </td>
                      <td className="num">
                        {formatMoney(receipt.amount, receipt.currency)}
                      </td>
                      <td className="num">
                        {formatMoney(receipt.unapplied, receipt.currency)}
                      </td>
                      <td>
                        <Badge tone={reversed ? "neutral" : "green"}>
                          {reversed ? "Reversed" : "Recorded"}
                        </Badge>
                      </td>
                      <td>
                        {canManage &&
                          !preview &&
                          (reversed ? (
                            <span className="muted tiny">—</span>
                          ) : (
                            <div className="detail-actions">
                              {Number(receipt.unapplied) > 0 && (
                                <Modal
                                  buttonLabel="Allocate"
                                  buttonClass="button button-secondary button-small"
                                  icon={<Split size={14} />}
                                  title={`Allocate ${receipt.code}`}
                                  description="Apply this receipt to one of the buyer’s open invoices in the same currency."
                                >
                                  {({ close }) => (
                                    <AllocateReceiptForm
                                      receipt={receipt}
                                      invoices={allInvoices ?? invoices}
                                      preview={preview}
                                      close={close}
                                    />
                                  )}
                                </Modal>
                              )}
                              <ReverseButton
                                paymentId={receipt.id}
                                action={reverseBuyerReceipt}
                                label="Reverse"
                                preview={preview}
                              />
                            </div>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
