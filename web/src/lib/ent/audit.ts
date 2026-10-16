/**
 * The organization audit log page (`GET /api/orgs/{orgId}/audit`, read only): the wire types, a tolerant parser and the one call. The API owns every
 * rule; nothing here invents a row.
 */
export interface AuditItem {
  id: number;
  at: string;
  action: string;
  label: string;
  actorName: string;
  targetType: string | null;
  targetName: string | null;
}

export interface AuditPage {
  items: AuditItem[];
  total: number;
  page: number;
  size: number;
  actions: { action: string; label: string }[];
}

export type AuditResult = { kind: "OK"; page: AuditPage } | { kind: "DENIED" } | { kind: "FAILED" };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function parseAudit(json: unknown): AuditPage | null {
  if (!isObj(json) || !Array.isArray(json.items) || typeof json.total !== "number") return null;
  const items = json.items.flatMap((r): AuditItem[] => {
    if (!isObj(r) || typeof r.id !== "number" || typeof r.at !== "string") return [];
    return [{ id: r.id, at: r.at, action: str(r.action) ?? "", label: str(r.label) ?? "did something", actorName: str(r.actorName) ?? "Team member", targetType: str(r.targetType), targetName: str(r.targetName) }];
  });
  const actions = (Array.isArray(json.actions) ? json.actions : []).flatMap((a): { action: string; label: string }[] => (isObj(a) && str(a.action) ? [{ action: String(a.action), label: str(a.label) ?? String(a.action) }] : []));
  return { items, total: json.total, page: typeof json.page === "number" ? json.page : 0, size: typeof json.size === "number" ? json.size : items.length, actions };
}

export interface AuditQuery {
  action: string;
  from: string;
  to: string;
  page: number;
  size: number;
}

export const DEFAULT_AUDIT_QUERY: AuditQuery = { action: "", from: "", to: "", page: 0, size: 25 };

/** Dates from the inputs are whole days: from the start of `from`, up to (not including) the day after `to`. */
export function auditParams(q: AuditQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.action) p.set("action", q.action);
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

export async function fetchAudit(orgId: number | string, q: AuditQuery, signal?: AbortSignal): Promise<AuditResult> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/audit?${auditParams(q).toString()}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const page = parseAudit(await res.json().catch(() => null));
    return page ? { kind: "OK", page } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}
