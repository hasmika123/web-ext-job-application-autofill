import type { Application } from "@/components/ApplicationBoard";
import type { AppStatusKey, ApplicationRowSample } from "../sample-data.pages";

/**
 * Maps the real `/api/profile/applications` list onto the My Applications board's table
 * (spec 3.2). The API statuses are DRAFT / SAVED / APPLIED / INTERVIEW / OFFER / REJECTED;
 * the board also shows "In Review" and "Withdrawn", which the API has no status for, so:
 *   - SAVED rows are bookmarks (they belong on Saved Jobs) and are left out;
 *   - APPLIED with a confirmed submission reads "In Review" (submitted, waiting on the
 *     employer), unconfirmed APPLIED reads "Applied";
 *   - archived rows read "Withdrawn" (the user put them away);
 *   - DRAFT stays "Draft" (counted under All only).
 * Dates are formatted in UTC so server and client render identically.
 */

export interface ApplicationRow extends ApplicationRowSample {
  /** ISO timestamp used for sorting (appliedAt, falling back to createdAt). */
  sortKey: string;
}

const fmt = (iso?: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

const NEXT_STEP: Record<AppStatusKey, string> = {
  draft: "Finish and submit",
  applied: "Application submitted",
  "in-review": "Waiting for response",
  interview: "Interview in progress",
  offer: "Review your offer",
  rejected: "Not selected",
  withdrawn: "Archived by you",
};

export function statusKeyOf(a: Application): AppStatusKey | null {
  if (a.status === "SAVED") return null;
  if (a.archived) return "withdrawn";
  switch (a.status) {
    case "DRAFT":
      return "draft";
    case "APPLIED":
      return a.submissionConfirmed ? "in-review" : "applied";
    case "INTERVIEW":
      return "interview";
    case "OFFER":
      return "offer";
    case "REJECTED":
      return "rejected";
    default:
      return "applied";
  }
}

export function mapApplications(apps: Application[]): ApplicationRow[] {
  const rows: ApplicationRow[] = [];
  for (const a of apps) {
    const status = statusKeyOf(a);
    if (!status) continue;
    const when = a.appliedAt || a.createdAt || "";
    rows.push({
      id: String(a.id),
      title: a.roleTitle || "Untitled role",
      company: a.company || "Unknown company",
      sub: [a.jobType ? a.jobType.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : null, a.location || a.jobMode]
        .filter(Boolean)
        .join(" · "),
      status,
      appliedOn: fmt(when),
      nextStep: NEXT_STEP[status],
      href: a.jobUrl ?? null,
      sortKey: when,
    });
  }
  return rows.sort((x, y) => y.sortKey.localeCompare(x.sortKey));
}

/** "2 days ago" style label, computed on the server at request time. */
export function agoLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 60) return mins <= 1 ? "just now" : `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

const ACTIVITY_TITLE: Record<AppStatusKey, string> = {
  draft: "Draft started",
  applied: "Application submitted",
  "in-review": "Status updated to In Review",
  interview: "Interview stage reached",
  offer: "Offer received",
  rejected: "Application closed",
  withdrawn: "Application archived",
};
const ACTIVITY_TONE: Record<AppStatusKey, "green" | "amber" | "blue" | "violet" | "coral" | "slate"> = {
  draft: "slate",
  applied: "green",
  "in-review": "amber",
  interview: "blue",
  offer: "violet",
  rejected: "coral",
  withdrawn: "slate",
};

export function activityFrom(apps: Application[], limit = 3, now = Date.now()) {
  return apps
    .filter((a) => a.status !== "SAVED")
    .map((a) => ({ a, status: statusKeyOf(a)!, when: a.appliedAt || a.createdAt || "" }))
    .sort((x, y) => y.when.localeCompare(x.when))
    .slice(0, limit)
    .map(({ a, status, when }) => ({
      id: String(a.id),
      title: ACTIVITY_TITLE[status],
      body: `${a.roleTitle} at ${a.company}`,
      ago: agoLabel(when, now),
      tone: ACTIVITY_TONE[status],
    }));
}
