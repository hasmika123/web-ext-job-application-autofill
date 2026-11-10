import { money } from "./copy";

/** The server-chosen upgrade a 402 body carries (K7.6): the cheapest public plan that unlocks the feature. */
export type UpgradeHint = {
  planKey: string;
  planName?: string;
  interval: "MONTH" | "QUARTER" | "YEAR";
  amountMinor: number;
  currency?: string;
  /** Always a same-site path, e.g. /pricing?plan=PRO. */
  path: string;
};

const PER = { MONTH: "mo", QUARTER: "3 mo", YEAR: "yr" } as const;

/** Read `upgrade` off a problem body; null when absent or malformed (the existing generic upsell then shows). */
export function upgradeFrom(body: unknown): UpgradeHint | null {
  if (!body || typeof body !== "object") return null;
  const u = (body as { upgrade?: unknown }).upgrade;
  if (!u || typeof u !== "object") return null;
  const h = u as Record<string, unknown>;
  if (typeof h.planKey !== "string" || typeof h.amountMinor !== "number" || typeof h.path !== "string" || !h.path.startsWith("/")) return null;
  const interval = h.interval === "QUARTER" || h.interval === "YEAR" ? h.interval : "MONTH";
  return {
    planKey: h.planKey,
    planName: typeof h.planName === "string" ? h.planName : undefined,
    interval,
    amountMinor: h.amountMinor,
    currency: typeof h.currency === "string" ? h.currency : "USD",
    path: h.path,
  };
}

/** "Part of Pro - $19.99/mo" */
export function upgradeLine(u: UpgradeHint, subject?: string): string {
  const name = u.planName ?? u.planKey;
  return `${subject ? `${subject} is part of` : "Part of"} ${name} - ${money(u.amountMinor, u.currency ?? "USD")}/${PER[u.interval]}`;
}
