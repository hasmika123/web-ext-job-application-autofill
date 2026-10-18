import { badBody, forward, onlyFields, readObject } from "@/lib/admin-proxy";

/**
 * Shared bits of the plan-builder BFF routes (`app/api/admin/plans/**`, `app/api/admin/catalog/**`): path-segment checks and
 * the "validate shape, forward to Spring" pattern. The BFF checks SHAPE only; bounds, reasons and money rules are the API's.
 */
export const PLAN_KEY = /^[A-Za-z0-9_]{1,40}$/;
export const VERSION_NO = /^\d{1,6}$/;
export const FEATURE_KEY = /^[A-Za-z0-9_.-]{1,80}$/;

export const notFound = () => Response.json({ error: "Not found." }, { status: 404 });

/** Forwards a JSON-object body (fields limited to `allowed`) to `path`. */
export async function forwardObject(request: Request, path: string, method: string, allowed: readonly string[] | null, headers?: Record<string, string>): Promise<Response> {
  const body = await readObject(request);
  if (!body) return badBody("Send a JSON object.");
  if (allowed) {
    const bad = onlyFields(body, allowed);
    if (bad) return badBody(bad);
  }
  return forward(path, { method, body: JSON.stringify(body), headers });
}

/** The query parameters of `request` that are in `allowed`, as a `?a=b` string (empty when none). */
export function pickQuery(request: Request, allowed: readonly string[]): string {
  const src = new URL(request.url).searchParams;
  const out = new URLSearchParams();
  for (const k of allowed) {
    const v = src.get(k);
    if (v !== null && v !== "") out.set(k, v);
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}
