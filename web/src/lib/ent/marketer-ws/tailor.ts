import { parseDetail, type Detail } from "./opportunities";

/**
 * Marketer tailoring (docs/enterprise-v2/MKT-TAILOR-BUILD.md, gap D2): the contract of `POST .../mkt/opportunities/{id}/tailor` and `.../tailor/{proposalId}/save`, and the
 * live score. The score is keyword coverage with no AI: the share of the job's terms the resume covers. Kept changes add the terms they newly cover,
 * and ticked additions add themselves. The server computes the saved score the same way.
 */

export type TailorStatus = "OK" | "NOTHING_TO_CHANGE" | "QUOTA_EXCEEDED" | "NO_JOB_DESCRIPTION" | "DISABLED" | "ERROR";

export interface TailorKeyword { term: string; coveredBefore: boolean }
export interface TailorChange { ref: string; section: string; before: string; after: string; adds: string[] }
export interface TailorProposal {
  proposalId: number | null;
  status: TailorStatus;
  source: { orgResumeId: number; name: string };
  jobTitle: string;
  scoreBefore: number | null;
  keywords: TailorKeyword[];
  changes: TailorChange[];
  additions: string[];
}
export interface TailorApplied { orgResumeId: number; resumeId: number; name: string; scoreBefore: number | null; scoreAfter: number | null; skipped: string[]; notAdded: string[]; detail: Detail | null }

export type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; code: string | null; message: string };

const STATUSES: readonly TailorStatus[] = ["OK", "NOTHING_TO_CHANGE", "QUOTA_EXCEEDED", "NO_JOB_DESCRIPTION", "DISABLED", "ERROR"];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);
const objs = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObj) : []);

export function parseProposal(raw: unknown): TailorProposal | null {
  if (!isObj(raw) || !isObj(raw.source)) return null;
  const status = STATUSES.includes(raw.status as TailorStatus) ? (raw.status as TailorStatus) : "ERROR";
  return {
    proposalId: num(raw.proposalId),
    status,
    source: { orgResumeId: num(raw.source.orgResumeId) ?? 0, name: str(raw.source.name, "Resume") },
    jobTitle: str(raw.jobTitle),
    scoreBefore: num(raw.scoreBefore),
    keywords: objs(raw.keywords).filter((k) => typeof k.term === "string").map((k) => ({ term: str(k.term), coveredBefore: k.coveredBefore === true })),
    changes: objs(raw.changes).filter((c) => typeof c.ref === "string" && typeof c.after === "string").map((c) => ({ ref: str(c.ref), section: str(c.section), before: str(c.before), after: str(c.after), adds: strs(c.adds) })),
    additions: strs(raw.additions),
  };
}

export function parseApplied(raw: unknown): TailorApplied | null {
  if (!isObj(raw) || num(raw.orgResumeId) == null) return null;
  return {
    orgResumeId: num(raw.orgResumeId)!,
    resumeId: num(raw.resumeId) ?? 0,
    name: str(raw.name, "Resume"),
    scoreBefore: num(raw.scoreBefore),
    scoreAfter: num(raw.scoreAfter),
    skipped: strs(raw.skipped),
    notAdded: strs(raw.notAdded),
    detail: parseDetail(raw.detail),
  };
}

/** The terms covered with these changes kept and these additions ticked (before + what they bring), in the job's term order. */
export function coveredWith(p: TailorProposal, kept: ReadonlySet<string>, ticked: ReadonlySet<string>): Set<string> {
  const lower = new Set<string>();
  for (const k of p.keywords) if (k.coveredBefore) lower.add(k.term.toLowerCase());
  for (const c of p.changes) if (kept.has(c.ref)) for (const t of c.adds) lower.add(t.toLowerCase());
  for (const a of ticked) lower.add(a.toLowerCase());
  return new Set(p.keywords.filter((k) => lower.has(k.term.toLowerCase())).map((k) => k.term));
}

/** Whole percent of the job's terms covered; null when the job names none (no score is shown). */
export function scoreWith(p: TailorProposal, kept: ReadonlySet<string>, ticked: ReadonlySet<string>): number | null {
  if (p.keywords.length === 0) return null;
  return Math.round((coveredWith(p, kept, ticked).size * 100) / p.keywords.length);
}

/** What a status that leaves nothing to keep says. */
export function statusText(s: TailorStatus, who: string): string {
  switch (s) {
    case "NOTHING_TO_CHANGE":
      return `${who}'s resume already fits this job: the AI found nothing to change.`;
    case "QUOTA_EXCEEDED":
      return `${who}'s AI budget for this month is used up. It renews next month, or an admin can add AI credits.`;
    case "NO_JOB_DESCRIPTION":
      return "This job has too little description to tailor to. Add the posting's text to the job first.";
    case "DISABLED":
      return "AI tailoring is switched off right now.";
    case "ERROR":
      return "The AI didn't give a usable answer. Try again in a moment.";
    default:
      return "";
  }
}

async function post<T>(url: string, body: unknown, parse: (raw: unknown) => T | null): Promise<Outcome<T>> {
  try {
    const res = await fetch(url, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(body ?? {}), cache: "no-store" });
    const data: unknown = await res.json().catch(() => null);
    const d = isObj(data) ? data : {};
    if (!res.ok) {
      const message = str(d.error) || str(d.detail) || (typeof d.message === "string" && !d.message.startsWith("error.") ? d.message : "") || "That didn't work. Nothing was changed.";
      return { ok: false, status: res.status, code: typeof d.code === "string" ? d.code : null, message };
    }
    const value = parse(data);
    return value ? { ok: true, value } : { ok: false, status: res.status, code: null, message: "That didn't work. Nothing was changed." };
  } catch {
    return { ok: false, status: 0, code: null, message: "We couldn't reach the server. Check your connection." };
  }
}

const base = (orgId: number | string, id: number) => `/api/orgs/${orgId}/mkt/opportunities/${id}/tailor`;

export const proposeTailoring = (orgId: number | string, id: number, orgResumeId?: number | null) =>
  post(base(orgId, id), orgResumeId ? { orgResumeId } : {}, parseProposal);

export const applyTailoring = (orgId: number | string, id: number, proposalId: number, keep: string[], additions: string[], label: string) =>
  post(`${base(orgId, id)}/${proposalId}/save`, { keep, additions, ...(label.trim() ? { label: label.trim() } : {}) }, parseApplied);
