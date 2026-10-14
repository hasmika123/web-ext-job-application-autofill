import { prepCall } from "./_bff/shared";

/** GET /api/orgs/{orgId}/me-workspace/interview-prep: the signed-in consultant's own Interview Prep page. */
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return prepCall(params, "");
}
