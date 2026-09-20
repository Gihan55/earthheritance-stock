// Presentation helpers safe for client and server components.

export function formatQty(
  value: string | number | null | undefined,
  unit?: string,
): string {
  const n = Number(value ?? 0);
  const s = Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: 3 })
    : "0";
  return unit ? `${s} ${unit}` : s;
}

export function formatMoney(
  value: string | number | null | undefined,
  currency?: string | null,
): string {
  const n = Number(value ?? 0);
  const amount = Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "0.00";
  return currency ? `${currency} ${amount}` : amount;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  return new Date(value).toLocaleDateString("en-GB");
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export const CATEGORY_LABELS: Record<string, string> = {
  raw_material: "Raw material",
  finished_product: "Finished product",
};
export const categoryLabel = (category: string) =>
  CATEGORY_LABELS[category] ?? category;

const MOVEMENT_LABELS: Record<string, string> = {
  opening: "Opening balance",
  receipt: "Goods receipt",
  adjustment_increase: "Adjustment in",
  adjustment_decrease: "Adjustment out",
  production_consumption: "Production use",
  production_output: "Production output",
  dispatch: "Dispatch",
};
export const movementLabel = (type: string) => MOVEMENT_LABELS[type] ?? type;

export function purchaseStatus(status: string): {
  label: string;
  tone: "neutral" | "green" | "amber";
} {
  switch (status) {
    case "draft":
      return { label: "Draft", tone: "neutral" };
    case "confirmed":
      return { label: "Confirmed", tone: "amber" };
    case "partially_received":
      return { label: "Partly received", tone: "amber" };
    case "received":
      return { label: "Received", tone: "green" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function adjustmentStatus(status: string): {
  label: string;
  tone: "neutral" | "green" | "amber";
} {
  switch (status) {
    case "pending":
      return { label: "Awaiting approval", tone: "amber" };
    case "approved":
      return { label: "Approved", tone: "green" };
    case "rejected":
      return { label: "Rejected", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function batchStatus(status: string): {
  label: string;
  tone: "neutral" | "green" | "amber";
} {
  switch (status) {
    case "draft":
      return { label: "Draft", tone: "neutral" };
    case "posted":
      return { label: "Posted", tone: "green" };
    case "reversed":
      return { label: "Reversed", tone: "amber" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function exportOrderStatus(status: string): {
  label: string;
  tone: "neutral" | "green" | "amber";
} {
  switch (status) {
    case "draft":
      return { label: "Draft", tone: "neutral" };
    case "confirmed":
      return { label: "Confirmed", tone: "amber" };
    case "partially_shipped":
      return { label: "Partly shipped", tone: "amber" };
    case "shipped":
      return { label: "Shipped", tone: "green" };
    case "closed":
      return { label: "Closed", tone: "green" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function shipmentStatus(status: string): {
  label: string;
  tone: "neutral" | "green" | "amber";
} {
  switch (status) {
    case "draft":
      return { label: "Draft", tone: "neutral" };
    case "ready":
      return { label: "Ready", tone: "amber" };
    case "dispatched":
      return { label: "Dispatched", tone: "green" };
    case "delivered":
      return { label: "Delivered", tone: "green" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function paymentState(state: string): {
  label: string;
  tone: "neutral" | "green" | "amber";
} {
  switch (state) {
    case "paid":
      return { label: "Paid", tone: "green" };
    case "partially_paid":
      return { label: "Partly paid", tone: "amber" };
    case "overdue":
      return { label: "Overdue", tone: "amber" };
    case "unpaid":
      return { label: "Unpaid", tone: "neutral" };
    case "reversed":
      return { label: "Reversed", tone: "neutral" };
    default:
      return { label: state, tone: "neutral" };
  }
}
