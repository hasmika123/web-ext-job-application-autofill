import { readInbox } from "../_bff/shared";

/** GET /api/orgs/{orgId}/me-workspace/inbox/updates: applications the consultant's mail moved (company, role, stage). */
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return readInbox(params, "/updates");
}
