import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";
import { rewriteBody } from "@/lib/resume-ai-proxy";

/**
 * POST /api/resumes/:id/ai/rewrite `{refs, mode, consent}` - Rewrite with AI (R4.1, Pro). Spring answers a checked
 * proposal `{status, proposal?, usage?}` (ok, cached, disabled, consentRequired, quotaExceeded, nothingToChange),
 * 402 `PRO_REQUIRED` for Free, 429 `RATE_LIMITED`, 502 on a provider failure - all relayed verbatim. A thin proxy.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/ai/rewrite`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await rewriteBody(request),
  });
}
