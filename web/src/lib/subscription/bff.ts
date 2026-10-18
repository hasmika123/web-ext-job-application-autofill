/**
 * The one pass-through of the billing BFF routes. The API's status and body go back to the browser verbatim, because the UI branches on the problem
 * `code` (QUOTE_STALE, ALREADY_SUBSCRIBED, ...); a demo account's refused write becomes the usual read-only answer.
 */
import { serverApiFetch } from "@/lib/api";
import { demoReadOnly } from "@/lib/demo-server";

const KEEP = ["idempotency-key"] as const;

export async function passThrough(path: string, request: Request | null, init: { method: string; body?: string | null }): Promise<Response> {
  const headers: Record<string, string> = {};
  for (const name of KEEP) {
    const v = request?.headers.get(name);
    if (v) headers[name] = v;
  }
  try {
    const res = await serverApiFetch(path, { method: init.method, headers, body: init.body ?? undefined });
    const demo = await demoReadOnly(res);
    if (demo) return demo;
    const text = await res.text();
    const out: Record<string, string> = { "content-type": "application/json" };
    const retry = res.headers.get("retry-after");
    if (retry) out["retry-after"] = retry;
    return new Response(text || "{}", { status: res.status, headers: out });
  } catch {
    return Response.json({ code: "UNREACHABLE", error: "Couldn't reach the server." }, { status: 502 });
  }
}

/** A path segment that must be a positive integer id; null otherwise (never forward a free-form segment). */
export function idParam(raw: string): string | null {
  return /^\d{1,18}$/.test(raw) ? raw : null;
}

export function badId(): Response {
  return Response.json({ code: "NOT_FOUND", error: "Not found." }, { status: 404 });
}
