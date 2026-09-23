import { serverApiFetch } from "@/lib/api";
import { formatDate } from "@/lib/dates";

/**
 * This month's AI meter (Phase 13.1c), from `GET /api/ai/usage`.
 *
 * - `metered: "budget"` — Pro, or an admin override: `used` is a percent of the month's budget and
 *   `limit` is 100. The budget itself (and what AI costs) never reaches the page.
 * - `metered: "count"` — Free: `used` resume parses this month out of `limit`.
 */
export type AiUsage = {
  metered: "budget" | "count";
  used: number;
  limit: number;
  resetsAt: string;
  economy: boolean;
};

/** Never throws: an API hiccup means no meter, not a broken settings page. */
export async function getAiUsage(): Promise<AiUsage | null> {
  try {
    const res = await serverApiFetch("/api/ai/usage");
    if (!res.ok) return null;
    const u = (await res.json()) as Partial<AiUsage>;
    if ((u.metered !== "budget" && u.metered !== "count") || typeof u.used !== "number" || typeof u.limit !== "number") {
      return null;
    }
    return { metered: u.metered, used: u.used, limit: u.limit, resetsAt: String(u.resetsAt ?? ""), economy: !!u.economy };
  } catch {
    return null;
  }
}

/**
 * The words for a meter. The reset is a month boundary in UTC ("October 1"), so it is formatted in
 * UTC on purpose — in a viewer's own zone it could read "September 30".
 */
export function describeAiUsage(u: AiUsage): { headline: string; detail: string; label: string } {
  const resets = formatDate(u.resetsAt, { month: "long", day: "numeric" });
  const when = resets ? `Resets ${resets}.` : "Resets at the start of next month.";
  if (u.metered === "budget") {
    const used = Math.min(100, Math.max(0, Math.round(u.used)));
    if (used >= 100) {
      return {
        headline: "You've used this month's Kiwiply AI",
        detail: `${when} Your own API key in the extension still works until then.`,
        label: "Kiwiply AI used this month",
      };
    }
    return {
      headline: `${used}% of this month's Kiwiply AI used`,
      detail: u.economy ? `${when} Until then Kiwiply AI uses a lighter, faster model.` : when,
      label: "Kiwiply AI used this month",
    };
  }
  return {
    headline: `${u.used} of ${u.limit} AI resume parses used this month`,
    detail: `${when} Drafting and the other Kiwiply AI features come with Pro.`,
    label: "AI resume parses used this month",
  };
}
