import { apiUrl } from "@/lib/config";
import { getAccessToken } from "@/lib/auth";

/**
 * GET /api/resumes/:id/file — stream a library resume's stored PDF. Defaults to `inline`
 * (for any embedded preview); pass `?download=1` to force `attachment` so the browser saves
 * the file. Proxies the owner-scoped Spring endpoint; the JWT stays server-side.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Invalid resume id." }, { status: 400 });
  }
  const download = new URL(request.url).searchParams.get("download") === "1";
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
  // `?download=1` → save the file (attachment); otherwise inline for an embedded preview.
  // Reuse the upstream filename when forcing a download; else fall back to a sensible name.
  if (download) {
    const upstream = res.headers.get("content-disposition");
    headers.set("content-disposition", upstream && /attachment/i.test(upstream) ? upstream : `attachment; filename="resume-${id}.pdf"`);
  } else {
    headers.set("content-disposition", "inline");
  }
  return new Response(res.body, { status: 200, headers });
}

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/resumes/:id/file — attach a file to one of the caller's resumes (multipart `file`, up to
 * 10MB). The new-resume chooser's "Upload a resume" path uses it to keep the uploaded original with the
 * resume it just created (R2.6); the API stores it as the document's original, apart from the generated PDF.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Invalid resume id." }, { status: 400 });
  }
  const token = await getAccessToken();
  if (!token) {
    return Response.json({ error: "You're not signed in." }, { status: 401 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "That file is too large (max 10MB)." }, { status: 413 });
  }
  const out = new FormData();
  out.append("file", file, file.name);
  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/resumes/${id}/file`), {
      method: "POST",
      headers: { authorization: `Bearer ${token}` }, // fetch sets the multipart boundary
      body: out,
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (!res.ok) return Response.json({ error: "Couldn't attach the file." }, { status: res.status === 404 ? 404 : 502 });
  return Response.json({ ok: true });
}
