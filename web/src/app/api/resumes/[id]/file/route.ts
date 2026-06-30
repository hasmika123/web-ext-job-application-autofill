import { apiUrl } from "@/lib/config";
import { getAccessToken } from "@/lib/auth";

/**
 * GET /api/resumes/:id/file — stream a library resume's stored PDF back inline, for the
 * board side-panel preview. Proxies the owner-scoped Spring endpoint; JWT stays server-side.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Invalid resume id." }, { status: 400 });
  }
  const token = await getAccessToken();
  if (!token) {
    return Response.json({ error: "You're not signed in." }, { status: 401 });
  }

  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/resumes/${id}/file`), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (!res.ok) {
    return new Response(null, { status: res.status });
  }
  const headers = new Headers();
  const ct = res.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  // Force inline so the browser renders it in the preview frame (the Spring route sends
  // "attachment"); keep it lightweight by overriding just the disposition.
  headers.set("content-disposition", "inline");
  return new Response(res.body, { status: 200, headers });
}
