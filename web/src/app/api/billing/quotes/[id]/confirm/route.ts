import { badId, idParam, passThrough } from "@/lib/subscription/bff";

/** POST /api/billing/quotes/{id}/confirm (needs an `Idempotency-Key` UUID header, which is forwarded as is): apply a CHANGE quote. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = idParam((await ctx.params).id);
  if (!id) return badId();
  const body = (await request.json().catch(() => null)) as { confirmedCommercialDeps?: unknown } | null;
  const deps = Array.isArray(body?.confirmedCommercialDeps) ? body.confirmedCommercialDeps.filter((d): d is string => typeof d === "string") : [];
  return passThrough(`/api/billing/quotes/${id}/confirm`, request, { method: "POST", body: JSON.stringify({ confirmedCommercialDeps: deps }) });
}
