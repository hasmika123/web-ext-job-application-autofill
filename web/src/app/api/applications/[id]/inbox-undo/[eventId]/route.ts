import { undoInbox } from "@/lib/inbox-review-bff";

/** POST /api/applications/:id/inbox-undo/:eventId: put back what the inbox changed. 409 UNDO_EXPIRED after the window. */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string; eventId: string }> }) {
  const { id, eventId } = await ctx.params;
  return undoInbox("/api/profile/applications", id, eventId);
}
