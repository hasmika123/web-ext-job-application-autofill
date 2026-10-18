import { putSettings } from "../_bff/shared";

/** PUT /api/orgs/{orgId}/me-workspace/settings/privacy: profile visibility and the three sharing switches. */
export async function PUT(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  return putSettings(request, params, "/privacy");
}
