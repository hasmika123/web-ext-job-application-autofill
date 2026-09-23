import { serverApiFetch } from "@/lib/api";

/** GET /api/applications/:id/mail — the emails about one application, newest first (Phase 14.4b). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "Invalid application id." }, { status: 400 });
  let res: Response;
  try {
    res = await serverApiFetch(`/api/profile/applications/${id}/mail`);
  } catch {
    return Response.json({ error: "Couldn't reach the server." }, { status: 502 });
  }
  if (!res.ok) return Response.json({ error: "Couldn't load the emails." }, { status: res.status === 404 ? 404 : 502 });
  return Response.json(await res.json().catch(() => []));
}
