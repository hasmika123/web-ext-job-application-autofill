import type { Application } from "@/components/ApplicationBoard";
import { statusKeyOf } from "@/components/app-v2/applications/mapping";
import type { AppStatusKey } from "@/components/app-v2/sample-data";
import type { Tone } from "@/components/app-v2/common";
import {
  DASH_PROFILE_CHECKS,
  DASH_PROFILE_PCT,
  type DashRecent,
  type DashStat,
} from "@/components/app-v3/sample-data";

/**
 * Pure helpers that turn the real `/api/profile/applications` list into the Dashboard's numbers
 * (APP-V3-SPEC 2.1). Dates are formatted in UTC so the server and the client agree.
 */

const DAY = 86_400_000;

export const STATUS_LABEL: Record<AppStatusKey, { label: string; tone: Tone }> = {
  applied: { label: "Applied", tone: "blue" },
  "in-review": { label: "Under Review", tone: "amber" },
  interview: { label: "Interview", tone: "green" },
  offer: { label: "Offer", tone: "violet" },
  rejected: { label: "Rejected", tone: "coral" },
  withdrawn: { label: "Withdrawn", tone: "slate" },
  draft: { label: "Draft", tone: "slate" },
};

/** "Oct 8" in UTC. */
export function shortDate(iso: string | number | null | undefined): string {
  if (iso === null || iso === undefined || iso === "") return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

interface Counted {
  app: Application;
  status: AppStatusKey;
  at: number;
}

function counted(apps: Application[]): Counted[] {
  const out: Counted[] = [];
  for (const app of apps) {
    const status = statusKeyOf(app);
    if (!status || status === "draft" || status === "withdrawn") continue;
    const at = new Date(app.appliedAt || app.createdAt || 0).getTime();
    out.push({ app, status, at: Number.isNaN(at) ? 0 : at });
  }
  return out;
}

export interface DashboardNumbers {
  stats: DashStat[];
  status: { label: string; value: number; tone: Tone }[];
  total: number;
  recent: DashRecent[];
  /** Activity by period label. */
  activity: Record<string, { label: string; values: number[] }[]>;
}

/** Five equal buckets ending now: Applied / Interviews (interview + offer) / Offers per bucket. */
function buckets(rows: Counted[], days: number, now: number) {
  const step = (days * DAY) / 5;
  const start = now - days * DAY;
  return Array.from({ length: 5 }, (_, i) => {
    const from = start + i * step;
    const to = from + step;
    const inB = rows.filter((r) => r.at >= from && (i === 4 ? r.at <= now : r.at < to));
    return {
      label: shortDate(Math.round(from + step / 2)),
      values: [
        inB.length,
        inB.filter((r) => r.status === "interview" || r.status === "offer").length,
        inB.filter((r) => r.status === "offer").length,
      ],
    };
  });
}

export function computeDashboard(apps: Application[], now = Date.now()): DashboardNumbers {
  const rows = counted(apps);
  const weekAgo = now - 7 * DAY;
  const thisWeek = rows.filter((r) => r.at >= weekAgo).length;
  const count = (k: AppStatusKey) => rows.filter((r) => r.status === k).length;
  const interviews = count("interview");
  const offers = count("offer");
  const saved = apps.filter((a) => a.status === "SAVED" && !a.archived).length;

  const stats: DashStat[] = [
    { id: "applications", value: String(rows.length), label: "Applications", note: thisWeek > 0 ? `+${thisWeek} this week` : "None this week", tone: "blue" },
    { id: "interviews", value: String(interviews), label: "Interviews", note: interviews > 0 ? "in progress" : "keep going", tone: "green" },
    { id: "offers", value: String(offers), label: "Offers", note: offers > 0 ? "decision pending" : "keep going", tone: "violet" },
    { id: "saved", value: String(saved), label: "Saved Jobs", note: saved > 0 ? "on your list" : "save some jobs", tone: "amber" },
  ];

  const status = (
    [
      ["applied", "blue"],
      ["in-review", "amber"],
      ["interview", "green"],
      ["offer", "violet"],
      ["rejected", "coral"],
    ] as [AppStatusKey, Tone][]
  ).map(([k, tone]) => ({ label: STATUS_LABEL[k].label, value: count(k), tone }));

  const recent: DashRecent[] = [...rows]
    .sort((a, b) => b.at - a.at)
    .slice(0, 5)
    .map((r) => ({
      id: String(r.app.id),
      title: r.app.roleTitle || "Untitled role",
      company: r.app.company || "Unknown company",
      status: STATUS_LABEL[r.status].label,
      date: shortDate(r.at),
    }));

  return {
    stats,
    status,
    total: rows.length,
    recent,
    activity: {
      "Last 7 days": buckets(rows, 7, now),
      "Last 30 days": buckets(rows, 30, now),
      "Last 90 days": buckets(rows, 90, now),
    },
  };
}

function has(v: unknown): boolean {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

/**
 * Profile Strength from the real profile where it can be derived. The bio holds contact and
 * application answers (no skills / experience lists), so "Skills" and "Work experience" follow
 * "a resume is on file" (the resume is where they are parsed from). Without a readable profile the
 * board's sample checklist renders.
 */
export function computeProfile(bio: Record<string, unknown> | null, resumeCount: number) {
  if (!bio) return { pct: DASH_PROFILE_PCT, checks: DASH_PROFILE_CHECKS, real: false };
  const hasResume = resumeCount > 0;
  const checks = [
    { id: "resume", label: "Resume uploaded", done: hasResume },
    { id: "skills", label: "Skills added", done: hasResume },
    { id: "experience", label: "Work experience added", done: hasResume },
    { id: "portfolio", label: "Add portfolio or projects", done: has(bio.website) || has(bio.github) || has(bio.linkedin) },
    { id: "titles", label: "Add target job titles", done: has(bio.desiredTitle) || has(bio.targetTitles) },
    { id: "location", label: "Add location preference", done: has(bio.workPreference) || has(bio.city) },
  ];
  const pct = Math.round((checks.filter((c) => c.done).length / checks.length) * 100);
  return { pct, checks, real: true };
}
