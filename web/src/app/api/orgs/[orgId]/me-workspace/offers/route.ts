import { offersCall } from "./_bff/shared";

/** GET /api/orgs/{orgId}/me-workspace/offers: the signed-in consultant's own Offers page (optional status / company / workMode / q / sort / page / size). */
export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return offersCall(params, "", {}, request, { query: true });
}
