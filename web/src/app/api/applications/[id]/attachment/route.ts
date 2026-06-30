import { apiUrl } from "@/lib/config";
import { getAccessToken } from "@/lib/auth";

/**
 * Per-application resume attachment (the one-off PDF actually submitted, kept out of the resume
 * library). POST uploads it; GET streams it back inline for the side-panel preview. Both proxy
 * the owner-scoped Spring endpoint and keep the JWT server-side.
 */
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Invalid application id." }, { status: 400 });
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

  const fd = new FormData();
  fd.append("file", file, file.name);
  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/profile/applications/${id}/attachment`), {
      method: "POST",
      headers: { authorization: `Bearer ${token}` }, // let fetch set the multipart boundary
      body: fd,
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status === 401) {
    return Response.json({ error: "Your session expired — please sign in again." }, { status: 401 });
  }
  if (res.status === 404) {
    return Response.json({ error: "Application not found." }, { status: 404 });
  }
  if (!res.ok) {
    return Response.json({ error: "Couldn't attach the file." }, { status: 502 });
  }
  return Response.json({ ok: true });
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Invalid application id." }, { status: 400 });
  }
  const token = await getAccessToken();
  if (!token) {
    return Response.json({ error: "You're not signed in." }, { status: 401 });
  }

  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/profile/applications/${id}/attachment`), {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (!res.ok) {
    return new Response(null, { status: res.status });
  }
  // Stream the bytes back with the upstream content type + inline disposition (PDF preview).
  const headers = new Headers();
  const ct = res.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const cd = res.headers.get("content-disposition");
  if (cd) headers.set("content-disposition", cd);
  return new Response(res.body, { status: 200, headers });
}
