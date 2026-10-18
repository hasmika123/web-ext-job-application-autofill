import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";
import { suggestBody } from "@/lib/resume-ai-proxy";

/**
 * POST /api/resumes/:id/ai/suggestions `{consent, refresh?}` - the AI Suggestions cards for this resume (R4.6, Pro):
 * `{status, suggestions[], contentHash, staleAt?, usage?}`, 402 `PRO_REQUIRED` for Free, 502 on a provider failure,
 * all relayed verbatim. A thin proxy.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/ai/suggestions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await suggestBody(request),
  });
}

/** GET /api/resumes/:id/ai/suggestions - the open cards (no AI call), each marked `stale` when the resume has changed since. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/ai/suggestions`);
}
