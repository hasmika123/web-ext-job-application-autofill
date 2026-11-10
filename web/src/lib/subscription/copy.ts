/**
 * The billing copy register for the customer pages (docs/subscriptions/05-customer-ux.md section 1). Words only: every amount is passed in as an
 * integer of minor units from a DTO and formatted here, never computed. "No refunds, cancel anytime" is stated plainly (CLAUDE.md).
 */
import { formatMinor } from "@kiwiply/ui";
import type { Interval, PriceMap, PlanQuote } from "./types";

export const NO_REFUND = "Cancel any time, one tap. No refunds for partial periods.";
export const TAX_NOTE = "Taxes are added by Stripe where applicable.";

export function money(minor: number | null | undefined, currency: string): string {
  if (minor == null) return "-";
  return formatMinor(minor, currency) ?? "-";
}

/** "month", "3 months", "year": the cadence a price repeats at. */
export function intervalUnit(interval: Interval): string {
  return interval === "MONTH" ? "month" : interval === "QUARTER" ? "3 months" : "year";
}

/** The short label of an interval tab. */
export function intervalTab(interval: Interval): string {
  return interval === "MONTH" ? "Monthly" : interval === "QUARTER" ? "3 months" : "Yearly";
}

/** "/mo", "/3 mo", "/yr": the suffix after a price. */
export function intervalSuffix(interval: Interval): string {
  return interval === "MONTH" ? "/mo" : interval === "QUARTER" ? "/3 months" : "/yr";
}

/** "every month", "every 3 months", "once a year". */
export function intervalEvery(interval: Interval): string {
  return interval === "MONTH" ? "every month" : interval === "QUARTER" ? "every 3 months" : "once a year";
}

/** A date for copy ("Nov 15", or "Nov 15, 2027" when it is not this year), in the viewer's time zone. */
export function shortDate(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }).format(d);
}

/** "14:32" for a quote's expiry, in the viewer's time zone. */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

/**
 * The sentence next to every charging button: what is charged today, what repeats and from when, how to stop it, and that nothing is refunded.
 * `todayMinor` and `recurringMinor` are both DTO fields of the quote; for a new subscription they are equal.
 */
export function chargeSentence(args: { todayMinor: number; recurringMinor: number; currency: string; interval: Interval; nextAt?: string | null }): string {
  const { todayMinor, recurringMinor, currency, interval, nextAt } = args;
  const from = nextAt ? ` from ${shortDate(nextAt)}` : "";
  return `${money(todayMinor, currency)} today, then ${money(recurringMinor, currency)} ${intervalEvery(interval)}${from}. ${NO_REFUND}`;
}

/** "billed $215.89 once a year · about $17.99/mo · save $23.99", from the price's own fields; empty for a monthly price. */
export function savingsLine(price: PriceMap[Interval] | undefined, interval: Interval, currency: string): string {
  if (!price || interval === "MONTH") return "";
  const parts = [`billed ${money(price.amountMinor, currency)} ${intervalEvery(interval)}`];
  if (price.monthlyEquivalentMinor != null) parts.push(`about ${money(price.monthlyEquivalentMinor, currency)}/mo`);
  if (price.savingsMinor != null && price.savingsMinor > 0) parts.push(`save ${money(price.savingsMinor, currency)}`);
  return parts.join(" · ");
}

/** The quote's own basket line for the yearly variant of the review sheet. */
export function quoteSavingsLine(quote: PlanQuote): string {
  const b = quote.proposed;
  if (quote.interval === "MONTH") return "";
  const parts = [`billed ${money(b.recurringMinor, quote.currency)} ${intervalEvery(quote.interval)}`];
  if (b.monthlyEquivalentMinor != null) parts.push(`about ${money(b.monthlyEquivalentMinor, quote.currency)}/mo`);
  if (b.savingsMinor != null && b.savingsMinor > 0) parts.push(`you save ${money(b.savingsMinor, quote.currency)}`);
  return parts.join(" · ");
}

/** The user-facing sentence of a refused billing call (05 section 3 and the error registry); null means "show the generic one". */
export function problemCopy(code: string | undefined, args: { max?: number } = {}): string {
  switch (code) {
    case "QUOTE_STALE":
      return "Prices changed - here is the new total.";
    case "QUOTE_EXPIRED":
      return "That price expired, so we got you a fresh one.";
    case "ALREADY_SUBSCRIBED":
      return "You already have a plan - change it in My plan.";
    case "BILLING_DISABLED":
      return "Payments aren't switched on yet - check back shortly.";
    case "PLAN_SUNSET":
      return "That plan is no longer offered.";
    case "PLAN_NOT_SELLABLE":
      return "That plan isn't on sale right now.";
    case "QUANTITY_LIMIT":
      return args.max != null ? `You can add at most ${args.max} of that.` : "That is more than the limit for this add-on.";
    case "ADDON_NOT_IN_PLAN":
      return "That add-on isn't part of this plan.";
    case "INTERVAL_NOT_AVAILABLE":
      return "That billing period isn't available for this plan.";
    case "DEPENDENCY_REQUIRED":
    case "DEPENDENCY_UNCONFIRMED":
      return "This add-on needs another one. Review the list below and confirm it.";
    case "REMOVAL_PENDING":
      return "That removal is already scheduled.";
    case "CANCEL_PENDING":
      return "Your plan is set to cancel. Resume it first, then change add-ons.";
    case "NOT_PENDING":
      return "That change already took effect, so it can't be undone.";
    case "IDEMPOTENCY_KEY_REQUIRED":
      return "Couldn't confirm. Please try again.";
    case "DEMO_READ_ONLY":
      return "This is a demo account, so nothing is saved.";
    default:
      return "Something went wrong. Please try again.";
  }
}
