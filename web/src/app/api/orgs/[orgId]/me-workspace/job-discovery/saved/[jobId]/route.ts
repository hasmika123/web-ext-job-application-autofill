import { base, isId, notFound, send } from "@/lib/ent/consultant-ws/jobDiscovery-bff";

type Ctx = { params: Promise<{ orgId: string; jobId: string }> };

async function target(ctx: Ctx): Promise<string | null> {
  const { orgId, jobId } = await ctx.params;
  const b = base(orgId);
  return b && isId(jobId) ? `${b}/saved/${jobId}` : null;
}

/** POST: bookmark the job (idempotent). */
export async function POST(_req: Request, ctx: Ctx) {
  const t = await target(ctx);
  return t ? send(t, "POST") : notFound();
}

/** DELETE: remove the bookmark (idempotent). */
export async function DELETE(_req: Request, ctx: Ctx) {
  const t = await target(ctx);
  return t ? send(t, "DELETE") : notFound();
}
