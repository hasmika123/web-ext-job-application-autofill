import { forward } from "@/lib/resume-doc-proxy";

/** GET /api/account/exports/:id: one export job (the panel polls it while it is queued or running). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "Invalid export id." }, { status: 400 });
  return forward(`/api/account/exports/${id}`);
}
