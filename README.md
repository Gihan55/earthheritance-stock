# Earthheritance — Cocopeat Manufacturing & Export Management

A multi-user web application for running a cocopeat factory end to end: buying
raw material from suppliers, tracking stock by lot, running production batches,
fulfilling export orders for buyers, and keeping every invoice, bill, payment
and receipt — plus their supporting paperwork — in one permission-aware system.

Live app: https://earthheritance-stock-manage.vercel.app
Repository: https://github.com/Gihan55/earthheritance-stock

---

## 1. Technology

| Layer | Choice |
|---|---|
| Web app | Next.js 16 (App Router, React Server Components, Turbopack), TypeScript, no UI framework |
| Database & auth | Supabase (PostgreSQL 16, Row Level Security, GoTrue auth) |
| File storage | Supabase Storage — private `attachments` bucket |
| Realtime | Supabase Realtime publications → automatic table refresh |
| Hosting | Vercel |
| Tests | Vitest + PGlite (a real Postgres compiled to WASM runs the actual migrations) |

There is no separate API server: pages are server-rendered, every mutation goes
through a React Server Action that calls a `SECURITY DEFINER` Postgres function
(`app_*` RPCs). The browser's Supabase client is used only for login and for
uploading files directly to Storage.

## 2. Modules

| Module | Route | What it does |
|---|---|---|
| Overview | `/` | Role-appropriate metrics, low stock, overdue items |
| Suppliers & purchasing | `/modules/suppliers`, `/modules/inventory/purchases` | Supplier profiles, purchase orders, goods receipts (partial allowed), supplier-wise totals |
| Stock | `/modules/inventory` | Items, lots, opening stock, movement ledger, adjustments (request + manager approval) |
| Production | `/modules/production` | Batches: consume input lots → create finished lots + wastage, full traceability supplier lot → dispatched lot |
| Buyers & exports | `/modules/buyers`, `/modules/exports` | Buyer profiles, export orders (Draft→Confirmed→Partially Shipped→Shipped→Closed), stock reservations, shipments (Draft→Ready→Dispatched→Delivered) |
| Finance | `/modules/supplier-payments`, `/modules/buyer-receipts` | Supplier bills & payments, buyer invoices & receipts, advances, allocation across documents, auditable reversals |
| Documents | `/modules/documents/invoice/[id]`, `/modules/documents/packing/[id]` | Printable commercial invoices and packing lists on company letterhead |
| Files | `/modules/files/[entity]/[id]` | Private supporting documents (certificates, B/L, payment evidence) attached to any record |
| Reports | `/modules/reports` | Stock, production, export sales, receivables/payables, overdue, statements — with CSV export and print |
| Admin | `/team`, `/roles`, `/settings`, `/setup` | Staff invitations, role permission matrix, company letterhead details |

## 3. Roles & permissions

Six roles, stored in `public.profiles.role`; permissions resolved in-database
by `app_has_permission()` (administrators short-circuit to *all* permissions):

| Role | Access |
|---|---|
| `administrator` | Everything, incl. users, roles, settings. Cannot be demoted if last active admin |
| `manager` | Views all modules; approves adjustments/reversals; no data entry by default |
| `stores` | Suppliers, purchasing, receipts, stock, adjustments requests |
| `production` | Batch recording and traceability only — no financial data |
| `export_sales` | Buyers, orders, reservations, shipments, invoices — no payment posting |
| `finance` | Bills, payments, receipts, allocations, reports |

Permissions are per-key (`inventory.manage`, `finance.view`, …) and editable per
role on `/roles` except the administrator role, which is protected. **Every**
enforcement point is server-side: RLS policies on tables, `app_has_permission`
checks inside each RPC, permission guards on each page/action, and Storage
policies on file paths. Hiding a menu is never the only defense.

## 4. Security model (read this before extending)

- Base tables are `SELECT`-only for `authenticated` — all writes go through
  `app_*` functions marked `SECURITY DEFINER` with a locked `search_path`.
- Posted stock and financial records are never edited or deleted; corrections
  happen through reversal RPCs that write `audit_events`.
- Reporting views use `security_invoker = true` so RLS applies to the viewer.
- File uploads are private: bucket `attachments`, path
  `<entity_type>/<record-uuid>/<random>-<filename>`; Storage policies derive
  access from the folder's entity type; downloads go through
  `/attachments/[id]` which checks RLS then issues a 30-second signed URL.
- Sign-ups are invitation-only; invitations enroll the user with the assigned
  role via a trigger (must be accepted within 24 hours).
- The app **fails closed**: production without Supabase env vars refuses to
  serve data; local development without them shows a read-only preview.

## 5. Repository layout

```
src/
  app/(workspace)/…      authenticated pages (one folder per module)
  app/actions.ts         ALL server actions (validation + RPC calls)
  app/auth/…             login callback routes
  components/            UI components (xx-ui.tsx = module views)
  lib/records.ts         every database read (typed)
  lib/validation.ts      zod schemas shared by actions
  lib/permissions.ts     permission keys, roles, defaults
  lib/modules.ts         module registry (nav, live/preview state)
supabase/migrations/     0001…0008 — the whole database, in order
tests/                   PGlite integration suites (real migrations + RPCs)
scripts/seed-demo.mjs    opt-in demo data for a live project
```

## 6. Local development

```bash
npm install
cp .env.example .env.local   # fill in Supabase values (optional: preview mode)
npm run dev                  # http://127.0.0.1:3000
```

Without `.env.local` values the app runs in **read-only preview mode** (fake
empty data, a "preview" badge — nothing is saved).

Useful commands:

```bash
npm test               # full integration suite (PGlite)
npx vitest run tests/documents.test.ts   # one suite
npm run lint ; npx tsc --noEmit          # static checks
npm run build                            # production build
npm run seed:demo      # opt-in demo data against the configured project
```

## 7. Connecting Supabase (one-time)

1. Create a project at supabase.com.
2. Run migrations **in order** in SQL Editor (or `supabase db push`):
   `0001_foundation` → `0002_suppliers_stock` → `0003_production` →
   `0004_exports_finance` → `0005_reporting` → `0006_performance` →
   `0007_register_references` → `0008_documents`.
3. Authentication → URL Configuration: set **Site URL** to the app origin and
   add `<origin>/auth/callback` as a redirect URL. Disable public sign-ups.
   Set minimum password length 12. Configure SMTP for invitation emails.
4. Create the first administrator (must be the very first profile):
   - Authentication → Users → **Add user** (no email confirmation), copy UUID.
   - SQL Editor: `select public.app_bootstrap_admin('<uuid>', 'Your Name');`
5. Sign in, then set company details on **Settings** (used as the letterhead on
   printable invoices/packing lists).

## 8. Adding team members

1. Sign in as administrator → **Team**.
2. Enter email, name and role → **Send invitation** (uses the service-role key
   on the server; the invitee receives a Supabase email to set a password).
3. When the invitee accepts, a database trigger creates their profile with the
   assigned role automatically — acceptances older than 24 hours must be
   re-invited.
4. Change roles or deactivate anyone from **Team** at any time; deactivation
   preserves all historical records and cuts access immediately.
5. Adjust what a role can do from **Roles** (administrator permissions are
   protected and always full).

## 9. Deploying to Vercel

1. Import the GitHub repo into Vercel (framework: Next.js — zero config).
2. Environment variables (Production + Preview):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` key |
   | `SUPABASE_SECRET_KEY` | `sb_secret_…` key (server-only) |
   | `NEXT_PUBLIC_SITE_URL` | `https://earthheritance-stock-manage.vercel.app` |

3. Keep Supabase's Site URL / redirect list pointed at the HTTPS domain.
4. `git push` → Vercel auto-deploys. `NEXT_PUBLIC_*` values are baked in at
   build time, so changing them requires a redeploy.

## 10. Data conventions

- Quantities and money are `numeric` (never floats); one stock unit per item —
  no implicit kg↔piece conversion.
- Multi-currency: original amounts and a manually entered exchange rate are
  stored; totals are **never** summed across currencies.
- Lot numbers carry traceability: supplier lot → production batch → finished
  lot → shipment line → invoice line.
- Every state change writes an `audit_events` row (who, what, when, details).

## 11. Testing strategy

Nine Vitest suites run the real migration chain on PGlite, act as each role by
setting the JWT claim, and assert both RPC behavior and RLS visibility —
including a full business lifecycle test (buy → receive → produce → ship →
invoice → pay → allocate) and the documents/attachments suite. The production
boundary test asserts the app fails closed without Supabase configured.
