import { badId, idParam, passThrough } from "@/lib/subscription/bff";

/** GET /api/billing/quotes/{id}: the caller's own quote (404 for anyone else's, 410 once expired). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = idParam((await ctx.params).id);
  if (!id) return badId();
  return passThrough(`/api/billing/quotes/${id}`, null, { method: "GET" });
}
