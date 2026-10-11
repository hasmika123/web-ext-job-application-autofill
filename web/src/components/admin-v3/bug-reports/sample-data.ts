/**
 * SAMPLE: illustrative numbers for the Bug Reports board (design/admin-v3/board-12). None of this
 * comes from the API. Live: the report list, the per-status counts and triage (BugTriageControl on
 * the detail page). The API has no severity breakdown, crash telemetry or recurrence grouping.
 */
import type { Tone } from "@/components/app-v2/common";

export const BUG_TILE_EXTRAS = {
  new: { delta: { value: "12%", dir: "up" as const, good: false }, spark: [3, 4, 3, 5, 6, 5, 7, 8, 7, 9] },
  open: { delta: { value: "8%", dir: "up" as const, good: false }, spark: [4, 5, 5, 6, 6, 7, 7, 8, 8, 9] },
  progress: { delta: { value: "20%", dir: "up" as const }, spark: [3, 3, 4, 5, 4, 6, 6, 7, 8, 9] },
  resolved: { delta: { value: "28%", dir: "up" as const }, spark: [2, 3, 4, 4, 5, 6, 7, 7, 8, 10] },
};

/** SAMPLE: severity distribution donut. */
export const SEVERITY: { label: string; value: number; tone: Tone; pct: number }[] = [
  { label: "Critical", value: 18, tone: "coral", pct: 6 },
  { label: "High", value: 56, tone: "amber", pct: 20 },
  { label: "Medium", value: 92, tone: "lime", pct: 32 },
  { label: "Low", value: 118, tone: "green", pct: 42 },
];

/** SAMPLE: crash trend (reports per day on a 0-60 axis, so values double as a percent of the plot height). */
export const CRASH_TREND = [8, 14, 11, 16, 22, 18, 20, 19, 27, 24, 30, 26, 38, 52, 40, 34, 28, 22];
export const CRASH_X = ["Sep 10", "Sep 17", "Sep 24", "Oct 1", "Oct 8"];
export const CRASH_Y = ["0", "20", "40", "60"];
export const CRASH_MAX = 60;

/** SAMPLE: top recurring issues. */
export const TOP_ISSUES: { title: string; reports: number; change: string; dir: "up" | "down" }[] = [
  { title: "App crashes on launch (iOS)", reports: 42, change: "12%", dir: "up" },
  { title: "Resume parsing missing skills", reports: 28, change: "8%", dir: "down" },
  { title: "Job application fails (500 error)", reports: 24, change: "20%", dir: "up" },
  { title: "Email notifications not sent", reports: 18, change: "14%", dir: "down" },
  { title: "Filters not working on job search", reports: 16, change: "7%", dir: "up" },
];
