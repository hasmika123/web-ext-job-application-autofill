/**
 * The Org Admin's policy pages (docs/enterprise-v2/62): `GET /api/orgs/{orgId}/policies[/{kind}]`, save the draft, start from the template, submit for review,
 * withdraw. The API owns every rule (permission, which kinds exist, sanitizing, the review state machine, If-Match); this file is the wire types, tolerant
 * parsers and the calls, each returning a result the page switches on (never throwing).
 */
export type PolicyState = "DRAFT" | "IN_REVIEW" | "CHANGES_REQUESTED" | "PUBLISHED";

export const STATE_LABEL: Record<PolicyState, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  CHANGES_REQUESTED: "Changes requested",
  PUBLISHED: "Published",
};

export interface PolicyRow {
  kind: string;
  title: string;
  path: string;
  state: PolicyState;
  liveVersion: number | null;
  liveSince: string | null;
  reviewComment: string | null;
  updatedAt: string | null;
}

export interface PolicyList {
  requireReview: boolean;
  maxChars: number;
  policies: PolicyRow[];
}

export interface PolicyVersionRow {
  versionNo: number;
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  publishedAt: string | null;
}

export interface PolicyDetail {
  kind: string;
  title: string;
  path: string;
  state: PolicyState;
  draftVersion: number;
  draftBody: string | null;
  liveBody: string | null;
  liveVersion: number | null;
  reviewComment: string | null;
  requireReview: boolean;
  maxChars: number;
  versions: PolicyVersionRow[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const STATES: readonly string[] = ["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED", "PUBLISHED"];
const state = (v: unknown): PolicyState => (typeof v === "string" && STATES.includes(v) ? (v as PolicyState) : "DRAFT");

export function parseList(json: unknown): PolicyList | null {
  if (!isObj(json) || !Array.isArray(json.policies)) return null;
  const policies: PolicyRow[] = [];
  for (const p of json.policies) {
    if (!isObj(p) || typeof p.kind !== "string" || typeof p.title !== "string" || typeof p.path !== "string") return null;
    policies.push({
      kind: p.kind,
      title: p.title,
      path: p.path,
      state: state(p.state),
      liveVersion: num(p.liveVersion),
      liveSince: str(p.liveSince),
      reviewComment: str(p.reviewComment),
      updatedAt: str(p.updatedAt),
    });
  }
  return { requireReview: json.requireReview !== false, maxChars: num(json.maxChars) ?? 40000, policies };
}

export function parseDetail(json: unknown): PolicyDetail | null {
  if (!isObj(json) || typeof json.kind !== "string" || typeof json.title !== "string") return null;
  const versions: PolicyVersionRow[] = Array.isArray(json.versions)
    ? json.versions.filter(isObj).map((v) => ({
        versionNo: num(v.versionNo) ?? 0,
        status: str(v.status) ?? "",
        submittedAt: str(v.submittedAt),
        reviewedAt: str(v.reviewedAt),
        reviewComment: str(v.reviewComment),
        publishedAt: str(v.publishedAt),
      }))
    : [];
  return {
    kind: json.kind,
    title: json.title,
    path: str(json.path) ?? "",
    state: state(json.state),
    draftVersion: num(json.draftVersion) ?? 0,
    draftBody: str(json.draftBody),
    liveBody: str(json.liveBody),
    liveVersion: num(json.liveVersion),
    reviewComment: str(json.reviewComment),
    requireReview: json.requireReview !== false,
    maxChars: num(json.maxChars) ?? 40000,
    versions,
  };
}

export type ListResult = { kind: "OK"; list: PolicyList } | { kind: "DENIED" } | { kind: "FAILED" };
export type DetailResult =
  | { kind: "OK"; detail: PolicyDetail }
  | { kind: "DEMO" }
  | { kind: "DENIED" }
  | { kind: "CONFLICT"; message: string }
  | { kind: "INVALID"; message: string }
  | { kind: "FAILED" };

const base = (orgId: number | string) => `/api/orgs/${orgId}/policies`;
const one = (orgId: number | string, kind: string) => `${base(orgId)}/${encodeURIComponent(kind)}`;
const JSON_HEADERS = { accept: "application/json", "content-type": "application/json" };

export async function fetchPolicies(orgId: number | string, signal?: AbortSignal): Promise<ListResult> {
  try {
    const res = await fetch(base(orgId), { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const list = parseList(await res.json().catch(() => null));
    return list ? { kind: "OK", list } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

async function detailFrom(res: Response): Promise<DetailResult> {
  const json: unknown = await res.json().catch(() => null);
  const o = isObj(json) ? json : {};
  const message = typeof o.error === "string" ? o.error : "That was not accepted.";
  if (res.status === 403 && o.code === "DEMO_READ_ONLY") return { kind: "DEMO" };
  if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
  if (res.status === 409) return { kind: "CONFLICT", message };
  if (res.status === 422 || res.status === 400) return { kind: "INVALID", message };
  if (!res.ok) return { kind: "FAILED" };
  const detail = parseDetail(json);
  return detail ? { kind: "OK", detail } : { kind: "FAILED" };
}

export async function fetchPolicy(orgId: number | string, kind: string, signal?: AbortSignal): Promise<DetailResult> {
  try {
    return await detailFrom(await fetch(one(orgId, kind), { headers: { accept: "application/json" }, cache: "no-store", signal }));
  } catch {
    return { kind: "FAILED" };
  }
}

export async function saveDraft(orgId: number | string, kind: string, body: string, draftVersion: number): Promise<DetailResult> {
  try {
    return await detailFrom(await fetch(`${one(orgId, kind)}/draft`, { method: "PUT", headers: { ...JSON_HEADERS, "if-match": String(draftVersion) }, body: JSON.stringify({ body }), cache: "no-store" }));
  } catch {
    return { kind: "FAILED" };
  }
}

async function act(orgId: number | string, kind: string, action: "template" | "submit" | "withdraw"): Promise<DetailResult> {
  try {
    return await detailFrom(await fetch(`${one(orgId, kind)}/${action}`, { method: "POST", headers: { accept: "application/json" }, cache: "no-store" }));
  } catch {
    return { kind: "FAILED" };
  }
}

export const startFromTemplate = (orgId: number | string, kind: string) => act(orgId, kind, "template");
export const submitForReview = (orgId: number | string, kind: string) => act(orgId, kind, "submit");
export const withdrawSubmission = (orgId: number | string, kind: string) => act(orgId, kind, "withdraw");

/** Whether the editor is locked: a submission in review can only be withdrawn. */
export const isLocked = (s: PolicyState): boolean => s === "IN_REVIEW";
