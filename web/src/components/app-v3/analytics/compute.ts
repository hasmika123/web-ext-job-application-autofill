import type { Tone } from "@/components/app-v2/common";
import type { Analytics, AnalyticsBucket, AnalyticsStatus, AnalyticsStats } from "@/lib/job-analytics";

/**
 * Pure shaping of the server's analytics (APP-E2E U12.1) into what the cards draw. Nothing here computes a statistic
 * (the server owns "first became X"); it only labels, scales and words what came back, and never invents a figure.
 */

/** One bar group per bucket, labelled by its first day ("Oct 12" for a week, "Oct ’26" for a month). */
export function barGroups(buckets: AnalyticsBucket[], granularity: Analytics["granularity"]): { label: string; values: number[] }[] {
  return buckets.map((b) => {
    const at = new Date(`${b.start}T12:00:00Z`);
    // A year of months repeats a month name; the year keeps every label (and React key) unique.
    const label =
      granularity === "month"
        ? `${at.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })} ’${String(at.getUTCFullYear()).slice(-2)}`
        : at.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return { label, values: [b.applied, b.interviews, b.offers] };
  });
}

/** True when no bar has any height (the period is quiet): the card says so instead of drawing flat zeros. */
export function isQuiet(buckets: AnalyticsBucket[]): boolean {
  return buckets.every((b) => b.applied + b.interviews + b.offers === 0);
}

/** A y-axis that stays readable: a step of 1, 2, 5, 10... with at most four intervals, never below 4. */
export function chartScale(groups: { values: number[] }[]): { max: number; ticks: number[] } {
  const top = Math.max(1, ...groups.flatMap((g) => g.values));
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500]; // config-literal-ok: axis steps are chart geometry, not a limit
  const step = steps.find((s) => top / s <= 4) ?? Math.ceil(top / 4);
  const max = Math.max(step * 2, Math.ceil(top / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  return { max, ticks };
}

/** "up 12% on the 30 days before" as a tile delta; none when there is no earlier period to compare with. */
export function appliedDelta(stats: AnalyticsStats): { value: string; up: boolean } | undefined {
  if (stats.appliedPrev <= 0) return undefined;
  const change = Math.round(((stats.applied - stats.appliedPrev) / stats.appliedPrev) * 100);
  if (change === 0) return undefined;
  return { value: `${Math.abs(change)}%`, up: change > 0 };
}

const STATUS_TONE: Record<string, Tone> = {
  DRAFT: "slate",
  SAVED: "slate",
  APPLIED: "blue",
  IN_REVIEW: "amber",
  INTERVIEW: "green",
  OFFER: "violet",
  REJECTED: "coral",
  WITHDRAWN: "slate",
};

/** The donut's slices from the server's status counts. */
export function statusSegments(byStatus: AnalyticsStatus[]): { label: string; value: number; tone: Tone }[] {
  return byStatus.map((s) => ({ label: s.label, value: s.count, tone: STATUS_TONE[s.status] ?? "slate" }));
}

const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);

/** Applications -> replies -> interviews -> offers, each as a share of the period's applications (capped at 100). */
export function funnelRows(stats: AnalyticsStats): { label: string; value: number; note: string; tone: Tone }[] {
  const { applied, replies, interviews, offers } = stats;
  return [
    { label: "Applied", value: applied > 0 ? 100 : 0, note: String(applied), tone: "blue" },
    { label: "Replies", value: pct(replies, applied), note: `${replies} (${pct(replies, applied)}%)`, tone: "amber" },
    { label: "Interviews", value: pct(interviews, applied), note: `${interviews} (${pct(interviews, applied)}%)`, tone: "green" },
    { label: "Offers", value: pct(offers, applied), note: `${offers} (${pct(offers, applied)}%)`, tone: "violet" },
  ];
}

/** Replies as a share of applications, for the by-company bars. */
export function companyPct(applied: number, replied: number): number {
  return pct(replied, applied);
}

/** The line under the replies tile: the cohort response rate, or why there is none. */
export function responseNote(stats: AnalyticsStats): string {
  if (stats.responseRate === null) return "No applications in this period";
  return `${stats.responseRate}% response rate`;
}
