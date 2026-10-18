import { serverApiFetch } from "@/lib/api";

/** What Spring's signed link carries: epoch seconds and a base64url/hex HMAC. Anything else is refused here, not forwarded. */
const EXP = /^\d{1,12}$/;
const SIG = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * GET /api/account/exports/:id/file?exp=&sig=: the finished ZIP. The body is streamed straight from Spring to the browser (it can be
 * large, so it is never buffered), with the file name Spring chose. The signed link only works while the owner is signed in:
 * Spring checks both, and a link that is wrong, expired, or somebody else's is its generic 404.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "Invalid export id." }, { status: 400 });

  const url = new URL(request.url);
  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  if ((exp !== null && !EXP.test(exp)) || (sig !== null && !SIG.test(sig))) {
    return Response.json({ error: "That download link isn't valid." }, { status: 400 });
  }
  const query = new URLSearchParams();
  if (exp !== null) query.set("exp", exp);
  if (sig !== null) query.set("sig", sig);
  const qs = query.toString();

  let res: Response;
  try {
    res = await serverApiFetch(`/api/account/exports/${id}/file${qs ? `?${qs}` : ""}`);
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status === 401) return Response.json({ error: "Your session expired. Please sign in again." }, { status: 401 });
  if (!res.ok || !res.body) {
    return Response.json({ error: "That download isn't available. It may have expired, so prepare a new export." }, { status: res.status === 404 || res.status === 403 ? 404 : res.status === 410 ? 410 : 502 });
  }

  const headers = new Headers({ "cache-control": "private, no-store" });
  for (const name of ["content-type", "content-disposition", "content-length"] as const) {
    const v = res.headers.get(name);
    if (v) headers.set(name, v);
  }
  if (!headers.has("content-type")) headers.set("content-type", "application/zip");
  return new Response(res.body, { status: 200, headers });
}
