import { badId, idParam, passThrough } from "@/lib/subscription/bff";

/** DELETE /api/billing/changes/{id}: take back a scheduled removal or decrease before its date (the undo of the My plan toast). */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = idParam((await ctx.params).id);
  if (!id) return badId();
  return passThrough(`/api/billing/changes/${id}`, null, { method: "DELETE" });
}
