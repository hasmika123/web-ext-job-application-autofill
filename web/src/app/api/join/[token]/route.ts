import { badInput, forwardAsVisitor, TOKEN } from "@/lib/org-proxy";

/**
 * GET /api/join/:token - the public preview of an emailed invite (O2.2). No session needed; the visitor's address is
 * forwarded so Spring rate limits the person. A string that cannot be a token is refused here and never reaches Spring.
 */
export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!TOKEN.test(token)) return badInput("link");
  return forwardAsVisitor(request, `/api/join/${token}`);
}
