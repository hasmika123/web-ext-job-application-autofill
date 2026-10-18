/**
 * Prepare selected openings, the web half (docs/enterprise-v2/63-prepare-batch.md). The consultant ticks assigned openings; the API plans a batch and
 * charges the admin-set caps; this page hands the plan to the Kiwiply browser extension, which opens each job in a tab of the consultant's own browser and
 * fills it from their profile. Nothing is submitted for anyone: the consultant reviews, completes what is missing and presses the final button on the real
 * site. Pure helpers, wire parsers, the BFF calls and the page-to-extension message live here; nothing touches React.
 */
import type { OppRow } from "./opportunities";

/* ── the contract ─────────────────────────────────────────────────────────────────────── */

export const PREPARE_BATCH_MESSAGE = "KIWIPLY_PREPARE_BATCH";
export const PREPARE_ACK_MESSAGE = "KIWIPLY_PREPARE_ACK";
export const PREPARE_VERSION = 1;
/** How long the page waits for the extension's acknowledgement before it shows the "Extension not detected" guidance. */
export const ACK_TIMEOUT_MS = 3000;
/** How often the progress panel re-reads the session while something is still moving. */
export const POLL_MS = 3000;

/** Shown in the confirm dialog. The wording is part of the contract: it says plainly that nothing is submitted for the consultant. */
export const CONFIRM_TEXT =
  "Kiwiply opens each job in a new tab and fills it from your profile. Nothing is submitted for you: you review, fix anything missing and press Submit yourself.";

export const PHONE_NOTE = "Preparing several openings at once works on a desktop browser with the Kiwiply extension. On this device, open the links one by one.";

export interface PrepareStatus {
  enabled: boolean;
  maxBatch: number;
  remainingToday: number;
  remainingMonth: number;
  dailyCap: number;
  monthlyCap: number;
  /** Why it is off for this consultant: PLATFORM_OFF (the feature does not exist yet: show nothing), ORG_OFF, NO_LICENSE; null when on. */
  reason: string | null;
}

/** The calm one-liners for a feature that is off for this consultant. PLATFORM_OFF has none: the feature does not exist for anyone yet. */
export const NOTE_ORG_OFF = "Your organization hasn't turned on preparing applications.";
export const NOTE_NO_LICENSE = "Your organization's licence doesn't include preparing applications.";
export function reasonNote(reason: string | null): string | null {
  if (reason === "ORG_OFF") return NOTE_ORG_OFF;
  if (reason === "NO_LICENSE") return NOTE_NO_LICENSE;
  return null;
}

export interface PrepareJob {
  matchId: number;
  url: string;
  title: string;
  company: string | null;
}

export interface PrepareSkipped {
  matchId: number;
  reason: string;
}

export interface PrepareCreated {
  sessionId: number | null;
  expiresAt: string | null;
  jobs: PrepareJob[];
  skipped: PrepareSkipped[];
  remainingToday: number;
  remainingMonth: number;
}

export type ItemState = "WAITING" | "OPENED" | "FILLED" | "NEEDS_INPUT" | "SUBMITTED" | "CLOSED" | "FAILED";

export interface PrepareItem {
  matchId: number;
  url: string;
  title: string;
  company: string | null;
  state: ItemState;
  detail: string | null;
  applied: boolean;
  updatedAt: string | null;
}

export interface PrepareSession {
  sessionId: number;
  expiresAt: string | null;
  items: PrepareItem[];
}

/** The state labels of the progress panel. FAILED is the extension saying it could not open or read the page. */
export const ITEM_LABEL: Record<ItemState, { label: string; tone: "slate" | "blue" | "violet" | "amber" | "green" | "red" }> = {
  WAITING: { label: "Waiting", tone: "slate" },
  OPENED: { label: "Opened", tone: "blue" },
  FILLED: { label: "Filled", tone: "violet" },
  NEEDS_INPUT: { label: "Needs your input", tone: "amber" },
  SUBMITTED: { label: "Submitted", tone: "green" },
  CLOSED: { label: "Closed", tone: "slate" },
  FAILED: { label: "Could not open", tone: "red" },
};

const STATES: readonly string[] = Object.keys(ITEM_LABEL);

/** Nothing more will change for these, so the progress panel stops polling once every item is in one. */
export const isFinal = (s: ItemState): boolean => s === "SUBMITTED" || s === "CLOSED" || s === "FAILED";
export const allFinal = (items: readonly PrepareItem[]): boolean => items.length > 0 && items.every((i) => isFinal(i.state));

/* ── parsers (tolerant: a body that is not the contract is null, never guessed) ───────── */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function parseStatus(b: unknown): PrepareStatus | null {
  if (!isObj(b) || typeof b.enabled !== "boolean") return null;
  return { enabled: b.enabled, maxBatch: num(b.maxBatch), remainingToday: num(b.remainingToday), remainingMonth: num(b.remainingMonth), dailyCap: num(b.dailyCap), monthlyCap: num(b.monthlyCap), reason: str(b.reason) };
}

function parseJob(o: unknown): PrepareJob | null {
  if (!isObj(o) || typeof o.matchId !== "number" || typeof o.url !== "string") return null;
  return { matchId: o.matchId, url: o.url, title: typeof o.title === "string" ? o.title : "", company: str(o.company) };
}

export function parseCreated(b: unknown): PrepareCreated | null {
  if (!isObj(b) || !Array.isArray(b.jobs)) return null;
  return {
    sessionId: typeof b.sessionId === "number" ? b.sessionId : null,
    expiresAt: str(b.expiresAt),
    jobs: b.jobs.map(parseJob).filter((j): j is PrepareJob => j !== null),
    skipped: Array.isArray(b.skipped) ? b.skipped.flatMap((s) => (isObj(s) && typeof s.matchId === "number" ? [{ matchId: s.matchId, reason: typeof s.reason === "string" ? s.reason : "" }] : [])) : [],
    remainingToday: num(b.remainingToday),
    remainingMonth: num(b.remainingMonth),
  };
}

export function parseSession(b: unknown): PrepareSession | null {
  if (!isObj(b) || typeof b.sessionId !== "number" || !Array.isArray(b.items)) return null;
  const items = b.items.flatMap((o): PrepareItem[] => {
    if (!isObj(o) || typeof o.matchId !== "number" || typeof o.url !== "string") return [];
    const state = (typeof o.state === "string" && STATES.includes(o.state) ? o.state : "WAITING") as ItemState;
    return [{ matchId: o.matchId, url: o.url, title: typeof o.title === "string" ? o.title : "", company: str(o.company), state, detail: str(o.detail), applied: o.applied === true, updatedAt: str(o.updatedAt) }];
  });
  return { sessionId: b.sessionId, expiresAt: str(b.expiresAt), items };
}

/* ── which rows can be ticked, and why not ────────────────────────────────────────────── */

/**
 * Why this opening cannot be prepared, in the consultant's words, or null when it can. The server decides again (it is the authority); this only saves a
 * round trip and tells the consultant why a box is greyed out. "Job still open" is read from the actions the API offers: they all need an open job.
 */
export function prepareBlock(r: Pick<OppRow, "status" | "sourceUrl" | "allowedActions">): string | null {
  if (r.status === "DECLINED") return "Declined. Reopen it first to prepare it.";
  if (r.status === "APPLIED") return "You already applied.";
  if (r.status === "CLOSED") return "This opening is closed.";
  if (r.status === "AWAITING_RESPONSE") return "Waiting for your marketer's answer.";
  if (!r.sourceUrl) return "Your marketer hasn't added the link yet.";
  if (!r.allowedActions.includes("APPLIED")) return "This job is no longer open.";
  return null;
}

/** The label of a skipped reason the server sent. */
export function skippedText(reason: string): string {
  switch (reason) {
    case "NO_URL":
      return "no job link yet";
    case "JOB_NOT_OPEN":
      return "the job is no longer open";
    default:
      return "not available to prepare";
  }
}

/** "Prepare selected (3)". */
export const prepareLabel = (n: number): string => `Prepare selected (${n})`;

/** Remaining limits as one line, or null when the API sent none. */
export function capsText(s: Pick<PrepareStatus, "remainingToday" | "remainingMonth" | "maxBatch">): string {
  return `Today ${s.remainingToday} left · This month ${s.remainingMonth} left · Up to ${s.maxBatch} at a time`;
}

/* ── the page-to-extension message ────────────────────────────────────────────────────── */

/** The API origin the extension talks to; a hint only, the extension trusts its own configured base (empty means "use yours"). Tenant code never hard-codes a platform address. */
export function prepareApiBase(): string {
  return process.env.NEXT_PUBLIC_KIWIPLY_API_URL || "";
}

export interface PrepareMessage {
  type: typeof PREPARE_BATCH_MESSAGE;
  version: typeof PREPARE_VERSION;
  sessionId: number;
  apiBase: string;
  orgId: number;
  jobs: PrepareJob[];
}

export function buildPrepareMessage(sessionId: number, orgId: number, jobs: PrepareJob[], apiBase: string = prepareApiBase()): PrepareMessage {
  return {
    type: PREPARE_BATCH_MESSAGE,
    version: PREPARE_VERSION,
    sessionId,
    apiBase,
    orgId,
    jobs: jobs.map((j) => ({ matchId: j.matchId, url: j.url, title: j.title, company: j.company })),
  };
}

/**
 * Hands the batch to the extension and waits for its acknowledgement. An enterprise account lives on its tenant host, which the extension cannot list in
 * `externally_connectable` (that path serves the platform hosts only), so the page posts to ITSELF and the extension's tenant-host content bridge, which only
 * accepts a message from this exact document, replies in kind (doc 63 section 3). Resolves true on an acknowledgement for this session (a missing `ok` counts
 * as yes, `ok:false` as no) and false after `timeoutMs`. Never throws.
 */
export function sendPrepareBatch(msg: PrepareMessage, timeoutMs: number = ACK_TIMEOUT_MS): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(ok);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      const d = e.data as { type?: unknown; sessionId?: unknown; ok?: unknown } | null;
      if (!d || d.type !== PREPARE_ACK_MESSAGE) return;
      if (d.sessionId !== undefined && d.sessionId !== msg.sessionId) return;
      finish(d.ok !== false);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      window.addEventListener("message", onMessage);
      window.postMessage(msg, window.location.origin);
    } catch {
      finish(false);
    }
  });
}

/* ── BFF calls ────────────────────────────────────────────────────────────────────────── */

const base = (orgId: number | string) => `/api/orgs/${orgId}/consultant/prepare`;

export type PrepareResult<T> = { kind: "OK"; value: T } | { kind: "CAP"; message: string; remainingToday: number; remainingMonth: number } | { kind: "DENIED" } | { kind: "FAILED"; message?: string };

async function errorOf(res: Response): Promise<string | undefined> {
  const j = (await res.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
  return j && typeof j.error === "string" ? j.error : j && typeof j.message === "string" ? j.message : undefined;
}

export async function fetchPrepareStatus(orgId: number | string, signal?: AbortSignal): Promise<PrepareStatus | null> {
  try {
    const res = await fetch(`${base(orgId)}/status`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (!res.ok) return null;
    return parseStatus(await res.json().catch(() => null));
  } catch {
    return null;
  }
}

export async function createPrepareSession(orgId: number | string, matchIds: number[]): Promise<PrepareResult<PrepareCreated>> {
  try {
    const res = await fetch(base(orgId), { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ matchIds }), cache: "no-store" });
    if (res.status === 404) return { kind: "DENIED" };
    if (res.status === 409) {
      const j = (await res.json().catch(() => null)) as { code?: unknown; error?: unknown; remainingToday?: unknown; remainingMonth?: unknown } | null;
      if (j && j.code === "PREPARE_CAP_REACHED") {
        return { kind: "CAP", message: typeof j.error === "string" ? j.error : "That would go over your preparation limit.", remainingToday: num(j.remainingToday), remainingMonth: num(j.remainingMonth) };
      }
      return { kind: "FAILED", message: typeof j?.error === "string" ? j.error : undefined };
    }
    if (!res.ok) return { kind: "FAILED", message: await errorOf(res) };
    const value = parseCreated(await res.json().catch(() => null));
    return value ? { kind: "OK", value } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export async function fetchPrepareSession(orgId: number | string, sessionId: number, signal?: AbortSignal): Promise<PrepareSession | null> {
  try {
    const res = await fetch(`${base(orgId)}/${sessionId}`, { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (!res.ok) return null;
    return parseSession(await res.json().catch(() => null));
  } catch {
    return null;
  }
}
