/**
 * `adminFetch`: the ONE browser-side call to the admin BFF (`/api/admin/**`, E2E-A15.0; ADMIN-E2E-PLAN section 3.6).
 * It generalises the AI page's `aiFetch` (which now delegates here): every admin page that writes - a switch, a triage
 * field, a reason-gated action - calls it and never throws. A refusal arrives in the BFF's `{ error, code, ...extras }`
 * shape (see `admin-proxy.ts`), a dead network as status 0, and the page shows `error` inline.
 *
 *   const res = await adminFetch<Setting>("PUT", "/settings/jobs.match_threshold", { value: 70 });
 *   if (!res.ok) setError(res.error);          // res.code === "SETTING_OUT_OF_BOUNDS", res.extra.min / .max ...
 */

/** One row of a settings-style change history (who changed what, from what, to what, and why). */
export interface AdminHistoryRow {
  id: number;
  key: string;
  oldValue: string | null;
  newValue: string | null;
  actorLogin: string | null;
  reason: string | null;
  changedAt: string;
}

/** Where a setting's effective value comes from: an admin override (`db`), the deployment's env, or the code default. */
export type Source = "db" | "env" | "default";
export const SOURCE_LABEL: Record<Source, string> = { db: "Admin", env: "Env", default: "Default" };

/** A resolved setting: the effective value, where it came from, and the two fallbacks under it. */
export interface Resolved<T> {
  value: T;
  source: Source;
  envDefault: T | null;
  codeDefault: T;
}

export interface AdminFail {
  ok: false;
  /** The HTTP status; 0 when the server could not be reached. */
  status: number;
  /** The API's machine code (SETTING_REASON_REQUIRED, AI_PROVIDER_IN_USE ...) when it sent one. */
  code: string | null;
  /** The API's human message, shown inline. */
  error: string;
  /** Everything else the API attached (tasks, retryAfterSeconds, min, max ...). */
  extra: Record<string, unknown>;
}
export type AdminResult<T> = { ok: true; data: T } | AdminFail;

/** What a save or confirm step reports back: done, or the refusal. */
export type AdminOutcome = { ok: true } | AdminFail;

export type AdminMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Prefix of every admin BFF route. */
export const ADMIN_BASE = "/api/admin";

/** Message when the API's answer carries no text of its own. */
export const GENERIC_FAILURE = "That didn't work.";
export const UNREACHABLE = "Couldn't reach the server.";

/** The `AdminFail` for an answer with this status and body. Pure: the unit tests drive it directly. */
export function failFrom(status: number, data: Record<string, unknown>): AdminFail {
  const { error, code, ...extra } = data;
  return {
    ok: false,
    status,
    code: typeof code === "string" ? code : null,
    error: typeof error === "string" && error ? error : GENERIC_FAILURE,
    extra,
  };
}

/**
 * One call to `/api/admin{path}` (`path` starts with "/"); never throws. `body` is sent as JSON. A non-object answer
 * counts as `{}` so a 204 or an HTML error page still yields a clean `AdminFail` / empty `data`.
 */
export async function adminFetch<T>(method: AdminMethod | string, path: string, body?: unknown): Promise<AdminResult<T>> {
  try {
    const res = await fetch(`${ADMIN_BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return failFrom(res.status, data && typeof data === "object" ? data : {});
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, code: null, error: UNREACHABLE, extra: {} };
  }
}

/** Binds `adminFetch` to a sub-path ("/ai") so a feature keeps its short paths: `fetchIn("/ai")("GET", "/config")`. */
export function adminFetchIn(prefix: string) {
  return <T>(method: AdminMethod | string, path: string, body?: unknown): Promise<AdminResult<T>> => adminFetch<T>(method, `${prefix}${path}`, body);
}
