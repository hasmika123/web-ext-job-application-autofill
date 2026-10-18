/**
 * SAMPLE: illustrative numbers for the AI usage board (board 18). The API only has per-month cost,
 * calls, per-user and per-feature totals (`/api/admin/ai-usage`); everything here is invented and
 * every panel that shows it carries a "Sample data" tag.
 */
import type { Tone } from "@/components/app-v2/common";

export const AI_TILE_EXTRAS = {
  requests: { delta: { value: "18%", dir: "up" as const }, spark: [3, 4, 3, 5, 4, 6, 7, 6, 8, 9] },
  users: { delta: { value: "12%", dir: "up" as const }, spark: [4, 4, 5, 5, 6, 6, 7, 8, 8, 9] },
  tokens: { value: "12.8M", delta: { value: "24%", dir: "up" as const }, spark: [2, 3, 3, 5, 4, 6, 5, 8, 7, 9] },
  cost: { delta: { value: "19%", dir: "up" as const }, spark: [3, 3, 4, 5, 5, 6, 6, 8, 8, 9] },
};

/** 30-day AI requests (bars, scale 0..2400) and active AI users (line, scale 0..1000, drawn on the same 0..max axis). */
export const AI_TREND_REQUESTS = [340, 420, 380, 300, 430, 520, 480, 400, 560, 640, 610, 520, 700, 760, 680, 560, 740, 820, 900, 780, 860, 1000, 1160, 1380, 1500, 1260, 1120, 1240, 1180, 1300];
export const AI_TREND_USERS = [330, 360, 340, 380, 420, 440, 430, 470, 500, 520, 560, 540, 580, 620, 610, 650, 640, 690, 720, 700, 760, 790, 820, 880, 940, 880, 860, 840, 870, 890];
export const AI_TREND_X = ["Sep 10", "Sep 17", "Sep 24", "Oct 1", "Oct 8"];

/** SAMPLE: alert feed (no alerting endpoint yet). */
export const AI_ALERTS: { icon: "spike" | "cost" | "info"; title: string; detail: string; when: string; severity: "High" | "Medium" | "Low" }[] = [
  { icon: "spike", title: "Unusual spike in AI requests", detail: "Requests are 3.2x higher than usual in the last hour.", when: "2 hours ago", severity: "High" },
  { icon: "cost", title: "High-cost account detected", detail: "techflow.co has used $42.18 in the last 7 days.", when: "5 hours ago", severity: "Medium" },
  { icon: "info", title: "Spike in interview prep usage", detail: "Interview prep requests increased by 180% this week.", when: "1 day ago", severity: "Low" },
];

export const AI_SEVERITY_TONE: Record<"High" | "Medium" | "Low", Tone> = { High: "coral", Medium: "amber", Low: "violet" };

/** SAMPLE: platform-wide daily request cap (no endpoint yet). */
export const DAILY_REQUEST_LIMIT = 100_000;
