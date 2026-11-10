import { matchesCall } from "./_bff/shared";

/** GET /api/orgs/{orgId}/me-workspace/matches: the signed-in consultant's own Job Matches page. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return matchesCall(params, "");
}
