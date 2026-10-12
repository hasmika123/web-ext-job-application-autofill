import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";
import { summaryBody } from "@/lib/resume-ai-proxy";

/**
 * POST /api/resumes/:id/ai/summary `{tone, consent}` - generate a summary with AI (R4.1, Pro): the same answer shape
 * as rewrite, one change with ref `summary`. A thin proxy.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!RESUME_ID.test(id)) return badId();
  return forward(`/api/profile/resumes/${id}/ai/summary`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await summaryBody(request),
  });
}
