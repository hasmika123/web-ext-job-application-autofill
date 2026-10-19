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

/** What a target type is called in a sentence. Anything not listed is turned into words with an article ("an assignment"): never a bare key. */
const TARGET_WORDS: Record<string, string> = {
  ORG: "the organization",
  ORGANIZATION: "the organization",
  ORG_SETTINGS: "the organization settings",
  SETTINGS: "the organization settings",
  BRANDING: "the branding",
  MEMBER: "an employee",
  CONSULTANT: "a consultant",
  REQUIREMENT: "a requirement",
  JOB: "a job",
  CLIENT: "a client",
  APPLICATION: "an application",
  INTERVIEW: "an interview",
  PLACEMENT: "a placement",
  RESUME: "a resume",
  ROLE: "a role",
  GROUP: "a team",
  TEAM: "a team",
  DEPARTMENT: "a department",
  INVITATION: "an invitation",
  ASSIGNMENT: "an assignment",
  POLICY: "a policy",
};

/** The words for what an event touched, when it carries no name: "a consultant", "the organization". Null when it carries no type either. */
export function targetWords(type: string | null): string | null {
  if (!type) return null;
  const key = type.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (TARGET_WORDS[key]) return TARGET_WORDS[key];
  const words = key.toLowerCase().replace(/_/g, " ");
  return `${/^[aeiou]/.test(words) ? "an" : "a"} ${words}`;
}

/** The "To whom" cell: the subject's name when the event carries one, otherwise the type in words. */
export const toWhom = (r: Pick<AuditItem, "targetName" | "targetType">): string => r.targetName ?? targetWords(r.targetType) ?? "";

/** An event key written in lower-case words ("marketing bulk"), for the rare row whose label is empty or is the key itself. */
const keyWords = (key: string): string => key.toLowerCase().replace(/_/g, " ").trim();

/** The "What" cell: the API's sentence; if it is missing or is only the raw key, the key in words (never the key as it is stored). */
export function whatLabel(r: Pick<AuditItem, "action" | "label">): string {
  const label = r.label.trim();
  if (label && label !== r.action && !/^[A-Z][A-Z0-9_]+$/.test(label)) return label;
  return keyWords(r.action || label) || "did something";
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
