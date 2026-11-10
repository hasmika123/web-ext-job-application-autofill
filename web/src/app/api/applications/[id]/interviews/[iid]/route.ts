import { badId, forward, forwardJson, ID } from "@/lib/tracker-proxy";

type Ctx = { params: Promise<{ id: string; iid: string }> };

/** PUT /api/applications/:id/interviews/:iid - partial (autosaved per field); `null` clears endsAt, tz, location, interviewer, notes. */
export async function PUT(request: Request, ctx: Ctx) {
  const { id, iid } = await ctx.params;
  if (!ID.test(id)) return badId();
  if (!ID.test(iid)) return badId("interview");
  return forwardJson(request, `/api/profile/applications/${id}/interviews/${iid}`, "PUT");
}

/** DELETE /api/applications/:id/interviews/:iid - 204. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const { id, iid } = await ctx.params;
  if (!ID.test(id)) return badId();
  if (!ID.test(iid)) return badId("interview");
  return forward(`/api/profile/applications/${id}/interviews/${iid}`, { method: "DELETE" });
}
