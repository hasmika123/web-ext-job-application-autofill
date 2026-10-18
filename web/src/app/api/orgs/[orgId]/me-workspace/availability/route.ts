import { getAvailability } from "./_bff/shared";

/** GET /api/orgs/{orgId}/me-workspace/availability: the signed-in consultant's own Availability page. */
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return getAvailability(params);
}
