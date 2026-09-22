/**
 * Billing types and the one server-side plan read (Phase 12.3).
 *
 * The plan is fetched ONCE per request in the `(app)` layout and passed down, rather than each
 * component fetching it — otherwise every gated surface adds a round-trip to the API on every
 * page load.
 */
import { serverApiFetch } from "@/lib/api";

export type Plan = {
  /** `FREE` or `PRO` — the only field a feature gate should read. */
  plan: "FREE" | "PRO";
  /** Stripe's own status, for display. `past_due` is worth showing; the user can fix it. */
  status: string;
  /** Renewal date, or the cancellation date when `cancelAtPeriodEnd`. */
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** False when this server has no Stripe key — show "coming soon", never an error. */
  billingEnabled: boolean;
  /** A Stripe customer exists, so the billing portal can be opened. */
  hasCustomer: boolean;
};

/** What we assume when the API can't be reached: Free, and billing not offered. */
export const FREE_PLAN: Plan = {
  plan: "FREE",
  status: "none",
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  billingEnabled: false,
  hasCustomer: false,
};

/**
 * The current user's plan, for Server Components. Never throws: a billing outage must not take
 * the whole app down, and failing closed to Free is the safe direction — the server re-checks
 * entitlement on every gated call anyway, so a wrong guess here costs a UI hint, not access.
 */
export async function getPlan(): Promise<Plan> {
  try {
    const res = await serverApiFetch("/api/billing/me");
    if (!res.ok) return FREE_PLAN;
    return (await res.json()) as Plan;
  } catch {
    return FREE_PLAN;
  }
}

// Renewal and cancellation dates are rendered by <LocalDate> (components/LocalDate.tsx), in the
// viewer's time zone. The formatter that used to live here ran on the server, in the box's.

export const PRICE_MONTHLY = "$19.99";
export const PRICE_3MO = "$44.99";
