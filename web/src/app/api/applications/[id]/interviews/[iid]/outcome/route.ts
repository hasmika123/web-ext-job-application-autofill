import { badId, forwardJson, ID } from "@/lib/tracker-proxy";

/** POST /api/applications/:id/interviews/:iid/outcome - `{outcome: "PENDING"|"PASSED"|"REJECTED"|"NO_SHOW"}` -> the interview. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; iid: string }> }) {
  const { id, iid } = await ctx.params;
  if (!ID.test(id)) return badId();
  if (!ID.test(iid)) return badId("interview");
  return forwardJson(request, `/api/profile/applications/${id}/interviews/${iid}/outcome`, "POST");
}
