/**
 * Assigned Opportunities, consultant side (workspace `consultant`, API `/api/orgs/{orgId}/con/opportunities` through the BFF `/api/orgs/{orgId}/consultant/opportunities`, contract: docs/enterprise-v2/60 s3, s4, s7).
 * Jobs a marketer picked for ME. E1: nothing here applies for anyone: "Open job posting" is a plain link to the source site, "I applied"
 * only RECORDS what the consultant did, and every button is drawn from the server's `allowedActions[]`.
 */

export const STATES = ["ASSIGNED", "VIEWED", "INTERESTED", "NEEDS_INFO", "APPLIED", "DECLINED", "CLOSED"] as const;
export type ConState = (typeof STATES)[number];
export const STATE_LABELS: Record<ConState, string> = {
  ASSIGNED: "New",
  VIEWED: "Viewed",
  INTERESTED: "Interested",
  NEEDS_INFO: "Needs info",
  APPLIED: "Applied",
  DECLINED: "Declined",
  CLOSED: "Closed",
};

export const ACTIONS = ["VIEWED", "INTEREST", "DECLINE", "REQUEST_INFO", "APPLIED", "LINK", "UNLINK"] as const;
export type ConAction = (typeof ACTIONS)[number];

export const DECLINE_REASONS = ["NOT_INTERESTED", "LOCATION", "RATE", "ALREADY_APPLIED", "OTHER"] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];
export const DECLINE_LABELS: Record<DeclineReason, string> = {
  NOT_INTERESTED: "Not interested",
  LOCATION: "Location doesn't work",
  RATE: "Pay doesn't work",
  ALREADY_APPLIED: "I already applied",
  OTHER: "Something else",
};

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const WORK_MODES = ["REMOTE", "HYBRID", "ONSITE"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

/** The limits the API enforces (contract s4); the dialogs mirror them so a refusal is rare. */
export const QUESTION_MAX = 500;
export const NOTE_MAX = 200;

export interface ConJob {
  id: number;
  title: string;
  company: string;
  location: string;
  workMode: WorkMode | null;
  employmentType: string;
  payLabel: string;
  /** The source posting. The only way to apply; always shown. */
  jobUrl: string;
  atsPlatform: string;
  externalJobId: string;
  postedOn: string | null;
  skills: string[];
  /** The level this job is shown at (the lower of its stored level and the organization's cap). Display only: "MINIMAL" = say "view the full posting on the source". */
  detailLevel: "MINIMAL" | "FULL";
}
export interface ConTimelineEntry { id: string; at: string; text: string; actor: string }
export interface ConOpportunityDTO {
  id: number;
  state: ConState;
  job: ConJob;
  marketerNote: string;
  assignedBy: { memberId: number; name: string };
  assignedAt: string;
  priority: Priority;
  dueOn: string | null;
  infoRequest: string;
  infoAnswer: string;
  appliedAt: string | null;
  linkedApplicationId: number | null;
  allowedActions: ConAction[];
  version: number;
  /** Not in the contract's DTO: shown when the API provides it (doc 54 s5), otherwise the section is simply absent. */
  timeline: ConTimelineEntry[];
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown, d = ""): string => (typeof x === "string" ? x : d);
const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
const orNull = (x: unknown): string | null => (typeof x === "string" && x ? x : null);
const numOrNull = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

function parseJob(x: unknown): ConJob {
  const j = isObj(x) ? x : {};
  const mode = str(j.workMode).toUpperCase();
  return {
    id: num(j.id),
    title: str(j.title),
    company: str(j.company),
    location: str(j.location),
    workMode: (WORK_MODES as readonly string[]).includes(mode) ? (mode as WorkMode) : null,
    employmentType: str(j.employmentType),
    payLabel: str(j.payLabel),
    jobUrl: str(j.jobUrl),
    atsPlatform: str(j.atsPlatform),
    externalJobId: str(j.externalJobId),
    postedOn: orNull(j.postedOn),
    skills: Array.isArray(j.skills) ? j.skills.filter((s): s is string => typeof s === "string" && s !== "") : [],
    detailLevel: str(j.detailLevel).toUpperCase() === "FULL" ? "FULL" : "MINIMAL", // fail closed: anything else is the smaller level
  };
}

/** Lenient: unknown states fall back to ASSIGNED, unknown actions are dropped (a button the page cannot explain is never drawn). A non-object (or a row without an id) is null. */
export function parseOpportunity(raw: unknown): ConOpportunityDTO | null {
  if (!isObj(raw)) return null;
  const id = numOrNull(raw.id);
  if (id === null) return null;
  const state = (STATES as readonly string[]).includes(str(raw.state)) ? (str(raw.state) as ConState) : "ASSIGNED";
  const by = isObj(raw.assignedBy) ? raw.assignedBy : {};
  const priority = (PRIORITIES as readonly string[]).includes(str(raw.priority)) ? (str(raw.priority) as Priority) : "MEDIUM";
  return {
    id,
    state,
    job: parseJob(raw.job),
    marketerNote: str(raw.marketerNote),
    assignedBy: { memberId: num(by.memberId), name: str(by.name) },
    assignedAt: str(raw.assignedAt),
    priority,
    dueOn: orNull(raw.dueOn),
    infoRequest: str(raw.infoRequest),
    infoAnswer: str(raw.infoAnswer),
    appliedAt: orNull(raw.appliedAt),
    linkedApplicationId: numOrNull(raw.linkedApplicationId),
    allowedActions: Array.isArray(raw.allowedActions) ? raw.allowedActions.filter((a): a is ConAction => (ACTIONS as readonly string[]).includes(a as string)) : [],
    version: num(raw.version),
    timeline: Array.isArray(raw.timeline)
      ? raw.timeline
          .filter(isObj)
          .map((t, i) => ({ id: str(t.id, String(i)), at: str(t.at), text: str(t.text) || str(t.kind), actor: str(t.actor) }))
          .filter((t) => t.text !== "")
      : [],
  };
}

export interface ConList { items: ConOpportunityDTO[]; total: number }
export function parseList(raw: unknown): ConList | null {
  if (!isObj(raw) || !Array.isArray(raw.items)) return null;
  const items = raw.items.map(parseOpportunity).filter((o): o is ConOpportunityDTO => o !== null);
  return { items, total: num(raw.total, items.length) };
}

/** Tab counts over the loaded rows. `ALL` counts everything. */
export function countByState(items: readonly ConOpportunityDTO[]): Record<ConState | "ALL", number> {
  const out = { ALL: items.length, ASSIGNED: 0, VIEWED: 0, INTERESTED: 0, NEEDS_INFO: 0, APPLIED: 0, DECLINED: 0, CLOSED: 0 } as Record<ConState | "ALL", number>;
  for (const o of items) out[o.state] += 1;
  return out;
}

/** The posting URL as an `href` for a new tab: http(s) only (a `javascript:` URL from a bad row is never linked). */
export function safePostingUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The ATS / board names `SourceLogo` has art for; anything else gets the name as text only. */
const LOGO_SOURCES: Record<string, string> = { linkedin: "LinkedIn", indeed: "Indeed", dice: "Dice", greenhouse: "Greenhouse", lever: "Lever", workday: "Workday", ashby: "Ashby", ziprecruiter: "ZipRecruiter", glassdoor: "Glassdoor" };
export function sourceName(atsPlatform: string): { label: string; known: boolean } {
  const key = atsPlatform.trim().toLowerCase();
  if (!key) return { label: "", known: false };
  const known = LOGO_SOURCES[key];
  return known ? { label: known, known: true } : { label: atsPlatform.trim(), known: false };
}

// ---- reads ---------------------------------------------------------------------------------------------------------------------------

export type ListFetch = { kind: "OK"; list: ConList } | { kind: "DENIED" } | { kind: "FAILED" };
export type OneFetch = { kind: "OK"; item: ConOpportunityDTO } | { kind: "NOT_FOUND" } | { kind: "FAILED" };

/**
 * The BROWSER-facing path. The BFF folder is `consultant`, not `con`: `con` is a reserved device name on Windows, where git cannot check out
 * a folder with that name. The BFF forwards to the API's `/api/orgs/{orgId}/con/opportunities` (doc 60 s4).
 */
const base = (orgId: number | string) => `/api/orgs/${orgId}/consultant/opportunities`;

/** The list in one call (the tabs and their counts are drawn from it; the API owns the scope and answers 404 for anyone who is not a consultant). */
export async function fetchList(orgId: number | string, opts: { size?: number; page?: number; state?: ConState; signal?: AbortSignal } = {}): Promise<ListFetch> {
  const q = new URLSearchParams({ page: String(opts.page ?? 0), size: String(opts.size ?? 100) });
  if (opts.state) q.set("state", opts.state);
  try {
    const res = await fetch(`${base(orgId)}?${q}`, { headers: { accept: "application/json" }, cache: "no-store", signal: opts.signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const list = parseList(await res.json().catch(() => null));
    return list ? { kind: "OK", list } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export async function fetchOne(orgId: number | string, id: number, signal?: AbortSignal): Promise<OneFetch> {
  try {
    const res = await fetch(`${base(orgId)}/${id}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "NOT_FOUND" };
    if (!res.ok) return { kind: "FAILED" };
    const item = parseOpportunity(await res.json().catch(() => null));
    return item ? { kind: "OK", item } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

/** The consultant's own tracked applications, for the "Link my application" picker. Lenient; empty on any failure (the picker says so). */
export interface AppOption { id: number; label: string }
export async function fetchMyApplications(): Promise<AppOption[]> {
  try {
    const res = await fetch("/api/applications?page=0&size=50", { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return [];
    const data: unknown = await res.json().catch(() => null);
    const rows = Array.isArray(data) ? data : isObj(data) && Array.isArray(data.items) ? data.items : [];
    return rows
      .filter(isObj)
      .map((r) => ({ id: num(r.id), label: [str(r.roleTitle), str(r.company)].filter(Boolean).join(" - ") || `Application ${num(r.id)}` }))
      .filter((o) => o.id > 0);
  } catch {
    return [];
  }
}

// ---- writes --------------------------------------------------------------------------------------------------------------------------

/**
 * What a write answers. `item` is the server's updated row when it sent one (the page then keeps IT, not its own guess).
 * VERSION_CONFLICT (409): someone changed the row, so the page asks the consultant to reload. SENSITIVE (422): the free text was refused.
 */
export type ActionResult =
  | { kind: "OK"; item: ConOpportunityDTO | null }
  | { kind: "VERSION_CONFLICT" }
  | { kind: "NOT_FOUND" }
  | { kind: "SENSITIVE"; error: string }
  | { kind: "INVALID"; error: string }
  | { kind: "FAILED"; error: string };

export interface ActionOpts { version?: number; idempotencyKey?: string }

const newKey = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export type ActionPath = "viewed" | "interest" | "decline" | "request-info" | "applied" | "link" | "unlink";

async function send(orgId: number | string, id: number, path: ActionPath, body: Record<string, unknown>, opts: ActionOpts): Promise<ActionResult> {
  const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json", "idempotency-key": opts.idempotencyKey ?? newKey() };
  if (opts.version !== undefined) headers["if-match"] = String(opts.version);
  try {
    const res = await fetch(`${base(orgId)}/${id}/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    const data: unknown = await res.json().catch(() => null);
    const d = isObj(data) ? data : {};
    if (res.ok) return { kind: "OK", item: parseOpportunity(d) };
    const error = str(d.error, "That didn't work. Nothing was changed.");
    if (res.status === 404) return { kind: "NOT_FOUND" };
    if (res.status === 409) return str(d.code) === "VERSION_CONFLICT" ? { kind: "VERSION_CONFLICT" } : { kind: "INVALID", error };
    if (res.status === 422) return str(d.code) === "SENSITIVE_CONTENT" ? { kind: "SENSITIVE", error } : { kind: "INVALID", error };
    if (res.status === 400) return { kind: "INVALID", error };
    return { kind: "FAILED", error };
  } catch {
    return { kind: "FAILED", error: "Couldn't reach the server. Nothing was changed." };
  }
}

type Id = number | string;
export const viewed = (orgId: Id, id: number, opts: ActionOpts = {}) => send(orgId, id, "viewed", {}, opts);
export const interest = (orgId: Id, id: number, opts: ActionOpts = {}) => send(orgId, id, "interest", {}, opts);
export const decline = (orgId: Id, id: number, reason: DeclineReason, note: string | undefined, opts: ActionOpts = {}) =>
  send(orgId, id, "decline", note && note.trim() ? { reason, note: note.trim() } : { reason }, opts);
export const requestInfo = (orgId: Id, id: number, question: string, opts: ActionOpts = {}) => send(orgId, id, "request-info", { question: question.trim() }, opts);
export const applied = (orgId: Id, id: number, applicationId?: number, opts: ActionOpts = {}) => send(orgId, id, "applied", applicationId ? { applicationId } : {}, opts);
export const link = (orgId: Id, id: number, applicationId: number, opts: ActionOpts = {}) => send(orgId, id, "link", { applicationId }, opts);
export const unlink = (orgId: Id, id: number, opts: ActionOpts = {}) => send(orgId, id, "unlink", {}, opts);

// ---- optimistic prediction -----------------------------------------------------------------------------------------------------------

/** What the API will allow next from `state` (contract s3). Only used to draw the optimistic row; the server's answer replaces it. */
export function predictAllowed(state: ConState, linked: boolean): ConAction[] {
  const open: ConAction[] = linked ? [] : ["LINK"];
  switch (state) {
    case "ASSIGNED": return ["VIEWED", "INTEREST", "DECLINE", "REQUEST_INFO", "APPLIED", ...open];
    case "VIEWED": return ["INTEREST", "DECLINE", "REQUEST_INFO", "APPLIED", ...open];
    case "INTERESTED": return ["DECLINE", "REQUEST_INFO", "APPLIED", ...open];
    case "NEEDS_INFO": return ["INTEREST", "DECLINE", "APPLIED", ...open];
    case "DECLINED": return ["INTEREST"];
    case "APPLIED": return linked ? ["UNLINK"] : ["LINK"];
    default: return [];
  }
}

export type Optimistic =
  | { action: "VIEWED" } | { action: "INTEREST" } | { action: "DECLINE" } | { action: "APPLIED"; applicationId?: number }
  | { action: "REQUEST_INFO"; question: string } | { action: "LINK"; applicationId: number } | { action: "UNLINK" };

/** The row as the consultant expects it to look after `change`; pure. */
export function applyOptimistic(o: ConOpportunityDTO, change: Optimistic, now: Date = new Date()): ConOpportunityDTO {
  let next: ConOpportunityDTO = o;
  switch (change.action) {
    case "VIEWED": next = o.state === "ASSIGNED" ? { ...o, state: "VIEWED" } : o; break;
    case "INTEREST": next = { ...o, state: "INTERESTED" }; break;
    case "DECLINE": next = { ...o, state: "DECLINED" }; break;
    case "REQUEST_INFO": next = { ...o, state: "NEEDS_INFO", infoRequest: change.question.trim(), infoAnswer: "" }; break;
    case "APPLIED": next = { ...o, state: "APPLIED", appliedAt: o.appliedAt ?? now.toISOString(), linkedApplicationId: change.applicationId ?? o.linkedApplicationId }; break;
    case "LINK": next = { ...o, state: "APPLIED", appliedAt: o.appliedAt ?? now.toISOString(), linkedApplicationId: change.applicationId }; break;
    case "UNLINK": next = { ...o, linkedApplicationId: null }; break;
  }
  return { ...next, allowedActions: predictAllowed(next.state, next.linkedApplicationId !== null) };
}
