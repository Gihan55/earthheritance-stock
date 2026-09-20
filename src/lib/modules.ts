import type { Permission } from "./permissions";

export const MODULES = [
  {
    slug: "suppliers",
    label: "Suppliers",
    group: "Partners",
    icon: "suppliers",
    permission: "suppliers.view",
    phase: 2,
    live: true,
    description: "Your raw-material partners, in one place.",
    features: [
      "Capture supplier contacts and supplied raw materials",
      "View purchase and goods receipt history",
      "See bills, payments, and balances with financial access",
    ],
  },
  {
    slug: "buyers",
    label: "Buyers",
    group: "Partners",
    icon: "buyers",
    permission: "buyers.view",
    phase: 4,
    live: true,
    description: "Build lasting relationships, across borders.",
    features: [
      "Capture buyer contacts and billing / shipping addresses",
      "View export orders and shipment history",
      "Track receipts, advances, and outstanding invoices",
    ],
  },
  {
    slug: "inventory",
    label: "Inventory",
    group: "Operations",
    icon: "inventory",
    permission: "inventory.view",
    phase: 2,
    live: true,
    description: "Know what you have, and what is ready to move.",
    features: [
      "Separate raw-material and finished-product stock",
      "Track lots, receipts, opening stock, and adjustments",
      "See on-hand, reserved, and available quantities",
    ],
  },
  {
    slug: "production",
    label: "Production",
    group: "Operations",
    icon: "production",
    permission: "production.view",
    phase: 3,
    live: true,
    description: "From raw cocopeat to export-ready products.",
    features: [
      "Record batch inputs, finished output, and wastage",
      "Consume material lots and create finished stock together",
      "Trace every batch back to its suppliers",
    ],
  },
  {
    slug: "exports",
    label: "Exports & shipments",
    group: "Operations",
    icon: "exports",
    permission: "exports.view",
    phase: 4,
    live: true,
    description: "A clear path from your warehouse to the world.",
    features: [
      "Manage orders, reservations, and partial shipments",
      "Record containers, ports, dates, and shipping references",
      "Prepare invoices and packing lists",
    ],
  },
  {
    slug: "supplier-payments",
    label: "Supplier payments",
    group: "Finance",
    icon: "outgoing",
    permission: "finance.view",
    phase: 4,
    live: true,
    description: "Every raw-material payment, accounted for.",
    features: [
      "Record money paid to each raw-material supplier",
      "Allocate advances and installments to supplier bills",
      "View payment history and outstanding balances by currency",
    ],
  },
  {
    slug: "buyer-receipts",
    label: "Buyer receipts",
    group: "Finance",
    icon: "incoming",
    permission: "finance.view",
    phase: 4,
    live: true,
    description: "Keep every buyer payment connected to its order.",
    features: [
      "Record incoming buyer payments and references",
      "Allocate advances and installments to export invoices",
      "View receipt history and outstanding balances by currency",
    ],
  },
  {
    slug: "reports",
    label: "Reports",
    group: "Insights",
    icon: "reports",
    permission: "reports.view",
    phase: 5,
    live: true,
    description: "The information you need to make your next move.",
    features: [
      "Stock, production, and export summaries",
      "Supplier payment and buyer receipt statements",
      "Filter and export only the records your role permits",
    ],
  },
] as const satisfies readonly {
  slug: string;
  label: string;
  group: string;
  icon: string;
  permission: Permission;
  phase: number;
  live: boolean;
  description: string;
  features: readonly string[];
}[];
export type BusinessModule = (typeof MODULES)[number];
export const moduleHref = (slug: string) => `/modules/${slug}`;
