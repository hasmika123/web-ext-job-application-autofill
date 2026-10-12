import { badInput, CODE, forwardAsVisitor } from "@/lib/org-proxy";

/** GET /api/join/code/:code - the public preview of a shared join link (O2.2). */
export async function GET(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!CODE.test(code)) return badInput("link");
  return forwardAsVisitor(request, `/api/join/code/${encodeURIComponent(code)}`);
}

/**
 * POST /api/join/code/:code - the signed-in person joins with a shared link, body `{shareScope: NONE|SUMMARY,
 * consentVersion}`. Same refusals as accepting an invite; a full or expired code is 409 INVITE_EXPIRED with its `reason`.
 */
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  if (!CODE.test(code)) return badInput("link");
  const raw = await request.text();
  if (!raw.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forwardAsVisitor(request, `/api/join/code/${encodeURIComponent(code)}`, { method: "POST", body: raw });
}
