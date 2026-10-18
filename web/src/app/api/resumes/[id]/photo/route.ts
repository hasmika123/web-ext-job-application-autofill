import { serverApiFetch } from "@/lib/api";
import { PHOTO_REQUEST_CAP_BYTES, capStream } from "@/lib/photo-upload";
import { rateLimit } from "@/lib/rate-limit";
import { RESUME_ID, badId, forward } from "@/lib/resume-doc-proxy";

// Streams a body: never cached, never rendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tooLarge = () => Response.json({ error: "That picture is too large.", code: "PHOTO_TOO_LARGE" }, { status: 413 });

/**
 * GET /api/resumes/:id/photo - the resume's photo for the editor's slot and preview. A thin proxy of the owner-only Spring
 * endpoint that keeps its `ETag` (the storage key: a new upload is a new address) and `Cache-Control: private, max-age=300`,
 * and passes `If-None-Match` through so a browser revalidates for free (304). 404 = no photo.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();

  const headers: Record<string, string> = {};
  const inm = request.headers.get("if-none-match");
  if (inm) headers["if-none-match"] = inm;

  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/resumes/${id}/photo`, { headers });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (res.status !== 200 && res.status !== 304) return new Response(null, { status: res.status });
  const out = new Headers();
  for (const name of ["content-type", "etag", "cache-control"]) {
    const v = res.headers.get(name);
    if (v) out.set(name, v);
  }
  return new Response(res.status === 304 ? null : res.body, { status: res.status, headers: out });
}

/**
 * POST /api/resumes/:id/photo - add or replace the photo (multipart `file`, JPEG / PNG / WebP). The body is STREAMED to
 * Spring (never buffered here) with the multipart content type passed through, and cut off at {@link PHOTO_REQUEST_CAP_BYTES}
 * (a declared `Content-Length` over it is refused before anything is sent). Spring checks ownership, the admin switch, the
 * exact size cap, the type, and strips the metadata; its JSON answer (the saved document with the new ETag, or a coded
 * refusal) is relayed unchanged.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();

  const type = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data;\s*boundary=/i.test(type) || !request.body) {
    return Response.json({ error: "Send the picture as a multipart upload.", code: "PHOTO_FORMAT" }, { status: 415 });
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > PHOTO_REQUEST_CAP_BYTES) return tooLarge();

  const limited = rateLimit(request, "resume-photo", 20, 60_000);
  if (!limited.ok) {
    return Response.json({ error: "Too many uploads - try again in a moment.", code: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": String(limited.retryAfter) } });
  }

  let exceeded = false;
  const body = capStream(request.body, PHOTO_REQUEST_CAP_BYTES, () => {
    exceeded = true;
  });
  const init: RequestInit & { duplex: "half" } = { method: "POST", body, headers: { "content-type": type }, duplex: "half" };
  // forward() answers 502 for a failed send; an upload cut at the cap fails the same way, so tell the two apart here.
  const res = await forward(`/api/profile/resumes/${id}/photo`, init);
  if (exceeded) return tooLarge();
  return res;
}

/** DELETE /api/resumes/:id/photo - remove the photo (the file goes; the document's photo becomes null). A thin proxy. */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/photo`, { method: "DELETE" });
}
