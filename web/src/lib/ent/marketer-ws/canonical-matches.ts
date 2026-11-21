/**
 * Source-specific client for the canonical marketer compatibility feed.
 * It is intentionally separate from matches.ts: a numeric canonical match id must never be sent to a legacy route.
 */

export const CANONICAL_SOURCE = "OPPORTUNITY_MATCH" as const;
export type CanonicalStatus = "SUGGESTED" | "ASSIGNED" | "DISMISSED" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";

export interface CanonicalMatch {
  id: number;
  consultantMemberId: number;
  opportunityId: number;
  opportunityKind: string;
  title: string;
  company: string;
  location: string;
  url: string;
  applyUrl: string;
  sourceLabel: string;
  score: number;
  reason: string;
  model: string;
  source: string;
  status: CanonicalStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CanonicalConsultant {
  memberId: number;
  name: string;
  role: string;
  primarySkill: string;
  availabilityStatus: string;
  availableFrom: string | null;
}

export interface CanonicalMatchItem {
  source: typeof CANONICAL_SOURCE;
  match: CanonicalMatch;
  consultant: CanonicalConsultant;
}

export interface CanonicalMatchesView {
  source: typeof CANONICAL_SOURCE;
  items: CanonicalMatchItem[];
  total: number;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const status = (x: unknown): CanonicalStatus => (x === "ASSIGNED" || x === "DISMISSED" || x === "ACCEPTED" || x === "DECLINED" || x === "WITHDRAWN" ? x : "SUGGESTED");

export function parseCanonicalMatch(raw: unknown): CanonicalMatch | null {
  if (!isObj(raw) || !finite(raw.id) || !finite(raw.consultantMemberId) || !finite(raw.opportunityId)) return null;
  return {
    id: raw.id,
    consultantMemberId: raw.consultantMemberId,
    opportunityId: raw.opportunityId,
    opportunityKind: str(raw.opportunityKind),
    title: str(raw.title),
    company: str(raw.company),
    location: str(raw.location),
    url: str(raw.url),
    applyUrl: str(raw.applyUrl),
    sourceLabel: str(raw.sourceLabel),
    score: num(raw.score),
    reason: str(raw.reason),
    model: str(raw.model),
    source: str(raw.source),
    status: status(raw.status),
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

export function parseCanonicalItem(raw: unknown): CanonicalMatchItem | null {
  if (!isObj(raw) || raw.source !== CANONICAL_SOURCE) return null;
  const match = parseCanonicalMatch(raw.match);
  const c = isObj(raw.consultant) ? raw.consultant : null;
  if (!match || !c || !finite(c.memberId)) return null;
  return {
    source: CANONICAL_SOURCE,
    match,
    consultant: {
      memberId: c.memberId,
      name: str(c.name),
      role: str(c.role),
      primarySkill: str(c.primarySkill),
      availabilityStatus: str(c.availabilityStatus),
      availableFrom: typeof c.availableFrom === "string" ? c.availableFrom : null,
    },
  };
}

export function parseCanonicalMatches(raw: unknown): CanonicalMatchesView | null {
  if (!isObj(raw) || raw.source !== CANONICAL_SOURCE) return null;
  const items = Array.isArray(raw.items) ? raw.items.map(parseCanonicalItem).filter((item): item is CanonicalMatchItem => item !== null) : [];
  return { source: CANONICAL_SOURCE, items, total: num(raw.total, items.length) };
}

export interface CanonicalQuery { consultant?: string; status?: string }

export function canonicalQueryString(query: CanonicalQuery = {}): string {
  const params = new URLSearchParams();
  if (query.consultant) params.set("consultant", query.consultant);
  if (query.status) params.set("status", query.status);
  return params.toString();
}

export type CanonicalFetch = { kind: "OK"; view: CanonicalMatchesView } | { kind: "DENIED" } | { kind: "FAILED" };

export async function fetchCanonicalMatches(orgId: number | string, query: CanonicalQuery = {}, signal?: AbortSignal): Promise<CanonicalFetch> {
  try {
    const qs = canonicalQueryString(query);
    const res = await fetch(`/api/orgs/${orgId}/mkt/matches/canonical${qs ? `?${qs}` : ""}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseCanonicalMatches(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export type CanonicalDetailFetch = { kind: "OK"; item: CanonicalMatchItem } | { kind: "GONE" } | { kind: "FAILED" };

export async function fetchCanonicalDetail(orgId: number | string, id: number, signal?: AbortSignal): Promise<CanonicalDetailFetch> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/matches/canonical/${id}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "GONE" };
    if (!res.ok) return { kind: "FAILED" };
    const item = parseCanonicalItem(await res.json().catch(() => null));
    return item ? { kind: "OK", item } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export type CanonicalAction = "assign" | "dismiss";
export type CanonicalActionResult = { kind: "OK"; item: CanonicalMatchItem } | { kind: "DENIED" } | { kind: "CONFLICT"; message: string } | { kind: "FAILED" };

export async function actOnCanonicalMatch(orgId: number | string, id: number, action: CanonicalAction): Promise<CanonicalActionResult> {
  try {
    const res = await fetch(`/api/orgs/${orgId}/mkt/matches/canonical/${id}/${action}`, { method: "POST", headers: { accept: "application/json" }, cache: "no-store" });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (res.status === 409) {
      const body: unknown = await res.json().catch(() => null);
      const error = isObj(body) ? str(body.error) || str(body.message) : "";
      return { kind: "CONFLICT", message: error || "That canonical match changed. Refresh and try again." };
    }
    if (!res.ok) return { kind: "FAILED" };
    const item = parseCanonicalItem(await res.json().catch(() => null));
    return item ? { kind: "OK", item } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}
