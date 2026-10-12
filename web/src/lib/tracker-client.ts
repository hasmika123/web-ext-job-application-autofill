/**
 * The browser half of the tracker BFF (APP-E2E U6.3): one `call()` that turns an HTTP outcome into a small tagged
 * result and never throws, plus `toAutosave()` which maps that result onto what `useAutosave` expects. The
 * application fetchers (`lib/applications.ts`) and the interview fetchers (`lib/interviews.ts`) speak the same
 * shape on purpose, so a form can autosave through either.
 */
import type { AutosaveResult } from "@/lib/autosave";

export type TrackerResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "error"; message: string; code?: string; path?: string; status?: number };

interface Problem {
  code?: string;
  path?: string;
  message?: string;
  error?: string;
  detail?: string;
  title?: string;
}

export const SESSION_EXPIRED = "Your session expired — please sign in again.";
const SENSITIVE_FALLBACK = "That looks like something we never store (an ID or bank number). Please remove it.";

export async function call<T>(method: string, url: string, body?: unknown, parse = true): Promise<TrackerResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return { kind: "ok", data: (parse && res.status !== 204 ? await res.json() : undefined) as T };
    if (res.status === 401) return { kind: "error", status: 401, message: SESSION_EXPIRED };
    const p = (await res.json().catch(() => null)) as Problem | null;
    if (res.status === 404) return { kind: "error", status: 404, code: p?.code, message: "That is no longer there." };
    if (p?.code === "SENSITIVE_CONTENT") {
      return { kind: "error", status: res.status, code: p.code, path: p.path, message: p.message ?? SENSITIVE_FALLBACK };
    }
    return {
      kind: "error",
      status: res.status,
      code: p?.code,
      path: p?.path,
      message: p?.message ?? p?.error ?? p?.detail ?? p?.title ?? "Couldn't save that.",
    };
  } catch {
    return { kind: "error", message: "Couldn't reach the server." };
  }
}

/**
 * A result as an autosave outcome: success is `ok`; a network failure, a 429 or a 5xx retries with backoff; a 422
 * is the user's text being refused (shown as the chip's message, the next edit retries); anything else
 * (401, 403, 404, 413) will not succeed by retrying.
 */
export function toAutosave<T, D = never>(r: TrackerResult<T>): AutosaveResult<D> {
  if (r.kind === "ok") return { kind: "ok" };
  const s = r.status ?? 0;
  if (s === 0 || s === 429 || s >= 500) return { kind: "network" };
  if (s === 422 || s === 400) return { kind: "invalid", path: r.path ?? "", message: r.message };
  return { kind: "fatal", message: r.message };
}
