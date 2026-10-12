import { badInput, forwardAsVisitor, TOKEN } from "@/lib/org-proxy";

/**
 * POST /api/join/:token/accept - the signed-in person accepts an emailed invite and, in the same call, records what they
 * chose to share, body `{shareScope: NONE|SUMMARY, consentVersion}` (O2.2 / O6.2). Spring answers 409 ALREADY_MEMBER,
 * INVITE_EXPIRED or SEAT_STATE, 422 for FULL or an unknown consent version, and one generic 404 for any other bad link.
 */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!TOKEN.test(token)) return badInput("link");
  const raw = await request.text();
  if (!raw.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forwardAsVisitor(request, `/api/join/${token}/accept`, { method: "POST", body: raw });
}
