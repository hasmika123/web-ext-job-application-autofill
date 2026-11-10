import { reviewUndo } from "../../../../inbox/_bff/review";

/** POST /api/orgs/{orgId}/me-workspace/applications/{applicationId}/inbox-undo/{eventId}: 409 UNDO_EXPIRED after the window. */
export async function POST(_request: Request, { params }: { params: Promise<{ orgId: string; applicationId: string; eventId: string }> }) {
  return reviewUndo(params);
}
