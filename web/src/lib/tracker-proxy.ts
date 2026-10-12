/**
 * Plumbing for the applications-tracker BFF routes (APP-E2E U6.2 / U6.4): `/api/applications/**` and
 * `/api/interviews/**`. They are THIN proxies over `forward()` (relays status, body and the problem JSON
 * `code`s - `SORT_INVALID`, `TRACKER_INVALID`, `TRACKER_LIMIT`, `SENSITIVE_CONTENT` - verbatim, and maps a
 * demo-account write refusal): the browser never sends an id into a path unchecked, and nothing here
 * decides what is valid; Spring does, and answers 404 for another user's row.
 */
import { forward } from "@/lib/resume-doc-proxy";

/** A numeric path id. */
export const ID = /^\d+$/;

export function badId(what = "application"): Response {
  return Response.json({ error: `Invalid ${what} id.` }, { status: 400 });
}

/** The query string (with its `?`) of a request, or "": filters, paging and sort go to Spring untouched. */
export function search(request: Request): string {
  return new URL(request.url).search;
}

/** Forward a JSON body (any object) with `method` to `path`; an empty body is refused here, not by Spring. */
export async function forwardJson(request: Request, path: string, method: "POST" | "PUT" | "PATCH"): Promise<Response> {
  const raw = await request.text();
  if (!raw.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward(path, { method, body: raw });
}

export { forward };
