/**
 * SAMPLE: illustrative numbers for the Inquiries board (design/admin-v3/board-13). None of this
 * comes from the API. Live: the inquiry list, per-status counts and follow-up (InquiryFollowUp).
 * The API has no response-time (SLA) metric, escalation flag, priority or assignee.
 */
import type { Tone } from "@/components/app-v2/common";

export const INQUIRY_TILE_EXTRAS = {
  all: { delta: { value: "12%", dir: "up" as const }, spark: [3, 4, 4, 5, 6, 5, 7, 8, 8, 9] },
  open: { delta: { value: "8%", dir: "up" as const }, spark: [4, 5, 4, 6, 6, 7, 6, 8, 8, 9] },
  awaiting: { delta: { value: "16%", dir: "up" as const }, spark: [3, 3, 5, 4, 6, 5, 7, 7, 8, 9] },
  resolved: { delta: { value: "18%", dir: "up" as const }, spark: [2, 3, 4, 4, 6, 6, 7, 8, 9, 10] },
};

/** SAMPLE: average first-response hours on a 0-24h axis (scaled to the plot by the page). */
export const SLA_HOURS = [12, 9, 8, 6, 7, 6, 8, 6, 6, 5, 7, 6, 6, 5, 7, 6, 6, 5, 4];
export const SLA_MAX = 24;
export const SLA_X = ["Sep 10", "Sep 17", "Sep 24", "Oct 1", "Oct 8"];
export const SLA_Y = ["0h", "8h", "16h", "24h"];
export const SLA_HEADLINE = { value: "4h 32m", delta: "28%", caption: "vs previous 30 days" };

/** SAMPLE: category mix donut. */
export const CATEGORY_MIX: { label: string; value: number; tone: Tone; pct: number }[] = [
  { label: "Account & Access", value: 79, tone: "blue", pct: 32 },
  { label: "Job Sources", value: 50, tone: "green", pct: 20 },
  { label: "Billing & Plans", value: 40, tone: "amber", pct: 16 },
  { label: "Technical Issue", value: 35, tone: "violet", pct: 14 },
  { label: "Feature Request", value: 25, tone: "pink", pct: 10 },
  { label: "Other", value: 19, tone: "slate", pct: 8 },
];

/** SAMPLE: recent escalations. */
export const ESCALATIONS: { title: string; when: string }[] = [
  { title: "Cannot export job data", when: "2 hours ago" },
  { title: "Billing charge not recognized", when: "6 hours ago" },
  { title: "Repeated login failures", when: "1 day ago" },
  { title: "Data sync with LinkedIn failing", when: "1 day ago" },
  { title: "Enterprise customer setup issue", when: "2 days ago" },
];
