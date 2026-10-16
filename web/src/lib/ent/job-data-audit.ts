import { csvCell } from "@/lib/ent/consultant-ws/activityTimeline";

/**
 * The job data audit (`GET /api/orgs/{orgId}/audit/job-data`, read only, MKT-46): who captured which job, when, from where and with which extension
 * version, plus the ledger events per job. The wire types, a tolerant parser, the one call and the CSV export. The API owns every rule; nothing here
 * invents a row, and the API never sends job text beyond the title and employer.
 */
export interface JobPerson {
  memberId: number | null;
  name: string | null;
}

export interface JobProvenance {
  id: number;
  title: string;
  employer: string | null;
  captureSource: string | null;
  captureMethod: string | null;
  capturedAt: string | null;
  capturedBy: JobPerson | null;
  extensionVersion: string | null;
  detailLevel: string | null;
}

export interface JobEvent {
  id: number;
  type: string;
  occurredAt: string;
  actor: JobPerson | null;
  actorKind: string | null;
}

export interface JobDataItem {
  job: JobProvenance;
  events: JobEvent[];
}

export interface JobDataPage {
  items: JobDataItem[];
  total: number;
  page: number;
  size: number;
}

export type JobDataResult = { kind: "OK"; page: JobDataPage } | { kind: "DENIED" } | { kind: "FAILED" };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const person = (v: unknown): JobPerson | null => (isObj(v) ? { memberId: typeof v.memberId === "number" ? v.memberId : null, name: str(v.name) } : null);

export function parseJobData(json: unknown): JobDataPage | null {
  if (!isObj(json) || !Array.isArray(json.items) || typeof json.total !== "number") return null;
  const items = json.items.flatMap((r): JobDataItem[] => {
    if (!isObj(r) || !isObj(r.job) || typeof r.job.id !== "number") return [];
    const j = r.job;
    const events = (Array.isArray(r.events) ? r.events : []).flatMap((e): JobEvent[] =>
      isObj(e) && typeof e.id === "number" && typeof e.occurredAt === "string" ? [{ id: e.id, type: str(e.type) ?? "EVENT", occurredAt: e.occurredAt, actor: person(e.actor), actorKind: str(e.actorKind) }] : [],
    );
    return [
      {
        job: {
          id: Number(j.id),
          title: str(j.title) ?? "Untitled job",
          employer: str(j.employer),
          captureSource: str(j.captureSource),
          captureMethod: str(j.captureMethod),
          capturedAt: str(j.capturedAt),
          capturedBy: person(j.capturedBy),
          extensionVersion: str(j.extensionVersion),
          detailLevel: str(j.detailLevel),
        },
        events,
      },
    ];
  });
  return { items, total: json.total, page: typeof json.page === "number" ? json.page : 0, size: typeof json.size === "number" ? json.size : items.length };
}

export interface JobDataQuery {
  from: string;
  to: string;
  page: number;
  size: number;
}

export const DEFAULT_JOB_DATA_QUERY: JobDataQuery = { from: "", to: "", page: 0, size: 25 };

/** Dates from the inputs are whole days: from the start of `from`, up to (not including) the day after `to`. */
export function jobDataParams(q: JobDataQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.from) p.set("from", new Date(`${q.from}T00:00:00`).toISOString());
  if (q.to) {
    const d = new Date(`${q.to}T00:00:00`);
    d.setDate(d.getDate() + 1);
    p.set("to", d.toISOString());
  }
  p.set("page", String(q.page));
  p.set("size", String(q.size));
  return p;
}

export async function fetchJobData(orgId: number | string, q: JobDataQuery, signal?: AbortSignal): Promise<JobDataResult> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/audit/job-data?${jobDataParams(q).toString()}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const page = parseJobData(await res.json().catch(() => null));
    return page ? { kind: "OK", page } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

/** A capture source or method code as words (ENTERPRISE_EXTENSION -> Enterprise extension). */
export const codeLabel = (c: string | null): string => (c ? c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, " ") : "-");

/** Client-side narrowing of the rows already loaded: free text over title, employer, who captured it, source and version; plus an exact source. */
export function narrow(items: JobDataItem[], text: string, source: string): JobDataItem[] {
  const t = text.trim().toLowerCase();
  return items.filter((i) => {
    if (source && i.job.captureSource !== source) return false;
    if (!t) return true;
    const hay = [i.job.title, i.job.employer, i.job.capturedBy?.name, i.job.captureSource, i.job.captureMethod, i.job.extensionVersion].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(t);
  });
}

/** The rows on screen as a CSV (no server file). Every cell goes through `csvCell`, so a leading = + - @ never runs as a spreadsheet formula. */
export function jobDataCsv(items: JobDataItem[]): string {
  const rows = [["Job", "Employer", "Captured by", "Captured at", "Source", "Method", "Extension version", "Detail level", "Events"]];
  for (const i of items) {
    const j = i.job;
    rows.push([j.title, j.employer ?? "", j.capturedBy?.name ?? "", j.capturedAt ?? "", j.captureSource ?? "", j.captureMethod ?? "", j.extensionVersion ?? "", j.detailLevel ?? "", String(i.events.length)]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
