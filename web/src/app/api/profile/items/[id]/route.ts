import { forward } from "@/lib/resume-doc-proxy";

const ITEM_ID = /^\d+$/;
const badId = () => Response.json({ error: "Invalid item id." }, { status: 400 });

/**
 * PUT /api/profile/items/:id - partial update, body `{dataJson?, hidden?, position?, provenance?}`.
 * DELETE - soft delete (204). Another user's id is a 404 from Spring.
 */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ITEM_ID.test(id)) return badId();
  const body = await request.text();
  if (!body.trim()) return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  return forward(`/api/profile/items/${id}`, { method: "PUT", body });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ITEM_ID.test(id)) return badId();
  return forward(`/api/profile/items/${id}`, { method: "DELETE" });
}
