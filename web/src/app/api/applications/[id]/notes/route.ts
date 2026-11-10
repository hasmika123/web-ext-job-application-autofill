import { badId, forwardJson, ID } from "@/lib/tracker-proxy";

/**
 * POST /api/applications/:id/notes - `{body, pinned?}` -> 201 the note. Spring refuses a never-collected
 * value (422 `SENSITIVE_CONTENT {path, class}`), an empty or too-long body (422 `TRACKER_INVALID`) and a full
 * application (422 `TRACKER_LIMIT`). Notes are read with the application (`GET /api/applications/:id`).
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return badId();
  return forwardJson(request, `/api/profile/applications/${id}/notes`, "POST");
}
