import { prepareSession } from "@/lib/ent/consultant-ws/prepare-bff";

/** GET /api/orgs/{orgId}/consultant/prepare/{sessionId}: the state of each opening of one of the caller's own batches (404 for anyone else's). */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string; sessionId: string }> }) {
  const { orgId, sessionId } = await params;
  return prepareSession(orgId, sessionId);
}
