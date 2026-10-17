import { badId, idParam, passThrough } from "@/lib/subscription/bff";

/** POST /api/billing/quotes/{id}/checkout `{returnTo?}`: the hosted Stripe Checkout of a CHECKOUT quote; returns `{url}`. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = idParam((await ctx.params).id);
  if (!id) return badId();
  const body = (await request.json().catch(() => null)) as { returnTo?: unknown } | null;
  const returnTo = typeof body?.returnTo === "string" ? body.returnTo : undefined;
  return passThrough(`/api/billing/quotes/${id}/checkout`, request, { method: "POST", body: JSON.stringify(returnTo ? { returnTo } : {}) });
}
