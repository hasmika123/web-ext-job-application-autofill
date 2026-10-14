import { readInbox } from "../_bff/shared";

/** GET /api/orgs/{orgId}/me-workspace/inbox/suggestions: jobs the consultant's mail shows that their board does not track. */
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return readInbox(params, "/suggestions");
}
