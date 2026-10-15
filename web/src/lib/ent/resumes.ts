/**
 * The Resumes board, pure part: the types of the resumes API (ResumeBoardDTO), the URL state (tab, filters, sort, page, open resume: every part
 * is shareable), the typed client that talks to the BFF under `/api/orgs/{orgId}/resumes`, and the small helpers the page needs (tile deltas, labels,
 * the Undo plans). Nothing here touches React.
 *
 * The page never invents a figure: a tile whose `previous` is null shows no delta; a drawer field the API does not return is not drawn (there is
 * no phone, address or date of birth anywhere in a resume record).
 */

import { formatDate, newKey, relativeTime, tileDelta, type ApiResult, type Tile as BaseTile, type TileDelta } from "@/lib/ent/members";

export { formatDate, relativeTime, newKey };
export type { ApiResult, TileDelta };

/* ── contract types (mirror ResumeBoardDTO) ─────────────────────────────────────── */

export type Visibility = "INTERNAL" | "PUBLIC" | "PRIVATE";
export type Approval = "APPROVED" | "PENDING" | "REJECTED";

export interface PersonRef {
  memberId: number;
  name: string;
}

export interface ConsultantRef {
  id: number;
  name: string;
  initials: string;
  email: string | null;
  jobTitle: string | null;
  location: string | null;
  workMode: string | null;
  availability: string | null;
  status: string | null;
}

export interface ResumeRow {
  id: number;
  consultant: ConsultantRef;
  name: string;
  fileName: string | null;
  targetRole: string | null;
  version: number;
  primary: boolean;
  visibility: Visibility;
  approvalStatus: Approval;
  createdAt: string;
  updatedAt: string;
  owner: PersonRef | null;
  fileSizeKb: number | null;
  /** The Resume Builder document behind the row (a resume made in the builder); absent or null for a record that has none. */
  resumeId?: number | null;
}

export interface ResumePage {
  items: ResumeRow[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
}

export interface ResumeTile extends BaseTile {
  series: number[];
}

export interface ResumeCounts {
  asOf: string;
  scope: string;
  total: ResumeTile;
  primary: ResumeTile;
  needsApproval: ResumeTile;
  updatedThisWeek: ResumeTile;
}

export interface Experience {
  title: string;
  employer: string;
  startYear: number;
  endYear: number | null;
}

export interface Preview {
  headline: string | null;
  summary: string | null;
  skills: string[];
  experience: Experience[];
}

export interface Actions {
  setPrimary: boolean;
  setVisibility: boolean;
  decide: boolean;
  export: boolean;
}

export interface ResumeDetail {
  row: ResumeRow;
  preview: Preview;
  actions: Actions;
}

export interface Option {
  value: string;
  label: string;
}

export interface FilterOptions {
  departments: Option[];
  owners: Option[];
}

export interface ConsultantOption {
  id: number;
  name: string;
  email: string | null;
}

export interface BulkRowResult {
  id: number;
  outcome: "APPLIED" | "SKIPPED";
  reason: string | null;
  previous: string | null;
}

export interface BulkResult {
  applied: number;
  skipped: number;
  results: BulkRowResult[];
}

export interface ExperienceInput {
  title: string;
  employer: string;
  startYear: number | null;
  endYear: number | null;
}

export interface CreateBody {
  consultantId: number;
  name: string;
  fileName?: string;
  targetRole?: string;
  headline?: string;
  summary?: string;
  visibility?: Visibility;
  experience?: ExperienceInput[];
}

/* ── labels ─────────────────────────────────────────────────────────────────────── */

export const VISIBILITY_OPTIONS: { value: Visibility; label: string; long: string }[] = [
  { value: "INTERNAL", label: "Internal", long: "Internal (Organization Only)" },
  { value: "PUBLIC", label: "Public", long: "Public (Shareable with clients)" },
  { value: "PRIVATE", label: "Private", long: "Private (Owner and marketer only)" },
];

export const APPROVAL_LABEL: Record<string, string> = { APPROVED: "Approved", PENDING: "Pending", REJECTED: "Rejected" };

export const visibilityLabel = (v: string): string => VISIBILITY_OPTIONS.find((o) => o.value === v)?.label ?? v;
export const visibilityLong = (v: string): string => VISIBILITY_OPTIONS.find((o) => o.value === v)?.long ?? v;
export const approvalLabel = (a: string): string => APPROVAL_LABEL[a] ?? a;

export function fileSizeText(kb: number | null | undefined): string {
  if (kb === null || kb === undefined) return "";
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
}

export function yearsText(e: Experience): string {
  return `${e.startYear} - ${e.endYear === null ? "Present" : e.endYear}`;
}

/** "v3 (Latest)" in the drawer: this record holds only the current version, so it is always the latest. */
export const versionText = (v: number): string => `v${v}`;

/* ── tiles ──────────────────────────────────────────────────────────────────────── */

export type TileKey = "total" | "primary" | "needsApproval" | "updatedThisWeek";

/** The delta line of a tile, or null when the API has no history for it. */
export const resumeTileDelta = (t: ResumeTile | null | undefined): TileDelta | null => tileDelta(t ?? null);

/* ── URL state ──────────────────────────────────────────────────────────────────── */

export type Tab = "all" | "pending" | "recent";
export type SortKey = "consultant" | "name" | "role" | "version" | "modified" | "created" | "status" | "size";
export type SortDir = "asc" | "desc";
export type View = "list" | "grid";

export const TABS: readonly Tab[] = ["all", "pending", "recent"];
export const SORT_KEYS: readonly SortKey[] = ["consultant", "name", "role", "version", "modified", "created", "status", "size"];
export const PAGE_SIZES = [10, 25, 50] as const;
export const MIN_SEARCH = 2;

export interface ResumeUrlState {
  tab: Tab;
  q: string;
  department: string;
  visibility: string;
  status: string;
  primary: "" | "yes" | "no";
  owner: string;
  updated: string;
  sort: { key: SortKey; dir: SortDir };
  /** 0-based; the URL carries it 1-based. */
  page: number;
  size: number;
  view: View;
  /** The open resume (drawer), or null. */
  open: number | null;
}

export const DEFAULT_STATE: ResumeUrlState = {
  tab: "all",
  q: "",
  department: "",
  visibility: "",
  status: "",
  primary: "",
  owner: "",
  updated: "",
  sort: { key: "modified", dir: "desc" },
  page: 0,
  size: 10,
  view: "list",
  open: null,
};

const oneOf = <T extends string>(v: string | null | undefined, allowed: readonly T[]): T | null => (v && (allowed as readonly string[]).includes(v) ? (v as T) : null);
const digits = (v: string | null | undefined): string => (v && /^\d{1,18}$/.test(v) ? v : "");

/** Reads the page state from a URL's query; anything unknown or malformed falls back to the default (the URL is never trusted). */
export function parseState(sp: { get(name: string): string | null }): ResumeUrlState {
  const sortRaw = (sp.get("sort") ?? "").split(",");
  const sortKey = oneOf(sortRaw[0], SORT_KEYS);
  const sortDir = oneOf(sortRaw[1], ["asc", "desc"] as const);
  const size = Number(sp.get("size"));
  const page = Number(sp.get("page"));
  const open = digits(sp.get("open"));
  const q = (sp.get("q") ?? "").slice(0, 80);
  return {
    tab: oneOf(sp.get("tab"), TABS) ?? "all",
    q,
    department: digits(sp.get("dept")),
    visibility: oneOf(sp.get("vis"), ["INTERNAL", "PUBLIC", "PRIVATE"] as const) ?? "",
    status: oneOf(sp.get("status"), ["APPROVED", "PENDING", "REJECTED"] as const) ?? "",
    primary: oneOf(sp.get("primary"), ["yes", "no"] as const) ?? "",
    owner: digits(sp.get("owner")),
    updated: oneOf(sp.get("updated"), ["7", "30", "90"] as const) ?? "",
    sort: sortKey ? { key: sortKey, dir: sortDir ?? DEFAULT_STATE.sort.dir } : DEFAULT_STATE.sort,
    page: Number.isInteger(page) && page >= 1 && page <= 100000 ? page - 1 : 0,
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_STATE.size,
    view: sp.get("view") === "grid" ? "grid" : "list",
    open: open ? Number(open) : null,
  };
}

/** The query string of a state, leaving every default out so a clean page has a clean URL. */
export function stateToSearch(s: ResumeUrlState): string {
  const p = new URLSearchParams();
  if (s.tab !== "all") p.set("tab", s.tab);
  if (s.q.trim()) p.set("q", s.q.trim());
  if (s.department) p.set("dept", s.department);
  if (s.visibility) p.set("vis", s.visibility);
  if (s.status) p.set("status", s.status);
  if (s.primary) p.set("primary", s.primary);
  if (s.owner) p.set("owner", s.owner);
  if (s.updated) p.set("updated", s.updated);
  if (s.sort.key !== DEFAULT_STATE.sort.key || s.sort.dir !== DEFAULT_STATE.sort.dir) p.set("sort", `${s.sort.key},${s.sort.dir}`);
  if (s.page > 0) p.set("page", String(s.page + 1));
  if (s.size !== DEFAULT_STATE.size) p.set("size", String(s.size));
  if (s.view !== "list") p.set("view", s.view);
  if (s.open !== null) p.set("open", String(s.open));
  const out = p.toString();
  return out ? `?${out}` : "";
}

/** The API's list query for a state. A search shorter than the minimum is not sent. */
export function listParams(s: ResumeUrlState): URLSearchParams {
  const p = new URLSearchParams();
  p.set("tab", s.tab);
  if (s.q.trim().length >= MIN_SEARCH) p.set("q", s.q.trim());
  if (s.department) p.set("departmentId", s.department);
  if (s.visibility) p.set("visibility", s.visibility);
  if (s.status) p.set("status", s.status);
  if (s.primary) p.set("primary", s.primary === "yes" ? "true" : "false");
  if (s.owner) p.set("ownerId", s.owner);
  if (s.updated) p.set("updated", s.updated);
  p.set("sort", `${s.sort.key},${s.sort.dir}`);
  p.set("page", String(s.page));
  p.set("size", String(s.size));
  return p;
}

/** True while a search or any filter is applied (the tab and sort are not filters). */
export function filtersActive(s: ResumeUrlState): boolean {
  return s.q.trim().length >= MIN_SEARCH || !!(s.department || s.visibility || s.status || s.primary || s.owner || s.updated);
}

/** Clicking a header: the same column flips direction; a new column starts ascending (dates and counts start with the newest). */
export function nextSort(cur: { key: SortKey; dir: SortDir }, key: SortKey): { key: SortKey; dir: SortDir } {
  if (cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "modified" || key === "created" || key === "version" || key === "size" ? "desc" : "asc" };
}

export const pageCount = (total: number, size: number): number => Math.max(1, Math.ceil(total / Math.max(1, size)));

/** "1-10 of 247 resumes". */
export function showingText(total: number, page: number, size: number, shown: number): string {
  if (total === 0 || shown === 0) return "No resumes";
  return `${page * size + 1}-${page * size + shown} of ${total} ${total === 1 ? "resume" : "resumes"}`;
}

/* ── errors ─────────────────────────────────────────────────────────────────────── */

const CODE_TEXT: Record<string, string> = {
  NOT_APPROVED: "Only an approved resume can be the primary one. Approve it first.",
  NOT_PENDING: "This resume has already been decided.",
  SELF_DECISION: "Someone other than the person who prepared this resume has to approve it.",
  SENSITIVE_CONTENT: "That looks like sensitive personal data (an SSN, bank, passport or date of birth). We never store it, so please remove it.",
  IDEMPOTENCY_IN_PROGRESS: "That is already being saved. Give it a second.",
};

/** A friendly sentence for a failed call. */
export function errorSentence(r: { status: number; code?: string; message: string }): string {
  if (r.status === 0) return r.message;
  if (r.status === 404) return "This resume is no longer in your view.";
  return (r.code && CODE_TEXT[r.code]) || r.message;
}

/* ── client ─────────────────────────────────────────────────────────────────────── */

const base = (orgId: number | string) => `/api/orgs/${orgId}/resumes`;

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) } });
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach the server. Check your connection.", extra: {} };
  }
  if (res.status === 204) return { ok: true, data: undefined as T, status: 204 };
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, data: body as T, status: res.status };
  const { error, message, code, ...extra } = body;
  return { ok: false, status: res.status, code: typeof code === "string" ? code : undefined, message: typeof error === "string" ? error : typeof message === "string" ? message : "Something went wrong.", extra };
}

const json = (method: string, body?: unknown, headers?: Record<string, string>): RequestInit => ({
  method,
  headers: { "content-type": "application/json", ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const exportUrl = (orgId: number | string, id: number, format: "txt" | "html"): string => `${base(orgId)}/${id}/export?format=${format}`;

export const resumesApi = {
  list: (orgId: number | string, s: ResumeUrlState) => call<ResumePage>(`${base(orgId)}?${listParams(s)}`, { cache: "no-store" }),
  counts: (orgId: number | string) => call<ResumeCounts>(`${base(orgId)}/counts`, { cache: "no-store" }),
  filters: (orgId: number | string) => call<FilterOptions>(`${base(orgId)}/filters`, { cache: "no-store" }),
  consultants: (orgId: number | string, q = "") => call<ConsultantOption[]>(`${base(orgId)}/consultants${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`, { cache: "no-store" }),
  detail: (orgId: number | string, id: number) => call<ResumeDetail>(`${base(orgId)}/${id}`, { cache: "no-store" }),
  setPrimary: (orgId: number | string, id: number, primary: boolean) => call<{ detail: ResumeDetail; previousPrimaryId: number | null }>(`${base(orgId)}/${id}/primary`, json("PUT", { primary })),
  setVisibility: (orgId: number | string, id: number, visibility: Visibility) => call<{ detail: ResumeDetail; previous: Visibility }>(`${base(orgId)}/${id}/visibility`, json("PUT", { visibility })),
  decide: (orgId: number | string, id: number, decision: "APPROVE" | "REJECT" | "REOPEN", note?: string) =>
    call<{ detail: ResumeDetail; previous: Approval }>(`${base(orgId)}/${id}/decision`, json("POST", { decision, note })),
  create: (orgId: number | string, body: CreateBody, key: string = newKey()) => call<ResumeDetail>(base(orgId), json("POST", body, { "idempotency-key": key })),
  bulk: (orgId: number | string, body: { ids: number[]; action: "VISIBILITY" | "APPROVE" | "REJECT" | "REOPEN"; visibility?: Visibility }, key: string = newKey()) =>
    call<BulkResult>(`${base(orgId)}/bulk`, json("POST", body, { "idempotency-key": key })),
  /** The generated printable page, as text (the Print button puts it in a hidden frame). */
  html: async (orgId: number | string, id: number): Promise<{ ok: true; html: string } | { ok: false; message: string }> => {
    try {
      const res = await fetch(exportUrl(orgId, id, "html"), { cache: "no-store" });
      if (!res.ok) return { ok: false, message: res.status === 404 ? "This resume is no longer in your view." : "We couldn't prepare the print view." };
      return { ok: true, html: await res.text() };
    } catch {
      return { ok: false, message: "We couldn't reach the server. Check your connection." };
    }
  },
};

/* ── bulk Undo ──────────────────────────────────────────────────────────────────── */

export type BulkUndo = { kind: "visibility"; visibility: Visibility; ids: number[] } | { kind: "reopen"; ids: number[] } | { kind: "approval"; ids: number[]; decision: "APPROVE" | "REJECT" };

/** The reverse of a bulk call, from the `previous` values it answered. Rows that were skipped are not touched. */
export function bulkUndoPlans(action: "VISIBILITY" | "APPROVE" | "REJECT" | "REOPEN", results: BulkRowResult[]): BulkUndo[] {
  const applied = results.filter((r) => r.outcome === "APPLIED");
  if (applied.length === 0) return [];
  if (action === "APPROVE" || action === "REJECT") return [{ kind: "reopen", ids: applied.map((r) => r.id) }];
  if (action === "REOPEN") {
    const byPrev = new Map<string, number[]>();
    for (const r of applied) if (r.previous === "APPROVED" || r.previous === "REJECTED") byPrev.set(r.previous, [...(byPrev.get(r.previous) ?? []), r.id]);
    return [...byPrev].map(([prev, ids]) => ({ kind: "approval" as const, ids, decision: prev === "APPROVED" ? ("APPROVE" as const) : ("REJECT" as const) }));
  }
  const byPrev = new Map<string, number[]>();
  for (const r of applied) if (r.previous) byPrev.set(r.previous, [...(byPrev.get(r.previous) ?? []), r.id]);
  return [...byPrev].map(([prev, ids]) => ({ kind: "visibility" as const, visibility: prev as Visibility, ids }));
}

/** One sentence for the toast after a bulk call. */
export function bulkSummary(r: BulkResult, verb: string): { title: string; description?: string; variant: "success" | "error" } {
  if (r.applied === 0) return { title: `Nothing was ${verb}`, description: skipSentence(r), variant: "error" };
  const title = `${r.applied} ${r.applied === 1 ? "resume" : "resumes"} ${verb}`;
  return r.skipped > 0 ? { title, description: skipSentence(r), variant: "success" } : { title, variant: "success" };
}

const SKIP_TEXT: Record<string, string> = {
  NOT_FOUND: "no longer in your view",
  UNCHANGED: "already that way",
  NOT_PENDING: "already decided",
  SELF_DECISION: "prepared by you",
  NOT_APPROVED: "not approved",
};

function skipSentence(r: BulkResult): string {
  const counts = new Map<string, number>();
  for (const x of r.results) if (x.outcome === "SKIPPED") counts.set(x.reason ?? "REFUSED", (counts.get(x.reason ?? "REFUSED") ?? 0) + 1);
  return [...counts].map(([reason, n]) => `${n} ${SKIP_TEXT[reason] ?? reason.toLowerCase().replace(/_/g, " ")}`).join(", ") + ".";
}
