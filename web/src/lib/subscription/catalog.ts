/**
 * The public catalog on the server (`GET /api/catalog/public`, K5.1) and the pure helpers the pricing page builds on it. The web reads prices; it
 * never adds them: a basket's total is `catalog.totals` or an anonymous quote, both computed by the API.
 */
import { apiUrl } from "@/lib/config";
import type { CatalogOptional, CatalogPlan, Interval, PublicCatalog } from "./types";
import { INTERVALS } from "./types";

/** The last good catalog this process saw: a catalog outage renders this instead of a blank page (05 section 8). */
let lastGood: PublicCatalog | null = null;

/** True when the catalog carries something the pricing page can sell: at least one paid plan with a price. */
export function hasSellablePlan(catalog: PublicCatalog | null | undefined): catalog is PublicCatalog {
  return !!catalog && catalog.plans.some((p) => !p.sunset && isPaid(p));
}

export function isPaid(plan: CatalogPlan): boolean {
  return INTERVALS.some((i) => (plan.prices[i]?.amountMinor ?? 0) > 0);
}

/**
 * The catalog, revalidated every 5 minutes by Next's data cache. Null when the API has no catalog yet or can't be reached and nothing good was seen
 * before; callers then render today's content (lib/catalog.ts).
 */
export async function fetchPublicCatalog(): Promise<PublicCatalog | null> {
  try {
    const res = await fetch(apiUrl("/api/catalog/public"), { next: { revalidate: 300 } });
    if (!res.ok) return lastGood;
    const body = (await res.json()) as PublicCatalog;
    if (!body || !Array.isArray(body.plans)) return lastGood;
    lastGood = body;
    return body;
  } catch {
    return lastGood;
  }
}

/** Test hook. */
export function resetCatalogCache(): void {
  lastGood = null;
}

/** The interval tabs: the union of the paid plans' intervals in month, quarter, year order; YEAR hides when the admin switch is off. */
export function visibleIntervals(catalog: PublicCatalog): Interval[] {
  const seen = new Set<Interval>();
  for (const p of catalog.plans) {
    if (p.sunset || !isPaid(p)) continue;
    for (const i of p.intervals) seen.add(i);
  }
  return INTERVALS.filter((i) => seen.has(i) && (i !== "YEAR" || catalog.annualEnabled));
}

/** The add-ons of a plan that have a published price at this interval (others are omitted, not greyed). */
export function addonsFor(plan: CatalogPlan, interval: Interval): CatalogOptional[] {
  return plan.optional.filter((o) => (o.prices[interval]?.amountMinor ?? 0) > 0);
}

export type Selection = Record<string, number>;

/** The key under which `catalog.totals` stores the basket (sorted by feature key, quantity 0 left out). */
export function basketKey(selection: Selection): string {
  return Object.keys(selection)
    .filter((k) => selection[k] > 0)
    .sort()
    .map((k) => `${k}:${selection[k]}`)
    .join(",");
}

export function selectionToAddons(selection: Selection): { featureKey: string; quantity: number }[] {
  return Object.keys(selection)
    .filter((k) => selection[k] > 0)
    .sort()
    .map((featureKey) => ({ featureKey, quantity: selection[featureKey] }));
}

/** The server's precomputed total of this basket, or undefined when the basket is outside the precomputed set (then ask for an anonymous quote). */
export function precomputedTotal(catalog: PublicCatalog, plan: CatalogPlan, interval: Interval, selection: Selection): number | undefined {
  const key = basketKey(selection);
  if (key === "") return plan.prices[interval]?.amountMinor;
  return catalog.totals[plan.planKey]?.[interval]?.[key];
}
