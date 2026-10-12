import { badId, forwardJson, ID } from "@/lib/tracker-proxy";

/**
 * POST /api/applications/:id/interviews - log an interview, body `{kind, startsAt, endsAt?, tz?, location?,
 * interviewer?, notes?}` -> 201 the interview (with its application's company and role). Spring refuses a
 * bad value with 422 `TRACKER_INVALID {path, message}`, a never-collected value in the free text with 422
 * `SENSITIVE_CONTENT {path, class}`, and a full application with 422 `TRACKER_LIMIT`. Interviews are read
 * with the application (`GET /api/applications/:id`) or as a range (`GET /api/interviews`).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return badId();
  return forwardJson(request, `/api/profile/applications/${id}/interviews`, "POST");
}
