import { badId, forward, forwardJson, ID } from "@/lib/tracker-proxy";

type Ctx = { params: Promise<{ id: string; nid: string }> };

/** PUT /api/applications/:id/notes/:nid - partial `{body?, pinned?}` (autosaved while typing; no timeline event). */
export async function PUT(request: Request, ctx: Ctx) {
  const { id, nid } = await ctx.params;
  if (!ID.test(id)) return badId();
  if (!ID.test(nid)) return badId("note");
  return forwardJson(request, `/api/profile/applications/${id}/notes/${nid}`, "PUT");
}

/** DELETE /api/applications/:id/notes/:nid - 204. The page offers Undo by re-posting the body it still holds. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const { id, nid } = await ctx.params;
  if (!ID.test(id)) return badId();
  if (!ID.test(nid)) return badId("note");
  return forward(`/api/profile/applications/${id}/notes/${nid}`, { method: "DELETE" });
}
