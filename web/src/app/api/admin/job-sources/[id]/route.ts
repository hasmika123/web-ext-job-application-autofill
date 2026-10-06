import { serverApiFetch } from "@/lib/api";
import { passthrough } from "../respond";

/** PUT /api/admin/job-sources/:id `{ enabled }` — switch a job board on or off (Phase 13.6a). */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ error: "Invalid board id." }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return Response.json({ error: "Say whether the board is on or off." }, { status: 400 });
  }
  let res: Response;
  try {
    res = await serverApiFetch(`/api/admin/job-sources/${id}`, { method: "PUT", body: JSON.stringify({ enabled: body.enabled }) });
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  return passthrough(res);
}
