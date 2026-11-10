import { fetchPublicPdf, SHARE_TOKEN } from "@/lib/public-resume";
import { clientIp } from "@/lib/rate-limit";

// Never cached, never indexed: the PDF behind a share link is only as long-lived as the link.
export const dynamic = "force-dynamic";

const HEADERS = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } as const;

const notFound = () => Response.json({ error: "Not found." }, { status: 404, headers: HEADERS });

/**
 * GET /r/:token/pdf - the stored PDF behind a share link that allows download (R3.11). A thin proxy of
 * Spring's `/api/public/resumes/{token}/pdf` with no credentials: 404 for an unknown / revoked / expired
 * link or one that does not allow download (all the same answer), 409 `PDF_NOT_READY` while the stored PDF
 * is behind the document, 429 over the per-visitor limit.
 */
export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!SHARE_TOKEN.test(token)) return notFound();

  const res = await fetchPublicPdf(token, clientIp(request));
  if (!res) return Response.json({ error: "Couldn't reach the server." }, { status: 502, headers: HEADERS });
  if (res.status === 404) return notFound();
  if (res.status === 409) {
    return Response.json({ error: "The PDF is being prepared. Try again in a moment.", code: "PDF_NOT_READY" }, { status: 409, headers: HEADERS });
  }
  if (res.status === 429) {
    return Response.json(
      { error: "Too many requests. Please wait a minute.", code: "RATE_LIMITED" },
      { status: 429, headers: { ...HEADERS, "retry-after": res.headers.get("retry-after") ?? "60" } },
    );
  }
  if (!res.ok) return Response.json({ error: "Couldn't load the PDF." }, { status: 502, headers: HEADERS });

  const bytes = new Uint8Array(await res.arrayBuffer());
  return new Response(bytes, {
    status: 200,
    headers: {
      ...HEADERS,
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="resume.pdf"',
      "content-length": String(bytes.length),
    },
  });
}
