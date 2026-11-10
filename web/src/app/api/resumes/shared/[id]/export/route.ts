import { serverApiFetch } from "@/lib/api";
import { badId, RESUME_ID } from "@/lib/resume-doc-proxy";

/**
 * GET /api/resumes/shared/:id/export?format=pdf - the stored PDF of a resume shared with me (R3.11).
 * Binary pass-through (the JSON `forward` helper reads text); Spring's 404 / 409 `PDF_NOT_READY` bodies are relayed.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  if (new URL(request.url).searchParams.get("format") !== "pdf") {
    return Response.json({ error: "Use ?format=pdf.", code: "FORMAT_UNSUPPORTED" }, { status: 400 });
  }
  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/resumes/shared/${id}/export?format=pdf`);
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (!res.ok) {
    return new Response(await res.text(), {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="resume.pdf"',
      "content-length": String(bytes.length),
      "cache-control": "no-store",
    },
  });
}
