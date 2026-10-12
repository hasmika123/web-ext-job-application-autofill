/**
 * The browser half of the organization BFF (APP-E2E O2.2 / O6.2 / O2.3 / O5.1 / O13.1): one `orgCall()` that turns an HTTP
 * outcome into a small tagged result and never throws. Like `lib/tracker-client.ts` but it keeps what the org errors carry:
 * the problem `code` (ALREADY_MEMBER, INVITE_EXPIRED, SEAT_STATE, ORG_LIMIT_REACHED, SLUG_TAKEN, SHARE_SCOPE ...), the
 * `reason` of an expired link, the offending `field` of a 422 and the server's own plain-language `title`.
 */
import type { AutosaveResult } from "@/lib/autosave";

export type OrgResult<T> =
  | { kind: "ok"; data: T }
  | {
      kind: "error";
      /** The HTTP status; 0 when the server could not be reached. */
      status: number;
      code?: string;
      /** `expired` | `full` on INVITE_EXPIRED. */
      reason?: string;
      /** The field a 422 names (`settings.defaultRole`, `name`, `website` ...). */
      field?: string;
      /** The server's plain-language sentence, or ours when it sent none. */
      message: string;
      /** Everything else the problem carried (`limit`, `max`, `suggestion`, `orgName` ...). */
      extra: Record<string, unknown>;
    };

export const SESSION_EXPIRED = "Your session expired. Sign in again to continue.";
const NETWORK = "Couldn't reach the server. Check your connection and try again.";

interface Problem {
  code?: string;
  reason?: string;
  field?: string;
  title?: string;
  detail?: string;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

/** A sentence from a problem, never the machine key `error.org`. */
function sentence(p: Problem | null, fallback: string): string {
  for (const v of [p?.title, p?.detail, p?.error]) if (typeof v === "string" && v.trim() && !/^error\./.test(v)) return v;
  return fallback;
}

export async function orgCall<T>(method: string, url: string, body?: unknown, parse = true): Promise<OrgResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { kind: "error", status: 0, message: NETWORK, extra: {} };
  }
  if (res.ok) {
    try {
      return { kind: "ok", data: (parse && res.status !== 204 ? await res.json() : undefined) as T };
    } catch {
      return { kind: "error", status: 502, message: "The server answered with something we couldn't read.", extra: {} };
    }
  }
  if (res.status === 401) return { kind: "error", status: 401, message: SESSION_EXPIRED, extra: {} };
  const p = (await res.json().catch(() => null)) as Problem | null;
  const { code, reason, field, title, detail, message, error, ...extra } = p ?? {};
  void title;
  void detail;
  void message;
  void error;
  const fallback = res.status === 404 ? "That is no longer there." : res.status === 429 ? "Too many tries. Wait a minute and try again." : res.status >= 500 ? "Something went wrong on our side. Try again." : "That didn't work.";
  return {
    kind: "error",
    status: res.status,
    code: typeof code === "string" ? code : undefined,
    reason: typeof reason === "string" ? reason : undefined,
    field: typeof field === "string" ? field : undefined,
    message: res.status === 404 ? fallback : sentence(p, fallback),
    extra,
  };
}

/**
 * A result as an autosave outcome (see `toAutosave`): success is `ok`; a network failure, a 429 or a 5xx retries with
 * backoff; a 422 / 409 is the person's text being refused (the chip shows the message, the next edit retries); anything
 * else (401, 403, 404) will not succeed by retrying.
 */
export function orgToAutosave<T, D = never>(r: OrgResult<T>): AutosaveResult<D> {
  if (r.kind === "ok") return { kind: "ok" };
  if (r.status === 0 || r.status === 429 || r.status >= 500) return { kind: "network" };
  if (r.status === 422 || r.status === 409 || r.status === 400) return { kind: "invalid", path: r.field ?? "", message: r.message };
  return { kind: "fatal", message: r.message };
}
