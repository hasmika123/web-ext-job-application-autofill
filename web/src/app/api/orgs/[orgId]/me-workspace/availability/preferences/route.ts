import { sendBody } from "../_bff/shared";

/** PUT /api/orgs/{orgId}/me-workspace/availability/preferences: work mode, notice, rate range (record only) and travel. */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return sendBody(request, params, "PUT", "/preferences");
}
