import { badId, forward, ID } from "@/lib/tracker-proxy";

/**
 * GET /api/interviews/:id/ics - the interview as a calendar file (`text/calendar`, with a VTIMEZONE for
 * the interview's zone). Served as an attachment named `interview-<id>.ics` so "Add to calendar" downloads
 * it; Spring answers 404 for an interview that is not the caller's.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return badId("interview");
  const res = await forward(`/api/profile/interviews/${id}/ics`);
  if (!res.ok) return res;
  return new Response(await res.text(), {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="interview-${id}.ics"`,
      "cache-control": "no-store",
    },
  });
}
