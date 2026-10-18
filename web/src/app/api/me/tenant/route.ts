import { serverApiFetch } from "@/lib/api";

/**
 * GET /api/me/tenant (X2.16): the browser's door to the tenant session for the shell's "your access changed" check. A plain
 * pass-through of the API's `GET /api/me/tenant` (X2.2) that keeps the ETag contract: the shell sends `If-None-Match` with the tag it
 * was drawn from and gets a bodiless 304 while nothing changed. The host headers and the bearer token are added by
 * `serverApiFetch`; nothing about the answer is cached or shared.
 */
export async function GET(req: Request) {
  const headers: Record<string, string> = { accept: "application/json" };
  const inm = req.headers.get("if-none-match");
  if (inm) headers["if-none-match"] = inm;
  let res: Response;
  try {
    res = await serverApiFetch("/api/me/tenant", { headers, signal: AbortSignal.timeout(4000) });
  } catch {
    return new Response(null, { status: 502, headers: { "cache-control": "no-store" } });
  }
  const out = new Headers({ "cache-control": "private, no-store" });
  const etag = res.headers.get("etag");
  if (etag) out.set("etag", etag);
  if (res.status === 304) return new Response(null, { status: 304, headers: out });
  out.set("content-type", "application/json");
  return new Response(await res.text(), { status: res.status, headers: out });
}
