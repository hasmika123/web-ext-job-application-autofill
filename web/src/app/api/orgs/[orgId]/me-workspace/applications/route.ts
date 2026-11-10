import { applicationsCall } from "./_bff/shared";

/** GET /api/orgs/{orgId}/me-workspace/applications?status=&sort=&page=&size=: the signed-in consultant's own My Applications page. */
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return applicationsCall(params, new URL(req.url).search);
}
