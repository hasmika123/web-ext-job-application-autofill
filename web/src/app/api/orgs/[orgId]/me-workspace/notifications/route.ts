import { getPage } from "./_bff/shared";

/** GET /api/orgs/{orgId}/me-workspace/notifications: the signed-in consultant's own Notifications page (optional status / category / priority / q / period / page / size). */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return getPage(params, request);
}
