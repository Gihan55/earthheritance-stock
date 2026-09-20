export const ROLES = [
  "administrator",
  "manager",
  "stores",
  "production",
  "export_sales",
  "finance",
] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  administrator: "Administrator",
  manager: "Manager",
  stores: "Stores / Purchasing",
  production: "Production",
  export_sales: "Export / Sales",
  finance: "Finance",
};
export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  administrator: "Company settings, staff access, and all business records.",
  manager: "Operational oversight, financial summaries, and stock approvals.",
  stores: "Suppliers, purchasing, material receipts, and inventory.",
  production: "Material availability, production batches, and wastage.",
  export_sales: "Buyers, orders, export shipments, and invoices.",
  finance: "Supplier bills, buyer receipts, payments, and balances.",
};
export const PERMISSIONS = {
  "suppliers.view": "View supplier profiles",
  "suppliers.manage": "Maintain supplier profiles",
  "purchasing.manage": "Manage purchases and receipts",
  "inventory.view": "View stock balances",
  "inventory.manage": "Record stock movements",
  "inventory.approve": "Approve adjustments and reversals",
  "production.view": "View production batches",
  "production.manage": "Record production batches",
  "buyers.view": "View buyer profiles",
  "buyers.manage": "Maintain buyer profiles",
  "exports.view": "View orders and shipments",
  "exports.manage": "Manage exports and buyer invoices",
  "finance.view": "View payment records and financial summaries",
  "finance.manage": "Post supplier bills and payments / buyer receipts",
  "reports.view": "View permitted business reports",
  "audit.view": "View administrative audit history",
  "users.manage": "Invite staff and manage access",
  "roles.manage": "Configure role permissions",
  "settings.manage": "Manage company settings",
} as const;
export type Permission = keyof typeof PERMISSIONS;
export const ADMIN_PERMISSIONS: Permission[] = [
  "users.manage",
  "roles.manage",
  "settings.manage",
];
export const DEFAULT_PERMISSIONS: Record<Role, Permission[]> = {
  administrator: Object.keys(PERMISSIONS) as Permission[],
  manager: [
    "suppliers.view",
    "inventory.view",
    "inventory.approve",
    "production.view",
    "buyers.view",
    "exports.view",
    "finance.view",
    "reports.view",
    "audit.view",
  ],
  stores: [
    "suppliers.view",
    "suppliers.manage",
    "purchasing.manage",
    "inventory.view",
    "inventory.manage",
  ],
  production: ["inventory.view", "production.view", "production.manage"],
  export_sales: [
    "buyers.view",
    "buyers.manage",
    "exports.view",
    "exports.manage",
    "inventory.view",
  ],
  finance: [
    "suppliers.view",
    "buyers.view",
    "exports.view",
    "finance.view",
    "finance.manage",
    "reports.view",
  ],
};
export function can(permissions: readonly string[], permission: Permission) {
  return permissions.includes(permission);
}
export function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "EH"
  );
}
