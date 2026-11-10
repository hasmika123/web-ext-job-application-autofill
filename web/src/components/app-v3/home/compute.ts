import { SUBMITTED_STATUSES, shortDay, type Application, type ActivityDay } from "@/lib/applications";
import type { Tone } from "@/components/app-v2/common";

/**
 * Pure helpers that turn the tracker's real numbers into the Dashboard's (APP-V3-SPEC 2.1, U3.1): the list v2
 * `summary` (per-status counts the server computed), the few most recent applications, and the per-day activity
 * feed. Nothing here invents a figure: with no data every number is 0 and the cards show an honest empty state.
 */

export interface DashStat {
  id: "applications" | "interviews" | "offers" | "saved";
  value: string;
  label: string;
  note: string;
  tone: Tone;
}

export interface DashRecent {
  id: string;
  title: string;
  company: string;
  /** The wire status ("IN_REVIEW"); the card words and colours it. */
  status: string;
  /** Short date, "Oct 8". */
  date: string;
}

export interface DashboardNumbers {
  stats: DashStat[];
  status: { label: string; value: number; tone: Tone }[];
  /** Submitted applications (what the donut's centre says). */
  total: number;
  recent: DashRecent[];
}

const n = (summary: Record<string, number> | undefined, key: string): number => summary?.[key] ?? 0;

/** The donut's slices, in funnel order. */
const SLICES: { key: string; label: string; tone: Tone }[] = [
  { key: "APPLIED", label: "Applied", tone: "blue" },
  { key: "IN_REVIEW", label: "Under Review", tone: "amber" },
  { key: "INTERVIEW", label: "Interview", tone: "green" },
  { key: "OFFER", label: "Offer", tone: "violet" },
  { key: "REJECTED", label: "Rejected", tone: "coral" },
];

/**
 * The four tiles, the donut and the recent list from the list v2 summary and the newest applications. The notes
 * under the numbers are worded from the counts (the server has no period-over-period figure yet), so they never
 * claim a trend.
 */
export function computeDashboard(summary: Record<string, number> | undefined, recent: Application[]): DashboardNumbers {
  const submitted = SUBMITTED_STATUSES.reduce((sum, s) => sum + n(summary, s), 0);
  const waiting = n(summary, "APPLIED") + n(summary, "IN_REVIEW");
  const quiet = n(summary, "GHOSTED");
  const interviews = n(summary, "INTERVIEW");
  const offers = n(summary, "OFFER");
  const saved = n(summary, "SAVED");

  const stats: DashStat[] = [
    {
      id: "applications",
      value: String(submitted),
      label: "Applications",
      note: submitted === 0 ? "Send your first one" : quiet > 0 ? `${quiet} gone quiet` : waiting > 0 ? `${waiting} waiting to hear back` : "All answered",
      tone: "blue",
    },
    { id: "interviews", value: String(interviews), label: "Interviews", note: interviews > 0 ? "in progress" : "keep going", tone: "green" },
    { id: "offers", value: String(offers), label: "Offers", note: offers > 0 ? "decision time" : "keep going", tone: "violet" },
    { id: "saved", value: String(saved), label: "Saved Jobs", note: saved > 0 ? "on your list" : "save some jobs", tone: "amber" },
  ];

  return {
    stats,
    status: SLICES.map((s) => ({ label: s.label, value: n(summary, s.key), tone: s.tone })),
    total: submitted,
    recent: recent.slice(0, 5).map((a) => ({
      id: String(a.id),
      title: a.roleTitle || "Untitled role",
      company: a.company || "Unknown company",
      status: a.status,
      date: shortDay(a.appliedAt ?? a.createdAt),
    })),
  };
}

export interface ActivityGroup {
  label: string;
  values: number[];
}

/** How many bars a period longer than a week is folded into. */
export const ACTIVITY_BUCKETS = 6;
/** Up to this many days draw one bar per day. */
export const DAILY_UP_TO = 7;

/**
 * Per-day event counts as bars: a week or less is one bar per day (weekday names), longer periods fold into
 * `ACTIVITY_BUCKETS` even buckets labelled by their first day ("Oct 8"). Pure; days are the API's yyyy-MM-dd.
 */
export function bucketActivity(days: ActivityDay[], buckets: number = ACTIVITY_BUCKETS, dailyUpTo: number = DAILY_UP_TO): ActivityGroup[] {
  if (days.length === 0) return [];
  const label = (day: string, weekday: boolean) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", weekday ? { weekday: "short", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" });
  if (days.length <= dailyUpTo) return days.map((d) => ({ label: label(d.day, true), values: [d.count] }));
  const size = Math.ceil(days.length / buckets);
  const out: ActivityGroup[] = [];
  for (let i = 0; i < days.length; i += size) {
    const chunk = days.slice(i, i + size);
    out.push({ label: label(chunk[0].day, false), values: [chunk.reduce((sum, d) => sum + d.count, 0)] });
  }
  return out;
}

function has(v: unknown): boolean {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

/**
 * Profile Strength from the real profile where it can be derived. The bio holds contact and
 * application answers (no skills / experience lists), so "Skills" and "Work experience" follow
 * "a resume is on file" (the resume is where they are parsed from). Without a readable profile (a brand-new
 * account has none) the checklist is computed from an empty one: 0 %, nothing ticked.
 */
export function computeProfile(bio: Record<string, unknown> | null, resumeCount: number) {
  const b = bio ?? {};
  const hasResume = resumeCount > 0;
  const checks = [
    { id: "resume", label: "Resume uploaded", done: hasResume },
    { id: "skills", label: "Skills added", done: hasResume },
    { id: "experience", label: "Work experience added", done: hasResume },
    { id: "portfolio", label: "Add portfolio or projects", done: has(b.website) || has(b.github) || has(b.linkedin) },
    { id: "titles", label: "Add target job titles", done: has(b.desiredTitle) || has(b.targetTitles) },
    { id: "location", label: "Add location preference", done: has(b.workPreference) || has(b.city) },
  ];
  const pct = Math.round((checks.filter((c) => c.done).length / checks.length) * 100);
  return { pct, checks, real: true };
}
