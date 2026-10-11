import type { Application } from "@/components/ApplicationBoard";
import { statusKeyOf } from "@/components/app-v2/applications/mapping";
import { AN_SAMPLE, type AnalyticsData } from "../sample-data";

const DAY = 86_400_000;
const SUBMITTED = new Set(["APPLIED", "INTERVIEW", "OFFER", "REJECTED"]);
const RESPONDED = new Set(["INTERVIEW", "OFFER", "REJECTED"]);

const when = (a: Application): number => {
  const t = new Date(a.appliedAt || a.createdAt || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
};

const label = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Real analytics from `/api/profile/applications`. With no submitted applications yet the board's
 * sample numbers are returned instead (so the page looks like the board; `real: false`).
 *
 * Definitions: Applications = submitted ones (APPLIED/INTERVIEW/OFFER/REJECTED, not archived);
 * Interviews = reached INTERVIEW or OFFER; Response rate = any employer reply (interview, offer or
 * rejection) over applications. The API keeps one status per application and no history, so the
 * weekly chart buckets each application by its applied date and counts it under the stage it
 * currently has.
 */
export function computeAnalytics(apps: Application[], now = Date.now()): AnalyticsData {
  const live = apps.filter((a) => !a.archived && SUBMITTED.has(a.status));
  if (live.length === 0) return AN_SAMPLE;

  const applied = live.length;
  const interviews = live.filter((a) => a.status === "INTERVIEW" || a.status === "OFFER").length;
  const offers = live.filter((a) => a.status === "OFFER").length;
  const responded = live.filter((a) => RESPONDED.has(a.status)).length;

  // 30 days vs the 30 before it, for the one delta that can be computed honestly.
  const last30 = live.filter((a) => when(a) > now - 30 * DAY).length;
  const prev30 = live.filter((a) => when(a) > now - 60 * DAY && when(a) <= now - 30 * DAY).length;
  const applicationsDelta =
    prev30 > 0 ? { value: `${Math.abs(Math.round(((last30 - prev30) / prev30) * 100))}%`, up: last30 >= prev30 } : undefined;

  // Five weekly buckets ending now; labelled by the bucket's first day, oldest first.
  const overTime = Array.from({ length: 5 }, (_, i) => {
    const end = now - (4 - i) * 7 * DAY;
    const start = end - 7 * DAY;
    const inBucket = live.filter((a) => when(a) > start && when(a) <= end);
    return {
      label: label(start),
      values: [
        inBucket.length,
        inBucket.filter((a) => a.status === "INTERVIEW" || a.status === "OFFER").length,
        inBucket.filter((a) => a.status === "OFFER").length,
      ],
    };
  });

  const byCompany = new Map<string, { apps: number; replies: number }>();
  for (const a of live) {
    if (!a.company) continue;
    const e = byCompany.get(a.company) ?? { apps: 0, replies: 0 };
    e.apps += 1;
    if (RESPONDED.has(a.status)) e.replies += 1;
    byCompany.set(a.company, e);
  }
  const responseByCompany = [...byCompany.entries()]
    .sort((x, y) => y[1].apps - x[1].apps)
    .slice(0, 5)
    .map(([name, e]) => ({ name, pct: Math.round((e.replies / e.apps) * 100) }));

  const count = (key: string) => apps.filter((a) => statusKeyOf(a) === key).length;
  const status: AnalyticsData["status"] = [
    { label: "Applied", value: count("applied"), tone: "blue" },
    { label: "Under Review", value: count("in-review"), tone: "amber" },
    { label: "Interview", value: count("interview"), tone: "green" },
    { label: "Offer", value: count("offer"), tone: "violet" },
    { label: "Rejected", value: count("rejected"), tone: "coral" },
  ];

  return {
    real: true,
    stats: {
      applications: { value: String(applied), delta: applicationsDelta },
      interviews: { value: String(interviews) },
      offers: { value: String(offers) },
      response: { value: `${Math.round((responded / applied) * 100)}%` },
    },
    overTime,
    responseByCompany: responseByCompany.length > 0 ? responseByCompany : AN_SAMPLE.responseByCompany,
    status,
  };
}
