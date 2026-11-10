import { apiUrl } from "@/lib/config";
import { getAccessToken } from "@/lib/auth";
import { RESUME_ID, badId } from "@/lib/resume-doc-proxy";

/**
 * GET /api/resumes/:id/original - the file a resume was made from (R2.6; "Download original" in Resume
 * settings). Streams the owner-scoped Spring endpoint; 404 when the resume was not made from an upload.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  const token = await getAccessToken();
  if (!token) return Response.json({ error: "You're not signed in." }, { status: 401 });

  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/profile/resumes/${id}/original`), { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (!res.ok) return new Response(null, { status: res.status });
  const headers = new Headers({ "cache-control": "no-store" });
  for (const name of ["content-type", "content-disposition"]) {
    const v = res.headers.get(name);
    if (v) headers.set(name, v);
  }
  return new Response(res.body, { status: 200, headers });
}
