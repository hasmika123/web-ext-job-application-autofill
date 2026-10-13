/**
 * The analytics page's data (APP-E2E U12.1): the wire type `GET /api/profile/analytics` answers (through the BFF
 * route `/api/analytics`) and the fetcher. Counts are applications by the first time they reached each stage.
 */
import { browserZone } from "@/lib/applications";
import { call, type TrackerResult } from "@/lib/tracker-client";

/** The periods the select offers; the server clamps whatever it is sent to its own `analytics.*` settings. */
export const ANALYTICS_RANGES: { label: string; days: number }[] = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last year", days: 365 }, // config-literal-ok: a label for the server's maxRangeDays default; the server clamps it
];

export interface AnalyticsStats {
  applied: number;
  /** Applications first applied in the period just before this one (for the delta). */
  appliedPrev: number;
  replies: number;
  interviews: number;
  offers: number;
  /** Percent of the period's applications that have had any reply since; null when none were applied. */
  responseRate: number | null;
}

export interface AnalyticsBucket {
  /** First day (yyyy-MM-dd) of the week (Monday) or month. */
  start: string;
  applied: number;
  interviews: number;
  offers: number;
}

export interface AnalyticsStatus {
  status: string;
  label: string;
  count: number;
}

export interface AnalyticsCompany {
  company: string;
  applied: number;
  replied: number;
}

export interface Analytics {
  range: number;
  granularity: "week" | "month";
  /** False until the account has applied anywhere: the page shows its empty state. */
  real: boolean;
  stats: AnalyticsStats;
  overTime: AnalyticsBucket[];
  byStatus: AnalyticsStatus[];
  /** Whether any reply came through the user's inbox (response-by-company means nothing without one). */
  inboxSeen: boolean;
  responseByCompany: AnalyticsCompany[];
}

/** The analytics for the last `days` days, in the browser's own time zone. */
export function getAnalytics(days: number, tz: string = browserZone()): Promise<TrackerResult<Analytics>> {
  const q = new URLSearchParams({ range: String(days) });
  if (tz) q.set("tz", tz);
  return call("GET", `/api/analytics?${q.toString()}`);
}
