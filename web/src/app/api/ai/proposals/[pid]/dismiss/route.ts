import { badId, forward, RESUME_ID } from "@/lib/resume-doc-proxy";

/** POST /api/ai/proposals/:pid/dismiss - set an AI proposal aside (R4.1). 204. A thin proxy. */
export async function POST(_request: Request, ctx: { params: Promise<{ pid: string }> }) {
  const { pid } = await ctx.params;
  if (!RESUME_ID.test(pid)) return badId();
  return forward(`/api/profile/ai/proposals/${pid}/dismiss`, { method: "POST" });
}
