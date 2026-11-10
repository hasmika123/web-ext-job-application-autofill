/**
 * "Needs your review" for the Gmail inbox: the mail that the inbox read but was NOT sure enough to apply by itself (a rejection, a status
 * change, or a mail that could belong to two applications), plus the undo for what it did apply and the "apply rejections automatically"
 * setting. One typed client shared by the personal pages and the consultant workspace: the caller passes the endpoints, so this file never
 * names a product, a host or a page. Nothing here throws; every call answers a small tagged result.
 *
 * What it may hold: a company, a role, two statuses and a short line of evidence. No mail address, no subject, no password.
 */
import { call } from "@/lib/tracker-client";

export type ReviewKind = "STATUS_CHANGE" | "AMBIGUOUS" | "REJECTION";
type Id = number | string;

export interface ReviewCandidate {
  applicationId: Id;
  company: string;
  role: string;
}

export interface ReviewItem {
  id: Id;
  kind: ReviewKind;
  applicationId: Id | null;
  company: string;
  role: string;
  currentStatus: string | null;
  proposedStatus: string | null;
  /** 0-100. Below `SURE_AT` the card says "Not sure". */
  confidence: number;
  evidence: string;
  candidates: ReviewCandidate[];
  createdAt: string | null;
  expiresAt: string | null;
}

export interface ReviewList {
  items: ReviewItem[];
  count: number;
}

/** The confidence below which the card shows the "Not sure" label. */
export const SURE_AT = 80;

/** Every route a surface talks to. The personal pages and each consultant workspace have their own set. */
export interface ReviewEndpoints {
  list: string;
  accept: (id: Id) => string;
  dismiss: (id: Id) => string;
  settings: string;
  undo: (applicationId: Id, eventId: Id) => string;
}

export const PERSONAL_REVIEW: ReviewEndpoints = {
  list: "/api/inbox/review",
  accept: (id) => `/api/inbox/review/${id}/accept`,
  dismiss: (id) => `/api/inbox/review/${id}/dismiss`,
  settings: "/api/inbox/settings",
  undo: (applicationId, eventId) => `/api/applications/${applicationId}/inbox-undo/${eventId}`,
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const idOf = (v: unknown): Id | null => (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v !== "") ? (v as Id) : null;
const KINDS: readonly string[] = ["STATUS_CHANGE", "AMBIGUOUS", "REJECTION"];

function parseCandidate(o: unknown): ReviewCandidate | null {
  if (!isObj(o)) return null;
  const applicationId = idOf(o.applicationId);
  return applicationId === null ? null : { applicationId, company: str(o.company), role: str(o.role) };
}

function parseItem(o: unknown): ReviewItem | null {
  if (!isObj(o)) return null;
  const id = idOf(o.id);
  if (id === null || !KINDS.includes(str(o.kind))) return null;
  return {
    id,
    kind: o.kind as ReviewKind,
    applicationId: idOf(o.applicationId),
    company: str(o.company),
    role: str(o.role),
    currentStatus: strOrNull(o.currentStatus),
    proposedStatus: strOrNull(o.proposedStatus),
    confidence: typeof o.confidence === "number" && Number.isFinite(o.confidence) ? o.confidence : 0,
    evidence: str(o.evidence),
    candidates: Array.isArray(o.candidates) ? o.candidates.map(parseCandidate).filter((c): c is ReviewCandidate => c !== null) : [],
    createdAt: strOrNull(o.createdAt),
    expiresAt: strOrNull(o.expiresAt),
  };
}

/** The list body, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parseReviewList(body: unknown): ReviewList | null {
  if (!isObj(body) || !Array.isArray(body.items)) return null;
  const items = body.items.map(parseItem).filter((i): i is ReviewItem => i !== null);
  return { items, count: typeof body.count === "number" ? body.count : items.length };
}

export type ReviewFetch = { kind: "ok"; data: ReviewList } | { kind: "denied" } | { kind: "failed" };

export async function fetchReview(ep: ReviewEndpoints): Promise<ReviewFetch> {
  const r = await call<unknown>("GET", ep.list);
  if (r.kind === "error") return r.status === 403 || r.status === 404 || r.status === 402 ? { kind: "denied" } : { kind: "failed" };
  const data = parseReviewList(r.data);
  return data ? { kind: "ok", data } : { kind: "failed" };
}

export type ReviewAct = { ok: true; status: string | null } | { ok: false; message: string };

function actMessage(status: number | undefined, fallback: string): string {
  if (status === 409) return "That one was already handled.";
  if (status === 404) return "That one is no longer there.";
  if (status === 401) return "Your session expired. Please sign in again.";
  return fallback;
}

/** Accept a proposed change. `applicationId` is required by the server when the mail could belong to several applications. */
export async function acceptReview(ep: ReviewEndpoints, id: Id, applicationId?: Id): Promise<ReviewAct> {
  const r = await call<unknown>("POST", ep.accept(id), applicationId === undefined ? {} : { applicationId });
  if (r.kind === "error") return { ok: false, message: actMessage(r.status, "That didn't work. Please try again.") };
  const app = isObj(r.data) && isObj(r.data.application) ? r.data.application : null;
  return { ok: true, status: app ? strOrNull(app.status) : null };
}

export async function dismissReview(ep: ReviewEndpoints, id: Id): Promise<ReviewAct> {
  const r = await call<unknown>("POST", ep.dismiss(id), {}, false);
  if (r.kind === "error") return { ok: false, message: actMessage(r.status, "That didn't work. Please try again.") };
  return { ok: true, status: null };
}

export type UndoResult = { ok: true; status: string | null } | { ok: false; expired: boolean; message: string };

export const TOO_LATE = "Too late to undo";

/** Put an application back to where it was before the inbox moved it. After the window the server answers 409 UNDO_EXPIRED. */
export async function undoInboxChange(ep: ReviewEndpoints, applicationId: Id, eventId: Id): Promise<UndoResult> {
  const r = await call<unknown>("POST", ep.undo(applicationId, eventId), {});
  if (r.kind === "ok") {
    const app = isObj(r.data) && isObj(r.data.application) ? r.data.application : null;
    return { ok: true, status: app ? strOrNull(app.status) : null };
  }
  if (r.status === 409 && r.code === "UNDO_EXPIRED") return { ok: false, expired: true, message: TOO_LATE };
  if (r.status === 409) return { ok: false, expired: false, message: "That change was already undone." };
  return { ok: false, expired: false, message: actMessage(r.status, "Couldn't undo that. Please try again.") };
}

export type SettingFetch = { kind: "ok"; applyRejectionsAutomatically: boolean } | { kind: "failed" };

export async function fetchRejectionSetting(ep: ReviewEndpoints): Promise<SettingFetch> {
  const r = await call<unknown>("GET", ep.settings);
  if (r.kind === "error" || !isObj(r.data)) return { kind: "failed" };
  return { kind: "ok", applyRejectionsAutomatically: r.data.applyRejectionsAutomatically === true };
}

export async function saveRejectionSetting(ep: ReviewEndpoints, value: boolean): Promise<SettingFetch> {
  const r = await call<unknown>("PUT", ep.settings, { applyRejectionsAutomatically: value });
  if (r.kind === "error") return { kind: "failed" };
  return { kind: "ok", applyRejectionsAutomatically: isObj(r.data) ? r.data.applyRejectionsAutomatically === true : value };
}

/* ── plain words ─────────────────────────────────────────────────────────────────────── */

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, " ");

export function isSure(i: Pick<ReviewItem, "confidence">): boolean {
  return i.confidence >= SURE_AT;
}

const NUMBER_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];

/** The one sentence a row opens with. `label` turns a status code into the words the surface uses for it. */
export function reviewSentence(i: ReviewItem, label: (status: string) => string = titleCase): string {
  const company = i.company || "A company";
  const role = i.role || "this role";
  if (i.kind === "REJECTION") return `${company} says: not selected for ${role}. Mark as Rejected?`;
  if (i.kind === "AMBIGUOUS") {
    const n = i.candidates.length;
    const count = n >= 1 && n <= 9 ? NUMBER_WORDS[n] : String(n);
    return `${count === "One" ? "One application" : `${count} applications`} could match this email from ${company}: choose one`;
  }
  const to = i.proposedStatus ? label(i.proposedStatus) : "a new stage";
  return `${company} wrote about ${role}. Move it to ${to}?`;
}
