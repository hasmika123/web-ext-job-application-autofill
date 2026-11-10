/**
 * The pending change set of My plan (docs/subscriptions/05-customer-ux.md section 4). The steppers, the interval tabs and the plan switch edit a TARGET
 * (plan, interval, add-on quantities); nothing is charged until the person confirms a CHANGE quote built from it. These are pure helpers: they compare and
 * convert quantities, they never price anything.
 */
import type { CatalogPlan, Interval, PendingChange, PlanV3, QuoteRequestBody } from "./types";

export type Target = { planKey: string; interval: Interval; addons: Record<string, number> };

/** The add-on quantity that is in force after the scheduled changes land: a scheduled removal counts as 0, a scheduled decrease as its new quantity. */
export function effectiveQuantity(a: { quantity: number; endsAt?: string | null; pendingQuantity?: number | null }): number {
  if (a.endsAt) return 0;
  if (a.pendingQuantity != null) return a.pendingQuantity;
  return a.quantity;
}

/** What the subscription holds, as a target (scheduled removals applied). Null for a plan that is not linked to a plan version (Free, or not yet mirrored). */
export function currentTarget(plan: PlanV3): Target | null {
  if (!plan.planKey || !plan.interval) return null;
  const addons: Record<string, number> = {};
  for (const a of plan.addons ?? []) {
    const q = effectiveQuantity(a);
    if (q > 0) addons[a.featureKey] = q;
  }
  return { planKey: plan.planKey, interval: plan.interval, addons };
}

export function sameTarget(a: Target, b: Target): boolean {
  if (a.planKey !== b.planKey || a.interval !== b.interval) return false;
  const keys = new Set([...Object.keys(a.addons), ...Object.keys(b.addons)]);
  for (const k of keys) if ((a.addons[k] ?? 0) !== (b.addons[k] ?? 0)) return false;
  return true;
}

/** The body of the CHANGE quote for a target: the TARGET add-on set (not a delta), sorted so the same target is always the same request. */
export function changeRequest(t: Target, current: Target): QuoteRequestBody {
  const addons = Object.keys(t.addons)
    .filter((k) => t.addons[k] > 0)
    .sort()
    .map((featureKey) => ({ featureKey, quantity: t.addons[featureKey] }));
  const body: QuoteRequestBody = { kind: "CHANGE", addons };
  if (t.planKey !== current.planKey) body.planKey = t.planKey;
  if (t.interval !== current.interval) body.interval = t.interval;
  return body;
}

/** The scheduled change (still undoable) for an add-on, if there is one. */
export function pendingFor(plan: PlanV3, featureKey: string): PendingChange | undefined {
  return (plan.pendingChanges ?? []).find((c) => c.featureKey === featureKey && c.status === "PENDING");
}

/** Add-ons a plan can carry that are not already held: the catalog's optional services, each with a price at this interval. */
export function offerableAddons(plan: CatalogPlan | undefined, interval: Interval) {
  return (plan?.optional ?? []).filter((o) => (o.prices[interval]?.amountMinor ?? 0) > 0);
}

/** When switching plan, the add-ons the new plan does not offer cannot ride along; this returns the target with only the ones it does. */
export function carryAddons(addons: Record<string, number>, next: CatalogPlan | undefined, interval: Interval): { kept: Record<string, number>; dropped: string[] } {
  const offered = new Set(offerableAddons(next, interval).map((o) => o.featureKey));
  const kept: Record<string, number> = {};
  const dropped: string[] = [];
  for (const [k, q] of Object.entries(addons)) {
    if (offered.has(k)) kept[k] = q;
    else dropped.push(k);
  }
  return { kept, dropped };
}

/** The error codes a CHANGE quote can answer that mean "this combination is not possible", with the sentence to show. */
export function changeProblemCopy(code: string | undefined, args: { max?: number } = {}): string | null | undefined {
  switch (code) {
    case "NO_CHANGE":
      return null; // nothing to show: the target equals what you hold
    case "PLAN_SWITCH_UNSUPPORTED":
      return "Switching plan or billing period online isn't available yet. Use Manage billing, or contact us and we'll do it for you.";
    case "NO_SUBSCRIPTION":
      return "There is no active subscription to change.";
    case "REMOVAL_PENDING":
      return "That add-on already has a scheduled change. Undo it first, or wait until it takes effect.";
    case "ADDON_NOT_IN_PLAN":
      return "That add-on isn't part of this plan.";
    case "QUANTITY_LIMIT":
      return args.max != null ? `You can hold at most ${args.max} add-on units in total.` : "That is more than the limit.";
    default:
      return undefined; // not special: the caller falls back to the general register (problemCopy)
  }
}
