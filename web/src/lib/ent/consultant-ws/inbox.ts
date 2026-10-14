import type { InboxView } from "@/components/settings/InboxConnect";

/**
 * Consultant workspace "Inbox" client logic (docs/enterprise-v2/18-consultant-inbox.md): the wire types of
 * `GET /api/orgs/{orgId}/me-workspace/inbox`, a tolerant parser and the pure helpers the page uses. Nothing here touches React.
 *
 * What the page may know, and what it may never hold:
 *   - it is the consultant's OWN mailbox, read through the consultant's own session; the organization reaches none of these routes;
 *   - the app password is typed into the connect form and sent once; no type in this file has a field for it, and nothing here stores it;
 *   - the routes live under the organization of the host the page was served from (the tenant BFF); the id in the path is never chosen by the user.
 */

export type StageKey = "APPLIED" | "IN_REVIEW" | "INTERVIEW" | "OFFER" | "REJECTED" | "WITHDRAWN" | "SAVED";

export interface InboxSuggestion {
  id: number;
  company: string;
  role: string;
  category: string;
  stage: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  sentAt: string | null;
}

/** One application the mail moved. `source` is always INBOX: it is shown as "from your inbox" on this page and nowhere else. */
export interface InboxUpdate {
  applicationId: number;
  company: string;
  role: string;
  stage: string;
  stageLabel: string;
  reading: string | null;
  at: string | null;
  source: string;
}

export interface ConsultantInboxView {
  /** Whether inbox tracking is included for this consultant right now (their organization's license, or their own Pro plan). */
  entitled: boolean;
  inbox: InboxView;
  suggestions: InboxSuggestion[];
  updates: InboxUpdate[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

const STATUSES: readonly string[] = ["CONNECTED", "NEEDS_RECONNECT", "ERROR", "NO_ENTITLEMENT"];

function parseSuggestion(o: unknown): InboxSuggestion | null {
  if (!isObj(o) || typeof o.id !== "number") return null;
  return {
    id: o.id,
    company: str(o.company),
    role: str(o.role),
    category: str(o.category),
    stage: str(o.stage, "SAVED"),
    subject: str(o.subject),
    fromName: str(o.fromName),
    fromAddress: str(o.fromAddress),
    sentAt: strOrNull(o.sentAt),
  };
}

function parseUpdate(o: unknown): InboxUpdate | null {
  if (!isObj(o) || typeof o.applicationId !== "number") return null;
  return {
    applicationId: o.applicationId,
    company: str(o.company),
    role: str(o.role),
    stage: str(o.stage),
    stageLabel: str(o.stageLabel, str(o.stage)),
    reading: strOrNull(o.reading),
    at: strOrNull(o.at),
    source: str(o.source, "INBOX"),
  };
}

/** The inbox half of the page body as the shape `InboxConnect` takes. The password is never part of it. */
export function parseInbox(o: unknown): InboxView | null {
  if (!isObj(o) || typeof o.connected !== "boolean") return null;
  const status = str(o.status);
  return {
    available: o.available === true,
    connected: o.connected,
    address: strOrNull(o.address),
    status: STATUSES.includes(status) ? (status as InboxView["status"]) : null,
    connectedAt: strOrNull(o.connectedAt),
    lastCheckedAt: strOrNull(o.lastCheckedAt),
    lastError: strOrNull(o.lastError),
    messages: num(o.messages),
    notifyEmail: o.notifyEmail !== false,
    stoppedNote: strOrNull(o.stoppedNote),
    sandbox: o.sandbox === true,
    sandboxAddress: strOrNull(o.sandboxAddress),
  };
}

/** The body as a view, or null when it is not the contract. Rows that do not match are dropped, never guessed. */
export function parseConsultantInbox(body: unknown): ConsultantInboxView | null {
  if (!isObj(body) || !isObj(body.inbox)) return null;
  const inbox = parseInbox(body.inbox);
  if (!inbox) return null;
  return {
    entitled: body.inbox.entitled === true,
    inbox,
    suggestions: Array.isArray(body.suggestions) ? body.suggestions.map(parseSuggestion).filter((s): s is InboxSuggestion => s !== null) : [],
    updates: Array.isArray(body.updates) ? body.updates.map(parseUpdate).filter((u): u is InboxUpdate => u !== null) : [],
  };
}

export type InboxFetch = { kind: "OK"; view: ConsultantInboxView } | { kind: "DENIED" } | { kind: "FAILED" };

const base = (orgId: number | string) => `/api/orgs/${orgId}/me-workspace/inbox`;

/** The tenant-bound routes `InboxConnect` and the suggestion buttons talk to. */
export const inboxEndpoints = (orgId: number | string) => ({ connect: base(orgId), notify: `${base(orgId)}/notify` });

export async function fetchConsultantInbox(orgId: number | string, signal?: AbortSignal): Promise<InboxFetch> {
  try {
    const res = await fetch(base(orgId), { headers: { accept: "application/json" }, cache: "no-store", signal });
    if (res.status === 403 || res.status === 404) return { kind: "DENIED" };
    if (!res.ok) return { kind: "FAILED" };
    const view = parseConsultantInbox(await res.json().catch(() => null));
    return view ? { kind: "OK", view } : { kind: "FAILED" };
  } catch {
    return { kind: "FAILED" };
  }
}

export type SuggestionResult = { ok: true; applicationId?: number } | { ok: false; message: string };

/** Add a suggested job to the board (at the stage the mail showed) or hide it. */
export async function actOnSuggestion(orgId: number | string, id: number, action: "accept" | "dismiss"): Promise<SuggestionResult> {
  try {
    const res = await fetch(`${base(orgId)}/suggestions/${id}/${action}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: "{}",
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, applicationId: isObj(body) && typeof body.applicationId === "number" ? body.applicationId : undefined };
    if (res.status === 409) return { ok: false, message: "That one was already handled." };
    if (res.status === 404) return { ok: false, message: "That suggestion is no longer there." };
    return { ok: false, message: "That didn't work. Please try again." };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Please try again." };
  }
}

/* ── pure helpers ───────────────────────────────────────────────────────────────────── */

/** What accepting a suggestion will do, in the words the page uses on the button. */
export function acceptLabel(stage: string): string {
  switch (stage) {
    case "INTERVIEW":
      return "Add to my board as Interview";
    case "OFFER":
      return "Add to my board as Offer";
    case "APPLIED":
      return "Add to my board as Applied";
    default:
      return "Add to my board";
  }
}

export const STAGE_TONE: Record<string, "green" | "amber" | "blue" | "red" | "violet" | "slate"> = {
  APPLIED: "blue",
  IN_REVIEW: "violet",
  INTERVIEW: "amber",
  OFFER: "green",
  REJECTED: "red",
  WITHDRAWN: "slate",
};

export const stageTone = (stage: string) => STAGE_TONE[stage] ?? "slate";
