/**
 * Shared plumbing for the Resume Builder BFF routes (`/api/resumes/built`, `/api/resumes/[id]/doc`,
 * `…/doc/template`). These are THIN proxies: they forward the caller's auth to Spring (via
 * `serverApiFetch`), pass the `If-Match` request header and the `ETag` response header through, and
 * return Spring's JSON error bodies verbatim — the editor branches on their `code`
 * (`DOC_VERSION_CONFLICT`, `DOC_INVALID`, `DOC_TOO_LARGE`, `IF_MATCH_REQUIRED`, `RESUME_LIMIT`).
 */
import { serverApiFetch } from "@/lib/api";
import { demoReadOnly } from "@/lib/demo-server";

export const RESUME_ID = /^\d+$/;

/** Response headers worth passing back to the browser. */
const PASS_THROUGH = ["etag", "content-type"] as const;

export function badId(): Response {
  return Response.json({ error: "Invalid resume id." }, { status: 400 });
}

/**
 * Calls Spring and relays status + body + `ETag` unchanged. `Cache-Control: no-store` because a
 * document must never be served stale. A demo-account write refusal is rewritten by `demoReadOnly`
 * (friendlier body, same 403 + `code`, plus the header the in-app toaster watches).
 */
export async function forward(path: string, init: RequestInit & { ifMatch?: string | null } = {}): Promise<Response> {
  const { ifMatch, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (ifMatch) headers.set("if-match", ifMatch);

  let res: Response;
  try {
    res = await serverApiFetch(path, { ...rest, headers });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }

  const demo = await demoReadOnly(res);
  if (demo) return demo;

  const out = new Headers({ "cache-control": "no-store" });
  for (const name of PASS_THROUGH) {
    const v = res.headers.get(name);
    if (v) out.set(name, v);
  }
  // 204/304 must not carry a body.
  const body = res.status === 204 || res.status === 304 ? null : await res.text();
  return new Response(body, { status: res.status, headers: out });
}
