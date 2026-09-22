# Earthheritance — User Guide

A plain-language guide for everyone working in the cocopeat
manufacturing & export workspace.

---

## 1. Getting started

### Signing in
1. Open your workspace address (your administrator will share it).
2. Enter the **email address** you were invited with and the password you
   set when accepting the invitation.
3. First-time invitees are taken straight to a **Set password** screen —
   choose a passphrase of at least **12 characters**. You are then brought
   to your Overview.

> Access is by invitation only. If you cannot sign in, or you think your
> password needs resetting, contact your administrator — they can reset it
> from the Team page.

### Your Overview
The first page after sign-in shows the numbers that matter to **your**
role — stock levels, open orders, production, payments due, and the latest
activity. What you see depends on your access level; colleagues with other
roles see different cards.

### On your phone
The workspace is fully responsive: the menu collapses into a hamburger
button, tables scroll, and every form is touch-friendly. You can approve,
record, dispatch and print from a phone.

### Navigation
The sidebar groups everything:

| Group | Items |
|---|---|
| (top) | **Overview**, global **Search** (jump to any code/name) |
| Partners | **Suppliers**, **Buyers** |
| Operations | **Inventory**, **Production**, **Exports & shipments** |
| Finance | **Supplier payments**, **Buyer receipts** |
| Insights | **Reports** |
| Administration (admins only) | **Team members**, **Roles & permissions**, **Company settings** |
| (bottom) | **Setup & guidance**, your **account menu** (Change password, Sign out) |

A small live-refresh indicator pulls in changes made by colleagues, so you
rarely need to reload manually.

## 2. How your role shapes the app

| Role | Typical job | What you can do |
|---|---|---|
| **Administrator** | Owner / IT | Everything, including team, roles and settings |
| **Manager** | Operations manager | View every module, approve stock adjustments, read the audit trail |
| **Stores** | Warehouse officer | Suppliers, purchase orders, goods receipts, items, stock, adjustments |
| **Production** | Factory supervisor | Record production batches and wastage, view stock |
| **Export Sales** | Sales / export desk | Buyers, export orders, shipments, invoices |
| **Finance** | Accounts | Supplier bills & payments, buyer invoices & receipts, reports |

You only see modules your role can open. If a button is missing, you most
likely lack the permission — ask an administrator.

**Golden rule of data:** nothing is ever deleted. Mistakes are corrected by
cancelling, reversing or deactivating, so your history always adds up.

## 3. Suppliers & purchasing (Stores)

### Add a supplier
**Suppliers → New supplier.** Name, contact person, phone, email, address,
country, tax ID, payment terms and a **preferred currency** (choose
**LKR** for local suppliers — every purchase form for them will start in
LKR). You can also store bank details for payments.

### Create a purchase order
1. **Inventory → Purchases → New purchase order.**
2. Pick the supplier — the currency dropdown defaults to their preferred
   currency (change it from the dropdown if needed).
3. Add lines: item, quantity, unit price. Set expected delivery date.
4. The order starts as a **Draft**. Open it and press **Confirm** when the
   order is really placed.

### Receive goods
Open a confirmed purchase → **Receive goods**. Enter the quantity arriving
per line (partial receipts are fine — the status moves to
*Partially received*). Each receipt creates or extends a **lot** (batch
number) so stock stays traceable to its supplier.

### Items, opening stock and adjustments
- **Inventory → Items → New item**: raw materials (wet cocopeat, blocks…)
  and finished products (5 kg bags, discs…), each with one stock unit,
  net weight and packaging spec.
- **Opening stock** records what was already in the warehouse before go-live.
- **Stock adjustments** fix counting errors: anyone with store access
  *requests* an increase/decrease with a reason; a manager (or admin)
  *approves or rejects* it — two pairs of eyes on every stock change.

### Attach paperwork
Any purchase or goods-receipt row has a **Files** link. Upload delivery
notes, weighing slips, certificates (PDF/JPG/PNG/DOCX/XLSX up to 10 MB).
Files are private: only roles connected to that record's module can see or
download them.

## 4. Production (Production role)

1. **Production → New batch.**
2. Add the **inputs**: lots of raw material consumed (pick from stock;
   available quantities are shown).
3. Add the **output**: item, quantity produced, and any **wastage**.
4. Save as **Draft** while confirming figures, then **Post** the batch.
   Posting moves stock in one atomic step: raw lots go down, a new finished
   lot is created, wastage is recorded.
5. A posted batch can be **Reversed** only if the produced lot has not been
   used or shipped yet. Reversal restores all stock exactly.

Every finished lot carries a traceability line back to the batch and the
original suppliers — visible on the batch page and supplier profiles.

## 5. Buyers & exports (Export Sales)

### Add a buyer
**Buyers → New buyer**: contact, billing and shipping addresses,
destination country, payment terms, and **preferred currency** (usually
**USD** or another foreign currency for overseas buyers).

### Create an export order
1. **Exports & shipments → New export order.**
2. Choose the buyer — currency defaults to their preference (dropdown:
   USD, LKR, EUR, GBP, AED, …).
3. Add product lines (quantity, unit price), incoterms and destination.
4. **Confirm** the order when agreed. Confirming **reserves** matching
   finished stock automatically (oldest lots first). Available quantities
   on the Inventory page update instantly.

### Plan and dispatch a shipment
Open the order → **New shipment**:
1. Fill container number, port of loading/discharge, ETD, and the lines
   (lots + quantities) going into this container. Status: **Draft**.
2. Mark **Ready** when goods are staged.
3. **Dispatch** when the container leaves — reservations are consumed and
   stock physically moves out. A partially filled order stays
   *Partially shipped*; add more shipments until complete.
4. Mark **Delivered** on arrival. **Close** the order when everything is
   settled — any leftover reservations are released.

### Invoice a shipment
On a dispatched shipment, press **New invoice**: issue/due dates, currency
(order's currency preselected), exchange rate, and the invoice lines.
Printable **Commercial invoice** and **Packing list** (with your company
letterhead) open from the invoice/shipment rows — use your browser's Print
dialog for PDF.

Attach supporting documents (BL, certificates, packing photos) via the
**Files** links on orders, shipments and invoices.

## 6. Money (Finance)

Currency rule: **supplier side is usually LKR, buyer/export side is USD or
another foreign currency.** Amounts are never mixed across currencies —
every register, balance and report is grouped per currency. Record the
exchange rate you used on each document for reporting.

### Paying suppliers
1. **Supplier payments → New bill**: supplier, issue/due date, currency
   (dropdown), amount, optionally linked to a purchase order.
2. **Record payment** when money goes out (bank transfer, cash, cheque +
   reference).
3. **Allocate** the payment to one or more bills. An advance stays as an
   *unapplied balance* until you allocate it.
4. Wrong entry? **Reverse** the payment — allocations unwind, balances
   return. The record stays visible for the audit trail.

### Receiving from buyers
1. Invoices come from the export desk (see §5). They appear in
   **Buyer receipts** with their outstanding balance.
2. **Record receipt** for each incoming payment, then **allocate** it to
   the invoice(s) it settles (partial and advance payments supported).
3. Receipts can be reversed the same way.

### Staying on top of things
- The registers filter by party, date range, currency, reference and
  allocation state (open / partial / settled).
- **Reports → Overdue documents** lists past-due invoices and bills.
- Payment evidence (bank slips) belongs on each bill/payment/receipt
  **Files** tab.

## 7. Reports (Manager, Finance, Admin)

**Reports** opens a set of summaries: stock levels, production output vs
consumption vs wastage, export sales by buyer/product/country, shipment
schedule, overdue documents, and unapplied balances. Each report:

1. Filter by date (and other fields where offered).
2. Read on screen, or press **Export CSV** for Excel.

Reports only ever contain rows your role is allowed to see.

## 8. Managing the team (Administrator)

### Invite someone
1. **Team members** → fill name, email, pick an access level → **Send
   invitation**. They receive an email to set their own password
   (link valid 24 hours).
2. If the invitation expires, just send it again.

### Change access or pause someone
On each team row: pick a new role and/or set **Inactive**, then **Save**.
Deactivating removes access immediately but keeps all of that person's
history. The system always protects at least one active administrator.

### Reset someone's password
Locked-out colleague: on their row press **Reset password**, type a new
passphrase twice, **Save password**. They are signed out on every device
and must use the new password next time. Tell them to change it
themselves afterwards via the account menu → **Change password**.
(You cannot reset the last active administrator's password from here —
that person uses their own Change password page.)

### Fine-tune roles
**Roles & permissions** lets you tick individual permissions per role
(everything except the administrator role, which is always full). Changes
apply to all staff holding that role on their next action.

## 9. Company settings (Administrator)

**Settings** holds the details used across the app — company name, email,
phone, address and country appear as the **letterhead** on printable
invoices and packing lists. Set the **base currency** (your reporting
currency — for a Sri Lankan exporter this is typically LKR) and the
warehouse name.

## 10. Account security (everyone)

Account menu (top right) → **Change password**. Pick at least 12
characters; changing it signs you out of your other devices automatically.

## 11. Good practice

- Enter real documents and amounts — the app ships with **no demo data**,
  so every figure you see came from your team.
- Use **Draft** states to park work-in-progress; confirm only when real.
- Attach the paperwork (Files) at the moment the transaction happens, not
  weeks later.
- One person records, another approves/reverses where the app asks for it.
- Check the Overview every morning — overdue items are surfaced for you.

## 12. Troubleshooting & common messages

| You see | What it means | What to do |
|---|---|---|
| "You do not have permission to perform this action" | Your role doesn't include this operation | Ask an administrator for access or to perform it |
| "Your staff access is not active" | You were deactivated or your profile is incomplete | Contact your administrator |
| "The change could not be saved. Check your database setup and try again." | A technical problem on the server side | Retry once; if it persists, report the exact screen and values to your administrator |
| "Insufficient stock…" / "not enough available" | The lot doesn't hold the quantity (some may be reserved) | Check Inventory → available vs reserved; adjust or reserve elsewhere |
| "Keep at least one active administrator" | You can't remove the last admin's access | Promote another administrator first |
| "Only a draft order can be confirmed" | The document already moved to the next stage | Check its status; use the correct action for that status |
| A Files upload fails | File over 10 MB or unsupported type | Compress or convert (PDF/JPG/PNG/WEBP/DOCX/XLSX) |
| Numbers look stale | Someone else is editing | Wait a moment — the live indicator refreshes automatically |

---

*Need the technical details (architecture, security, deployment)?*
See the [System Document](./system-document.md).
