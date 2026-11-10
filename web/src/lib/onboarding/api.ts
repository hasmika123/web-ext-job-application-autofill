/**
 * Browser-side helpers for `/api/profile/onboarding` (Onboarding v2 R1.9, ONBOARDING-V2-DESIGN 9): the resumable
 * setup draft, the persona and dashboard-card markers, and finish. They call the BFF at `/api/profile/onboarding/**`
 * (never Spring) and turn every refusal into an {@link OnboardingApiError} carrying the machine-readable `code`
 * the callers branch on. Client-safe; the server reader is `server.ts`.
 */
import type { Persona } from "@/lib/profile-setup/state";

export type OnboardingStatusKind = "NONE" | "DRAFT" | "FINISHED";
export type CardState = "NOT_STARTED" | "IN_PROGRESS";

/** The draft's summary; `state` is present only for `?include=state`. */
export interface DraftSummary {
  step: string;
  stepsDone: number;
  stepsTotal: number;
  updatedAt: string;
  state?: unknown;
}

/** The dashboard card's server-evaluated decision (DESIGN 6). */
export interface CardStatus {
  dismissedAt: string | null;
  snoozedUntil: string | null;
  resurfaceCount: number;
  show: boolean;
  state: CardState;
  /** A dismissed card that came back: the card adds the honest "{score}%" line. */
  resurfaced: boolean;
}

/** `GET /api/profile/onboarding`. */
export interface OnboardingStatus {
  status: OnboardingStatusKind;
  persona: Persona | null;
  finishedAt: string | null;
  draft: DraftSummary | null;
  card: CardStatus;
  completeness: { score: number; promptBelow: number; resurfaceBelow: number };
}

/** The body of `PUT /draft` (DESIGN 7.2). */
export interface DraftBody {
  v: 2;
  step: string;
  persona?: Persona | null;
  stepsDone: number;
  stepsTotal: number;
  state: unknown;
  baseUpdatedAt?: string;
  force?: boolean;
}

export interface DraftSaved {
  updatedAt: string;
  expiresAt: string;
}

export type CardAction = "SNOOZE" | "DISMISS" | "RESET";

/** `POST /finish`: idempotent (DESIGN 9 / 10). */
export interface FinishResponse {
  finishedAt: string;
  completeness: { score: number; promptBelow: number; resurfaceBelow: number };
  coverage: { fields: number; groups: Record<string, number> };
}

/** A refusal (or a network failure: `status` 0, `code` "NETWORK") with the bits the callers branch on. */
export class OnboardingApiError extends Error {
  readonly status: number;
  /** `DRAFT_CONFLICT`, `DRAFT_TOO_LARGE`, `SENSITIVE_CONTENT`, `DRAFT_INVALID`, `PERSONA_INVALID`, `DEMO_READ_ONLY`, `RATE_LIMITED`, `NETWORK`, ... */
  readonly code: string | null;
  /** `DRAFT_CONFLICT`: the stored draft's `updatedAt`. */
  readonly serverUpdatedAt: string | null;
  /** `DRAFT_TOO_LARGE`: the cap in bytes. */
  readonly max: number | null;
  /** `SENSITIVE_CONTENT` / `DRAFT_INVALID`: where; and (sensitive) which class of value. */
  readonly path: string | null;
  readonly cls: string | null;

  constructor(status: number, body: Record<string, unknown> | null, fallback: string) {
    const msg = typeof body?.message === "string" ? body.message : typeof body?.detail === "string" ? body.detail : typeof body?.error === "string" ? body.error : null;
    super(msg ?? fallback);
    this.status = status;
    this.code = typeof body?.code === "string" ? body.code : null;
    this.serverUpdatedAt = typeof body?.serverUpdatedAt === "string" ? body.serverUpdatedAt : null;
    this.max = typeof body?.max === "number" ? body.max : null;
    this.path = typeof body?.path === "string" ? body.path : null;
    this.cls = typeof body?.class === "string" ? body.class : null;
  }

  /** Worth trying again later: the network, a 5xx, a rate limit or a timeout. A refusal (4xx) will not change on its own. */
  get retryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 429 || this.status === 408;
  }
}

const BASE = "/api/profile/onboarding";

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new OnboardingApiError(0, { code: "NETWORK" }, "Couldn't reach the server.");
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new OnboardingApiError(res.status, json, "Something went wrong.");
  return json as T;
}

/** `GET /api/profile/onboarding[?include=state]`. */
export function getOnboarding(includeState = false): Promise<OnboardingStatus> {
  return call("GET", includeState ? `${BASE}?include=state` : BASE);
}

/** `PUT /draft`: 409 `DRAFT_CONFLICT`, 413 `DRAFT_TOO_LARGE`, 422 `SENSITIVE_CONTENT` / `DRAFT_INVALID`. */
export function putDraft(body: DraftBody): Promise<DraftSaved> {
  return call("PUT", `${BASE}/draft`, body);
}

/** `DELETE /draft`: start over. The persona and everything already confirmed stay. */
export function deleteDraft(): Promise<void> {
  return call("DELETE", `${BASE}/draft`);
}

/** `PATCH`: set / clear the persona, and snooze / dismiss / reset the dashboard card. */
export function patchOnboarding(body: { persona?: Persona | null; card?: { action: CardAction } }): Promise<OnboardingStatus> {
  return call("PATCH", BASE, body);
}

/** `POST /finish`: stamps `finishedAt`, deletes the draft, returns the honest autofill count. */
export function finishOnboarding(): Promise<FinishResponse> {
  return call("POST", `${BASE}/finish`, {});
}

/**
 * The last-chance flush for a page that is being hidden or closed: `navigator.sendBeacon` to the BFF's POST alias of
 * `PUT /draft` (a beacon can only POST). Fire-and-forget; false when the browser refused it (no beacon support, or its
 * queue is full), so the caller can fall back to a `keepalive` fetch.
 */
export function sendDraftBeacon(body: DraftBody): boolean {
  try {
    if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return false;
    return navigator.sendBeacon(`${BASE}/draft`, new Blob([JSON.stringify(body)], { type: "application/json" }));
  } catch {
    return false;
  }
}

/** The fallback of {@link sendDraftBeacon}: a `keepalive` fetch survives the page too (up to 64 KB). */
export function sendDraftKeepalive(body: DraftBody): void {
  try {
    void fetch(`${BASE}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => undefined);
  } catch {
    // nothing more to do on a closing page
  }
}
