/**
 * SAMPLE: illustrative numbers for the Analytics board (board 14). `/api/admin/analytics` returns
 * totals, the funnel, applications by status, billing and fill quality (all shown for real); the
 * rest of the board (growth series, engagement, retention, geography, channels, tile trends) is
 * invented, and each panel using it carries a "Sample data" tag.
 */
import type { Tone } from "@/components/app-v2/common";

export const ANALYTICS_TILE_EXTRAS = {
  total: { delta: { value: "12%", dir: "up" as const }, spark: [3, 4, 5, 4, 6, 7, 6, 8, 9, 10] },
  active: { delta: { value: "18%", dir: "up" as const }, spark: [4, 5, 4, 6, 6, 7, 8, 7, 9, 9] },
  signups: { delta: { value: "24%", dir: "up" as const }, spark: [2, 3, 3, 5, 4, 6, 5, 8, 7, 9] },
  churn: { delta: { value: "0.6%", dir: "down" as const, good: true }, spark: [6, 5, 7, 5, 6, 4, 6, 5, 4, 5] },
};

export const FILTERS: { label: string; options: string[]; tone: Tone }[] = [
  { label: "Date range", options: ["Last 30 days", "Last 7 days", "Last 90 days"], tone: "blue" },
  { label: "Acquisition channel", options: ["All channels", "Organic search", "Direct", "Referral"], tone: "violet" },
  { label: "Plan", options: ["All plans", "Free", "Pro", "Autopilot"], tone: "amber" },
  { label: "Geography", options: ["All regions", "North America", "Europe", "Asia"], tone: "teal" },
];

export const TOTAL_USERS_SERIES = [40, 52, 48, 60, 56, 74, 70, 88, 80, 96, 104, 98, 112, 120, 108, 124, 140, 132, 128, 146, 152, 144, 160, 176, 168, 172, 156, 170, 178, 186];
export const ACTIVE_USERS_SERIES = [30, 44, 38, 52, 46, 60, 66, 70, 64, 82, 88, 80, 96, 100, 90, 104, 112, 108, 106, 120, 126, 118, 134, 150, 140, 144, 128, 138, 146, 156];
export const GROWTH_X = ["Sep 10", "Sep 17", "Sep 24", "Oct 1", "Oct 8"];

export const ENGAGEMENT: { label: string; value: number; tone: Tone; icon: "ai" | "board" | "chart" | "file" | "mail" | "link" | "users" }[] = [
  { label: "AI services", value: 412, tone: "blue", icon: "ai" },
  { label: "Job sources", value: 368, tone: "green", icon: "board" },
  { label: "Analysis", value: 296, tone: "amber", icon: "chart" },
  { label: "Reports", value: 241, tone: "violet", icon: "file" },
  { label: "Email", value: 198, tone: "pink", icon: "mail" },
  { label: "Integrations", value: 164, tone: "blue", icon: "link" },
  { label: "Collaboration", value: 120, tone: "violet", icon: "users" },
];

/** Percent of each weekly cohort still active in week 0..8; null = not reached yet. */
export const COHORTS: { label: string; weeks: (number | null)[] }[] = [
  { label: "Sep 1 - Sep 7", weeks: [100, 68, 54, 42, 36, 28] },
  { label: "Sep 8 - Sep 14", weeks: [100, 71, 56, 44, 31, 26] },
  { label: "Sep 15 - Sep 21", weeks: [100, 69, 51, 39, null, null] },
  { label: "Sep 22 - Sep 28", weeks: [100, 67, 48, null, null, null] },
  { label: "Sep 29 - Oct 5", weeks: [100, 63, null, null, null, null] },
];
export const COHORT_WEEKS = ["Week 0", "Week 1", "Week 2", "Week 3", "Week 4", "Week 8"];

export const COUNTRIES: { label: string; value: number; pct: number; tone: Tone }[] = [
  { label: "United States", value: 384, pct: 30, tone: "blue" },
  { label: "United Kingdom", value: 186, pct: 15, tone: "green" },
  { label: "Canada", value: 142, pct: 11, tone: "amber" },
  { label: "Australia", value: 96, pct: 7, tone: "violet" },
  { label: "Germany", value: 82, pct: 6, tone: "pink" },
  { label: "France", value: 68, pct: 5, tone: "blue" },
  { label: "Others", value: 326, pct: 26, tone: "violet" },
];

export const CHANNELS: { channel: string; users: number; active: number; conversion: string; churn: string; icon: "search" | "link" | "rocket" | "linkedin" | "x" | "mail" | "users" }[] = [
  { channel: "Organic search", users: 428, active: 162, conversion: "5.6%", churn: "2.1%", icon: "search" },
  { channel: "Direct", users: 312, active: 124, conversion: "4.8%", churn: "2.9%", icon: "link" },
  { channel: "Product Hunt", users: 186, active: 78, conversion: "8.4%", churn: "1.6%", icon: "rocket" },
  { channel: "LinkedIn", users: 142, active: 58, conversion: "3.9%", churn: "3.4%", icon: "linkedin" },
  { channel: "Twitter / X", users: 96, active: 36, conversion: "3.2%", churn: "4.1%", icon: "x" },
  { channel: "Email campaign", users: 84, active: 42, conversion: "6.8%", churn: "2.7%", icon: "mail" },
  { channel: "Partners", users: 62, active: 28, conversion: "4.1%", churn: "3.6%", icon: "users" },
];
