import { badId, forward, ID } from "@/lib/tracker-proxy";

const SIGNAL = /^[A-Z_]{1,16}$/;

/** DELETE /api/jobs/:id/feedback/:signal - undo a hide (a company hide lifts every job of that company) -> 204. */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string; signal: string }> }) {
  const { id, signal } = await ctx.params;
  if (!ID.test(id)) return badId("job");
  if (!SIGNAL.test(signal)) return Response.json({ error: "Invalid signal." }, { status: 400 });
  return forward(`/api/jobs/${id}/feedback/${signal}`, { method: "DELETE" });
}
