import { sendBody } from "../_bff/shared";

/** PUT /api/orgs/{orgId}/me-workspace/availability/status: forwarded to the API (it owns validation and the history row). */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return sendBody(request, params, "PUT", "/status");
}
