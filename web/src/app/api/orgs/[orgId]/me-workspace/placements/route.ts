import { placementCall } from "./_bff/shared";

/** GET /api/orgs/{orgId}/me-workspace/placements: the signed-in consultant's own My Placement page. */
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return placementCall(params, "");
}
