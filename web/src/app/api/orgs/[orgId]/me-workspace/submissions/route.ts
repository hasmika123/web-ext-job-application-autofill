import { submissionsCall } from "./_bff/shared";

/** GET /api/orgs/{orgId}/me-workspace/submissions: the signed-in consultant's own Submissions and Approvals page (optional status / page / size). */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return submissionsCall(params, "", {}, request, { query: true });
}
