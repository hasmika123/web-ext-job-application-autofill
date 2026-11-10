import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";
import { applyBody } from "@/lib/resume-ai-proxy";

/**
 * POST /api/ai/proposals/:pid/apply `{keep, alternatives?}` - apply the kept changes of an AI proposal (R4.1). The
 * client names refs and an alternative index, never text. 200 is the updated document with the new `ETag` (relayed
 * for the editor to adopt); 409 `PROPOSAL_STALE` / `PROPOSAL_CLOSED`, 400 `KEEP_EMPTY`, 422 `PLACEHOLDER_REMAINS`
 * pass through unchanged. A thin proxy.
 */
export async function POST(request: Request, ctx: { params: Promise<{ pid: string }> }) {
  const { pid } = await ctx.params;
  if (!RESUME_ID.test(pid)) return badId();
  return forward(`/api/profile/ai/proposals/${pid}/apply`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await applyBody(request),
  });
}
