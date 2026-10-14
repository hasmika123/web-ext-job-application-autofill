import { interviewsCall } from "./_bff/shared";

/** GET /api/orgs/{orgId}/me-workspace/interviews: the signed-in consultant's own Interviews page. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return interviewsCall(params, "");
}
