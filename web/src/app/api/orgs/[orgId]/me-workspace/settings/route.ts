import { getSettings } from "./_bff/shared";

/** GET /api/orgs/{orgId}/me-workspace/settings: the signed-in consultant's own Settings page. */
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return getSettings(params);
}
