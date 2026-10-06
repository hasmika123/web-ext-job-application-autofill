/**
 * Shapes + display helpers for the admin Customers page and billing timeline (Phase 9.C1).
 * Mirrors `CustomerDTOs` in the API.
 */

export type StatusGroup = "ACTIVE" | "PAST_DUE" | "CANCELLING" | "LAPSED";

export interface Customer {
  login: string;
  email?: string | null;
  name?: string | null;
  statusGroup: StatusGroup;
  stripeStatus?: string | null;
  billing?: "MONTHLY" | "QUARTERLY" | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  totalPaidCents: number;
  currency: string;
  since?: string | null;
  stripeUrl?: string | null;
}

export interface TimelineEntry {
  kind: "BILLING" | "NOTE";
  at?: string | null;
  title: string;
  body?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  failed: boolean;
}

export interface CustomerDetail {
  customer: Customer | null;
  timeline: TimelineEntry[];
}

export const STATUS_LABEL: Record<StatusGroup, string> = {
  ACTIVE: "Active",
  PAST_DUE: "Payment failed",
  CANCELLING: "Cancelling",
  LAPSED: "Lapsed",
};

/** Pill colours per group — the same token palette the bug-report and inquiry pills use. */
export const STATUS_PILL: Record<StatusGroup, string> = {
  ACTIVE: "bg-accent text-on-accent",
  PAST_DUE: "bg-danger/15 text-danger",
  CANCELLING: "bg-brown-soft text-brown-deep",
  LAPSED: "bg-paper-2 text-ink-soft ring-1 ring-line",
};

export function billingLabel(b: Customer["billing"]): string {
  return b === "MONTHLY" ? "Monthly" : b === "QUARTERLY" ? "Every 3 months" : "—";
}

export function money(cents: number | null | undefined, currency?: string | null): string {
  if (cents == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "usd").toUpperCase() }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export function day(iso?: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

/** "Renews 2026-11-05" / "Ends 2026-11-05" / "Ended 2026-09-30". */
export function periodLabel(c: Customer): string {
  if (!c.currentPeriodEnd) return "—";
  if (c.statusGroup === "LAPSED") return `Ended ${day(c.currentPeriodEnd)}`;
  if (c.statusGroup === "CANCELLING") return `Ends ${day(c.currentPeriodEnd)}`;
  return `Renews ${day(c.currentPeriodEnd)}`;
}
